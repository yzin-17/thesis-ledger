import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { useSyncExternalStore } from 'react';
import { ArenaSetup } from './ArenaSetup.js';
import { TableContainer } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router';
import {
  arenaCostLabel,
  arenaRatio,
  arenaActionLabel,
  arenaStatusLabel,
} from '@thesis-ledger/domain';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';

export function ArenaPage() {
  const location = useLocation();
  const historyState: unknown = location.state;
  let origin: string | undefined;
  if (
    historyState &&
    typeof historyState === 'object' &&
    'arenaReturn' in historyState &&
    typeof historyState.arenaReturn === 'string' &&
    /^\/(?!\/)/.test(historyState.arenaReturn) &&
    !historyState.arenaReturn.includes('\\')
  )
    origin = historyState.arenaReturn;
  const entrant = location.hash.startsWith('#model-') ? location.hash.slice(7) : null;
  const { match, round } = useParams();
  const api = getDesktopApiClient().modelArenas;
  const owner = useSyncExternalStore(
    subscribeIdentitySession,
    () => currentIdentitySession()?.principal.id ?? 'local-workspace',
  );
  const client = useQueryClient();
  const scope = ['desktop', window.location.origin, owner, 'model-arenas'];
  const list = useQuery({
    queryKey: [...scope, 'list'],
    queryFn: ({ signal }) => api.list(signal),
    enabled: !match,
  });
  const detail = useQuery({
    queryKey: [...scope, match],
    queryFn: ({ signal }) => api.get(match!, signal),
    enabled: !!match && match !== 'new',
  });
  const report = useQuery({
    queryKey: [...scope, match, round],
    queryFn: ({ signal }) => api.round(match!, round!, signal),
    enabled: !!match && !!round,
  });
  const comparison = useQuery({
    queryKey: [...scope, match, 'comparison'],
    enabled: !!match && match !== 'new' && !round,
    queryFn: ({ signal }) => api.compare(match!, {}, signal),
  });
  const transition = useMutation({
    mutationFn: (action: 'start' | 'pause' | 'end') => api.transition(match!, action),
    onSettled: () => client.invalidateQueries({ queryKey: scope }),
  });
  if (match === 'new') return <ArenaSetup key={owner} owner={owner} />;
  const selected = detail.data;
  let active: typeof list | typeof detail | typeof report = list;
  if (round) active = report;
  else if (match) active = detail;
  let refreshLabel = '正在刷新比赛列表';
  if (round) refreshLabel = '正在刷新比赛轮次';
  else if (match) refreshLabel = '正在刷新比赛详情';
  const path = '/strategy/arena';
  const defaultBackLabel = round ? '返回比赛' : '返回比赛列表';
  return (
    <section className="grid gap-3">
      {match && (
        <Link to={origin ?? (round ? path + '/' + match : path)}>
          {origin ? '返回来源页' : defaultBackLabel}
        </Link>
      )}
      <h2 className="text-xl font-semibold">{selected?.protocol.title ?? '模型竞技场'}</h2>
      {!match && <Link to={path + '/new'}>新建模拟比赛</Link>}
      {active.isError && (
        <button type="button" onClick={() => void active.refetch()}>
          读取失败，重新读取
        </button>
      )}
      {active.isPending && <LoadingState label="正在读取比赛" />}
      <ListRefreshRegion
        refreshing={
          Boolean(active.data) && (active.isFetching || detail.isFetching || comparison.isFetching)
        }
        label={refreshLabel}
        className={match ? 'grid min-h-8 gap-3' : 'grid min-h-8 gap-2'}
      >
        {!match && list.data?.length === 0 && <p>暂无比赛</p>}
        {!match &&
          list.data?.map((m) => (
            <Link key={m.id} to={path + '/' + m.id}>
              {m.protocol.title} · {arenaStatusLabel(m.state)} · {m.protocol.startsOn} 至{' '}
              {m.protocol.endsOn}
            </Link>
          ))}
        {match && !round && selected && (
          <>
            <p>
              {arenaStatusLabel(selected.state)} · 总额度剩余 {selected.remaining.requests} 次请求 ·{' '}
              {selected.remaining.tokens} 个模型词元
            </p>
            {selected.entrants.map((e) => (
              <p key={e.id}>
                {e.providerId} / {e.model} · 模拟现金 {e.cash} {selected.protocol.currency} · 剩余{' '}
                {e.remaining.requests} 次请求
              </p>
            ))}
            <p>
              模型费用总额度 {selected.protocol.budget.costMicros / 1000000}{' '}
              {selected.protocol.budgetCurrency} · 剩余 {selected.remaining.costMicros / 1000000}{' '}
              {selected.protocol.budgetCurrency}
            </p>
            <div className="flex gap-2">
              {(selected.state === 'draft' || selected.state === 'paused') && (
                <Button disabled={transition.isPending} onClick={() => transition.mutate('start')}>
                  按上述预算启动自动比赛
                </Button>
              )}
              {selected.state === 'running' && (
                <Button disabled={transition.isPending} onClick={() => transition.mutate('pause')}>
                  暂停比赛
                </Button>
              )}
              {selected.state === 'paused' && (
                <Button disabled={transition.isPending} onClick={() => transition.mutate('end')}>
                  结束本场比赛
                </Button>
              )}
            </div>
            {transition.error && <p role="alert">{transition.error.message}</p>}
            <Link to={'/journal/model-weeklies/' + match}>模型周报</Link>
            <h3>比赛表现</h3>
            {comparison.isError && (
              <button onClick={() => void comparison.refetch()}>比较数据读取失败，重试</button>
            )}
            {comparison.data && (
              <>
                <p>
                  {comparison.data.start} 至 {comparison.data.end} · 已开轮 {comparison.data.opened}{' '}
                  / {comparison.data.planned}
                </p>
                <TableContainer>
                  <table>
                    <thead>
                      <tr>
                        {[
                          '参赛模型或基准',
                          '名次',
                          '收盘净值',
                          '收益',
                          '最大回撤',
                          '换手',
                          '交易费',
                        ].map((s) => (
                          <th key={s} className="px-2 text-start">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.data.rows.map((r) => (
                        <tr key={r.id}>
                          {[
                            r.label,
                            r.rank ?? '—',
                            r.metrics.endNav ?? '资料不足',
                            arenaRatio(r.metrics.returnRatio),
                            arenaRatio(r.metrics.drawdown),
                            arenaRatio(r.metrics.turnover),
                            r.metrics.tradeFees ?? '资料不足',
                          ].map((s, i) => (
                            <td key={i} className="px-2">
                              {s}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableContainer>
              </>
            )}
            <h3>最近轮次</h3>
            {!selected.rounds.length && <p>暂无轮次</p>}
            {selected.rounds.map((r) => (
              <Link key={r.id} to={path + '/' + match + '/' + r.id}>
                {r.tradingDate} · {arenaStatusLabel(r.outcome.state)}{' '}
                {r.outcome.state === 'unopened' && arenaStatusLabel(r.outcome.reason)}
              </Link>
            ))}
          </>
        )}
        {round && report.data && (
          <>
            <h3>{report.data.tradingDate} 轮次</h3>
            {report.data.entries.length === 0 && <p>该轮没有模型决策。</p>}
            {report.data.entries
              .filter((e) => !entrant || e.entrantId === entrant)
              .map((e) => (
                <article
                  id={'model-' + e.entrantId}
                  key={e.entrantId}
                  className="grid gap-1 border-b py-2"
                >
                  <h4>
                    {e.providerId} / {e.model} · {arenaStatusLabel(e.state)}
                  </h4>
                  {e.decision?.actions.map((a) => (
                    <div key={a.symbol}>
                      <strong>
                        {a.symbol} · {arenaActionLabel(a)}
                      </strong>
                      <p>{a.reason}</p>
                      <p>失效条件 · {a.invalidatedBy}</p>
                      {a.references.map((ref) => {
                        const fact = report.data.facts.find((f) => f.ref === ref);
                        return (
                          fact && (
                            <p key={ref}>
                              {fact.symbol} · {fact.date} ·{' '}
                              {fact.kind === 'daily_bar' ? '收盘 ' + fact.close : fact.title}
                            </p>
                          )
                        );
                      })}
                    </div>
                  ))}
                  {e.requestId && (
                    <p>
                      模型费用 {arenaCostLabel(e)} · 请求 {e.requestId}
                    </p>
                  )}
                  {Object.entries(e.executionReasons).map(([symbol, reason]) => (
                    <p key={symbol}>
                      {symbol} · {arenaStatusLabel(reason)}
                    </p>
                  ))}
                  {e.fills.map((f) => (
                    <p key={f.symbol}>
                      {f.executedAt.slice(0, 10)} · {f.symbol} · 模拟
                      {f.side === 'buy' ? '买入' : '卖出'} {f.quantity} 股 × {f.price} · 费用{' '}
                      {f.fee}
                    </p>
                  ))}
                </article>
              ))}
          </>
        )}
      </ListRefreshRegion>
    </section>
  );
}
