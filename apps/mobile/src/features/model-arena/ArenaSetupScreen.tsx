import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  arenaInitialForm,
  arenaSetupFields,
  arenaModels,
  arenaMerge,
  arenaChoice,
  copyArenaGroup,
  saveArenaSetup,
  validateArenaSetup,
  type ArenaChoice,
  type ArenaBinding,
} from '@thesis-ledger/api-client';
import type { ArenaProtocol } from '@thesis-ledger/schemas';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileIdentity } from '../../app/query/use-mobile-identity';
import { Page, ContentSection as Section, Copy, Action, Field, Feedback, QueryStatus, failureMessage } from '../../components/MobilePrimitives';
import { InstrumentPicker } from '../market/InstrumentPicker';
import { ArenaModelSelector } from './ArenaModelSelector';
import { useArenaSetupFeedback } from './useArenaSetupFeedback';
type Props = NativeStackScreenProps<StrategyStackParams, 'ArenaSetup'>;
export function ArenaSetupScreen({ navigation }: Props) {
  const identity = useMobileIdentity(),
    owner = identity.data?.principal?.id;
  return owner ? (
    <Setup key={owner} owner={owner} navigation={navigation} />
  ) : (
    <Page title="新建模拟比赛">
      <QueryStatus query={identity} retry={() => void identity.refetch()} />
    </Page>
  );
}
function Setup({ owner, navigation }: { owner: string; navigation: Props['navigation'] }) {
  const { api, scope } = useMobileRuntime(),
    client = useQueryClient();
  const [form, setForm] = useState(arenaInitialForm),
    [currency, setCurrency] = useState<ArenaProtocol['budgetCurrency']>('USD'),
    [pool, setPool] = useState<ArenaChoice[]>([]),
    [names, setNames] = useState<Record<string, string>>({}),
    [models, setModels] = useState<ArenaBinding[]>([]),
    [error, setError] = useState('');
  const root = [...scope, 'arena', owner];
  const groups = useQuery({
    queryKey: [...root, 'groups'],
    queryFn: ({ signal }) => api.watchlist.list({ limit: 1 }, signal),
  });
  const providers = useQuery({
    queryKey: [...root, 'bindings'],
    queryFn: ({ signal }) => api.aiProviders.list(signal),
  });
  const add = (items: ArenaChoice[]) => {
    try {
      setPool(arenaMerge(pool, items));
      setError('');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const group = useMutation({
    mutationFn: (id: string) => copyArenaGroup(api, id, (symbol, name) => setNames((previous) => ({ ...previous, [symbol]: name }))),
    onSuccess: add,
  });
  const input = { form, pool, models, currency }, signature = JSON.stringify(input);
  const validation = validateArenaSetup(form, pool, models, currency);
  const save = useMutation({
    mutationFn: (value: typeof input & { signature: string }) => saveArenaSetup(api, value.form, value.pool, value.models, value.currency),
    onSuccess: async (r) => {
      await client.invalidateQueries({ queryKey: root });
      navigation.replace('ModelArena', { match: r.id });
    },
  });
  const feedback = useArenaSetupFeedback(signature, validation.errors, save.error, save.variables?.signature, false), errors = feedback.errors;
  const choices = arenaModels(providers.data ?? []);
  return (
    <Page title="新建模拟比赛">
      <InstrumentPicker
        purpose="browse"
        accepts={(item) => Boolean(arenaChoice(item))}
        selection={{
          items: pool.map((item) => ({ id: item.instrumentId, symbol: item.symbol, displayName: names[item.symbol] ?? item.symbol })),
          onRemove: (id) => setPool(pool.filter((item) => item.instrumentId !== id)),
        }}
        onConfirmed={(i) => {
          const c = arenaChoice(i);
          if (!c || !add([c])) return false;
          setNames((previous) => ({ ...previous, [i.symbol]: i.displayName }));
          return true;
        }}
      />
      <Section title="标的池">
        <Feedback error message={errors.instruments || error || (group.error ? failureMessage(group.error) : null)} />
        {groups.data?.groups.map((g) => (
          <Action
            key={g.id}
            label={'导入分组 · ' + g.name}
            disabled={group.isPending}
            onPress={() => group.mutate(g.id)}
          />
        ))}
      </Section>
      <Section title="参赛模型">
        <QueryStatus query={providers} retry={() => void providers.refetch()} />
        {providers.isSuccess && !choices.length && <Copy>请先验证模拟交易决策路由。</Copy>}
        {(choices.length > 0 || models.length > 0) && <ArenaModelSelector choices={choices} value={models} onChange={setModels} />}
        <Feedback error message={errors.models} />
      </Section>
      <Section title="赛制与额度">
        {(['USD', 'CNY', 'HKD'] as const).map((c) => (
          <Action
            key={c}
            primary={c === currency}
            label={'模型费用币种 ' + c}
            onPress={() => setCurrency(c)}
          />
        ))}
        <Feedback error message={errors.budgetCurrency} />
        {arenaSetupFields.map(([key, label]) => (
          <Field
            key={key}
            label={label}
            error={errors[key]}
            value={form[key]}
            onChange={(v) => setForm({ ...form, [key]: v })}
          />
        ))}
      </Section>
      <Feedback error message={errors.form || (feedback.requestError ? failureMessage(feedback.requestError) : null)} />
      <Action
        label="保存比赛草稿"
        disabled={save.isPending || group.isPending}
        onPress={() => { if (feedback.beginSubmit()) save.mutate({ ...input, signature }); }}
      />
    </Page>
  );
}
