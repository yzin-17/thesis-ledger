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
  type ArenaChoice,
  type ArenaBinding,
} from '@thesis-ledger/api-client';
import type { ArenaProtocol } from '@thesis-ledger/schemas';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileIdentity } from '../../app/query/use-mobile-identity';
import { Page, Section, Copy, Action, Field, QueryStatus } from '../../components/MobilePrimitives';
import { InstrumentPicker } from '../market/InstrumentPicker';
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
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const group = useMutation({
    mutationFn: (id: string) => copyArenaGroup(api, id),
    onSuccess: add,
  });
  const save = useMutation({
    mutationFn: () => saveArenaSetup(api, form, pool, models, currency),
    onSuccess: async (r) => {
      await client.invalidateQueries({ queryKey: root });
      navigation.replace('ModelArena', { match: r.id });
    },
  });
  const choices = arenaModels(providers.data ?? []);
  return (
    <Page title="新建模拟比赛">
      <InstrumentPicker
        purpose="browse"
        onConfirmed={(i) => {
          const c = arenaChoice(i);
          if (c) add([c]);
          else setError('请选择股票或 ETF');
        }}
      />
      <Section title="标的池">
        {groups.data?.groups.map((g) => (
          <Action
            key={g.id}
            label={'导入分组 · ' + g.name}
            disabled={group.isPending}
            onPress={() => group.mutate(g.id)}
          />
        ))}
        {pool.map((i) => (
          <Action
            key={i.instrumentId}
            label={'移除 ' + i.symbol}
            onPress={() => setPool(pool.filter((s) => s.instrumentId !== i.instrumentId))}
          />
        ))}
      </Section>
      <Section title="参赛模型">
        <QueryStatus query={providers} retry={() => void providers.refetch()} />
        {providers.isSuccess && !choices.length && <Copy>请先验证模拟交易决策路由。</Copy>}
        {choices.map((m) => {
          const has = models.some((s) => s.model === m.model && s.providerId === m.providerId);
          return (
            <Action
              key={JSON.stringify(m)}
              primary={has}
              label={m.providerId + ' / ' + m.model}
              onPress={() =>
                setModels(
                  has
                    ? models.filter((s) => s.model !== m.model || s.providerId !== m.providerId)
                    : [...models, m],
                )
              }
            />
          );
        })}
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
        {arenaSetupFields.map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={form[key]}
            onChange={(v) => setForm({ ...form, [key]: v })}
          />
        ))}
      </Section>
      {(error || group.error || save.error) && (
        <Copy>{error || group.error?.message || save.error?.message}</Copy>
      )}
      <Action
        label="保存比赛草稿"
        disabled={save.isPending || group.isPending}
        onPress={() => save.mutate()}
      />
    </Page>
  );
}
