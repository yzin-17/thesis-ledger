import { InstrumentMultiSelect } from '../market-data/InstrumentMultiSelect.js';
import { Spinner } from '@/components/ui/spinner';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
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
import { getDesktopApiClient } from '../../shared/api/client.js';
import { Button } from '@/components/ui/button';
import { ArenaModelSelector } from './ArenaModelSelector.js';
import { ArenaSetupFields } from './ArenaSetupFields.js';
import { ArenaDetailHeader } from './ArenaDetailShell.js';
import { ArenaSections } from './ArenaSections.js';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useArenaSetupFeedback } from './useArenaSetupFeedback.js';
import { ArenaSetupIssue } from './ArenaSetupIssue.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
export function ArenaSetup({ owner }: { owner: string }) {
  const api = getDesktopApiClient(),
    navigate = useNavigate(),
    client = useQueryClient();
  const root = ['desktop', window.location.origin, owner, 'model-arenas'];
  const [form, setForm] = useState(arenaInitialForm),
    [currency, setCurrency] = useState<ArenaProtocol['budgetCurrency']>('USD');
  const [pool, setPool] = useState<ArenaChoice[]>([]),
    [models, setModels] = useState<ArenaBinding[]>([]),
    [names, setNames] = useState<Record<string, string>>({}),
    [error, setError] = useState('');
  const providers = useQuery({
    queryKey: [...root, 'bindings'],
    queryFn: ({ signal }) => api.aiProviders.list(signal),
  });
  const groups = useQuery({
    queryKey: [...root, 'groups'],
    queryFn: ({ signal }) => api.watchlist.list({ limit: 1 }, signal),
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
    onError: () => feedback.focusErrors(),
    onSuccess: async (r) => {
      await client.invalidateQueries({ queryKey: root });
      void navigate('/strategy/arena/' + r.id, { replace: true });
    },
  });
  const feedback = useArenaSetupFeedback(signature, validation.errors, save.error, save.variables?.signature, false), errors = feedback.errors;
  const choices = arenaModels(providers.data ?? []);
  return (
    <form ref={feedback.root} noValidate onSubmit={(event) => { event.preventDefault(); if (!save.isPending && !group.isPending && feedback.beginSubmit()) save.mutate({ ...input, signature }); }} className="grid min-w-0 gap-group text-sm">
      <ArenaDetailHeader title="新建日频比赛" backPath="/arena" />
      <ArenaSections>
      <section className="grid min-w-0 gap-4"><h2 className="text-xl font-semibold">标的池</h2>
      <ArenaSetupIssue label="标的池校验" error={errors.instruments || error || (group.error ? requestFailureMessage(group.error) : undefined)}>
      <InstrumentMultiSelect
        label="目录代码或名称"
        selected={pool.map((item) => ({ id: item.instrumentId, symbol: item.symbol, displayName: names[item.symbol] ?? item.symbol }))}
        onRemove={(id) => setPool(pool.filter((item) => item.instrumentId !== id))}
        accepts={(item) => Boolean(arenaChoice(item))}
        onSelect={(item) => {
          const choice = arenaChoice(item);
          if (!choice || !add([choice])) return false;
          setNames((previous) => ({ ...previous, [item.symbol]: item.displayName }));
          return true;
        }}
      />
      </ArenaSetupIssue>
      {groups.data?.groups.map((g) => (
        <Button
          variant="outline"
          disabled={group.isPending}
          onClick={() => group.mutate(g.id)}
          key={g.id}
        >
          导入分组 · {g.name}
        </Button>
      ))}
      </section>
      <section className="grid min-w-0 gap-4"><h2 className="text-xl font-semibold">参赛模型</h2>
      {providers.isError && <Button variant="outline" className="w-fit" onClick={() => void providers.refetch()}>重新读取模型配置</Button>}
      {providers.isSuccess && !choices.length && <p className="text-xs text-muted-foreground">请先在模型配置中验证模拟交易决策路由。</p>}
      <ArenaSetupIssue label="参赛模型校验" error={errors.models}>
        {(choices.length > 0 || models.length > 0) && <ArenaModelSelector choices={choices} value={models} onChange={setModels} />}
      </ArenaSetupIssue>
      </section>
      <section className="grid min-w-0 gap-4"><h2 className="text-xl font-semibold">赛制与额度</h2>
      <div className="flex items-center gap-2">
        模型费用币种{' '}
        <ToggleGroup aria-label="模型费用币种" value={[currency]} onValueChange={(values) => { if (values[0]) setCurrency(values[0] as typeof currency); }}>{(['USD', 'CNY', 'HKD'] as const).map((c) => <ToggleGroupItem key={c} value={c}>{c}</ToggleGroupItem>)}</ToggleGroup>
      </div>
      <ArenaSetupIssue label="模型费用币种校验" error={errors.budgetCurrency} />
      <ArenaSetupFields keys={arenaSetupFields.map(([key]) => key)} fields={arenaSetupFields} form={form} errors={errors} onChange={(key, value) => setForm((previous) => ({ ...previous, [key]: value }))} />
      </section></ArenaSections>
      <ArenaSetupIssue label="保存结果" error={errors.form || (feedback.requestError ? requestFailureMessage(feedback.requestError, '保存失败，请稍后重试。') : undefined)} />
      <Button type="submit" aria-busy={save.isPending} disabled={save.isPending || group.isPending}>
        {save.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
        保存比赛草稿
      </Button>
    </form>
  );
}
