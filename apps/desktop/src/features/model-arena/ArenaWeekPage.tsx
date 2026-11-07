import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { PageHeader } from '../shared/PageHeader.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { LoadingState } from '@/components/ui/spinner';
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router';
import {
  arenaObservationLabel,
  arenaCostLabel,
  arenaRatio,
  arenaStatusLabel,
} from '@thesis-ledger/domain';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';

export function ArenaWeekPage() {
  const origin = useLocation();
  const back = { arenaReturn: origin.pathname + origin.search };
  const { match, id } = useParams();
  const api = getDesktopApiClient().modelArenas;
  const owner = useSyncExternalStore(
    subscribeIdentitySession,
    () => currentIdentitySession()?.principal.id ?? 'local-workspace',
  );
  const root = ['desktop', window.location.origin, owner, 'model-weeklies', match];
  const list = useQuery({
    queryKey: [...root, 'list'],
    enabled: !id,
    queryFn: ({ signal }) => api.weeklies(match, signal),
  });
  const item = useQuery({
    queryKey: [...root, id],
    enabled: !!match && !!id,
    queryFn: ({ signal }) => api.weekly(match!, id!, signal),
  });
  const query = id ? item : list,
    report = item.data?.report;
  return (
    <section className="grid gap-card">
      <Link to={id ? '/journal/model-weeklies/' + match : '/journal'}>
        {id ? '返回周报列表' : '返回投资复盘'}
      </Link>
      <PageHeader
        eyebrow="WEEKLY MODEL REPORTS"
        title="模型周报"
        actions={
          <RefreshIconButton
            label="刷新模型周报"
            refreshing={query.isFetching}
            onClick={() => void query.refetch()}
          />
        }
      />
      {query.isPending && <LoadingState label="正在读取周报" />}
      {query.isError && <button onClick={() => void query.refetch()}>读取失败，重新读取</button>}
      <ListRefreshRegion
        refreshing={query.isRefetching && Boolean(query.data)}
        label={id ? '正在刷新周报详情' : '正在刷新周报列表'}
        className={id ? 'grid min-h-8 gap-card' : 'grid min-h-8 gap-2'}
      >
        {!id && list.data?.length === 0 && <p>暂无已发布的周报</p>}
        {!id &&
          list.data?.map((w) => (
            <Link key={w.id} to={'/journal/model-weeklies/' + w.arenaId + '/' + w.id}>
              {w.title} · {w.week} 当周 · 第 {w.revision} 版
            </Link>
          ))}
        {item.data && report && (
          <>
            <h2>
              {item.data.title} · {report.week} 当周 · 第 {item.data.revision} 版
            </h2>
            <p>
              {report.comparison.start} 至 {report.comparison.end} · {report.timeZone} · 已开轮{' '}
              {report.comparison.opened} / {report.comparison.planned}
            </p>
            {report.comparison.rows.map((r) => (
              <p key={r.id}>
                {r.label} · 期初 {r.metrics.startNav ?? '资料不足'} · 期末{' '}
                {r.metrics.endNav ?? '资料不足'} {report.comparison.currency} · 收益{' '}
                {arenaRatio(r.metrics.returnRatio)} · 回撤 {arenaRatio(r.metrics.drawdown)} · 换手{' '}
                {arenaRatio(r.metrics.turnover)} · 交易费 {r.metrics.tradeFees ?? '资料不足'}{' '}
                {r.kind === 'model' &&
                  ' · 决策覆盖 ' +
                    (report.comparison.opened
                      ? r.decisions + '/' + report.comparison.opened
                      : '不适用')}
              </p>
            ))}
            <h3>盈亏贡献</h3>
            {report.attribution.map((a) => (
              <p key={a.entrantId}>
                {report.comparison.rows.find((r) => r.id === a.entrantId)?.label} ·{' '}
                {a.symbols.map((s) => s.symbol + ' ' + s.amount).join('，')} · 费用 {a.fees} ·
                未归属 {a.residual ?? '资料不足'}
              </p>
            ))}
            <h3>同轮仓位分歧</h3>
            {!report.divergences.length && <p>本周无可比较的仓位分歧</p>}
            {report.divergences.map((d) => (
              <Link
                state={back}
                key={d.roundId + d.symbol}
                to={'/strategy/arena/' + match + '/' + d.roundId}
              >
                {d.day} · {d.symbol} · 仓位相差 {Number(d.spreadBps) / 100} 个百分点
              </Link>
            ))}
            <details>
              <summary>决策后的价格观察（{report.observations.length}）</summary>
              {report.observations.map((o) => (
                <p key={o.roundId + o.symbol + o.window}>
                  {o.day} · {o.symbol} · {o.window} 个交易日 · {arenaObservationLabel(o)}
                </p>
              ))}
            </details>
            {report.laterNews.length > 0 && (
              <details>
                <summary>决策后收录的标的资讯</summary>
                {report.laterNews.map((n) => (
                  <p key={n.roundId + n.ref}>
                    {n.publishedAt.slice(0, 10)} · {n.symbol} · {n.title}
                  </p>
                ))}
              </details>
            )}
            <h3>本周决策</h3>
            {report.rounds.map((r) => (
              <div key={r.id}>
                <Link state={back} to={'/strategy/arena/' + match + '/' + r.id}>
                  {r.day} · {arenaStatusLabel(r.state)} {r.reason && arenaStatusLabel(r.reason)}
                </Link>
                {r.entries.map((e) => (
                  <Link
                    className="block"
                    key={e.entrantId}
                    state={back}
                    to={'/strategy/arena/' + match + '/' + r.id + '#model-' + e.entrantId}
                  >
                    {e.model} · {arenaStatusLabel(e.state)} · 模型费用 {arenaCostLabel(e)}
                  </Link>
                ))}
              </div>
            ))}
            <h3>本周模拟成交</h3>
            {!report.fills.length && <p>本周无模拟成交</p>}
            {report.fills.map((f) => (
              <Link
                state={back}
                key={f.id}
                to={'/strategy/arena/' + match + '/' + f.roundId + '#model-' + f.entrantId}
              >
                {f.executedAt.slice(0, 10)} · {f.symbol} · {f.side === 'buy' ? '买入' : '卖出'}{' '}
                {f.quantity} 股 × {f.price} · 费用 {f.fee}
              </Link>
            ))}
          </>
        )}
      </ListRefreshRegion>
    </section>
  );
}
