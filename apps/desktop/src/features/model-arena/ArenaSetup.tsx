import { InstrumentSymbolField } from '../market-data/InstrumentSymbolField.js';
import { Spinner } from '@/components/ui/spinner';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router';
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
import { getDesktopApiClient } from '../../shared/api/client.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function ArenaSetup({ owner }: { owner: string }) {
  const api = getDesktopApiClient(),
    navigate = useNavigate(),
    client = useQueryClient();
  const root = ['desktop', window.location.origin, owner, 'model-arenas'];
  const [form, setForm] = useState(arenaInitialForm),
    [currency, setCurrency] = useState<ArenaProtocol['budgetCurrency']>('USD');
  const [pool, setPool] = useState<ArenaChoice[]>([]),
    [models, setModels] = useState<ArenaBinding[]>([]),
    [text, setText] = useState(''),
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
      void navigate('/strategy/arena/' + r.id, { replace: true });
    },
  });
  const choices = arenaModels(providers.data ?? []);
  return (
    <section className="grid max-w-3xl gap-3">
      <Link to="/strategy/arena">返回比赛列表</Link>
      <h2>新建模拟比赛</h2>
      <h3>标的池</h3>
      <InstrumentSymbolField
        aria-label="目录代码或名称"
        value={text}
        onChange={setText}
        accepts={(item) => Boolean(arenaChoice(item))}
        onSelect={(item) => {
          const choice = arenaChoice(item);
          if (choice) add([choice]);
        }}
      />
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
      {pool.map((i) => (
        <Button
          variant="ghost"
          key={i.instrumentId}
          onClick={() => setPool(pool.filter((s) => s.instrumentId !== i.instrumentId))}
        >
          移除 {i.symbol}
        </Button>
      ))}
      <h3>参赛模型</h3>
      {providers.isError && <p>模型配置读取失败</p>}
      {providers.isSuccess && !choices.length && <p>请先在模型配置中验证模拟交易决策路由。</p>}
      {choices.map((m) => {
        const has = models.some((s) => s.model === m.model && s.providerId === m.providerId);
        return (
          <Button
            key={JSON.stringify(m)}
            aria-pressed={has}
            variant={has ? 'default' : 'outline'}
            onClick={() =>
              setModels(
                has
                  ? models.filter((s) => s.model !== m.model || s.providerId !== m.providerId)
                  : [...models, m],
              )
            }
          >
            {m.providerId} / {m.model}
          </Button>
        );
      })}
      <h3>赛制与额度</h3>
      <div className="flex items-center gap-2">
        模型费用币种{' '}
        {(['USD', 'CNY', 'HKD'] as const).map((c) => (
          <Button
            key={c}
            aria-pressed={c === currency}
            variant={c === currency ? 'default' : 'outline'}
            onClick={() => setCurrency(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {arenaSetupFields.map(([key, label]) => (
          <div key={key}>
            <span>{label}</span>
            <Input
              aria-label={label}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      {(error || group.error || save.error) && (
        <p role="alert">{error || group.error?.message || save.error?.message}</p>
      )}
      <Button aria-busy={save.isPending} disabled={save.isPending || group.isPending} onClick={() => save.mutate()}>
        {save.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
        保存比赛草稿
      </Button>
    </section>
  );
}
