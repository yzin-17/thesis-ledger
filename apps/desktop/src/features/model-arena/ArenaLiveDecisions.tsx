import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { arenaAppointmentLabel, arenaLiveLabel, formatDecimalNumber } from '@thesis-ledger/domain';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { formatDateTimeWithLocalZone } from '@/lib/date-display';
import { arenaResearchFailureDetail } from './arena-live-failure.js';
import { ArenaDisclosure } from './ArenaDisclosure.js';

export function ArenaLiveDecisions({ detail, agentId }: { detail: ArenaLiveDetail; agentId: string }) {
  const [params, setParams] = useSearchParams();
  const agent = detail.agents.find((a) => a.id === agentId);
  const cycles = [...(agent?.cycles ?? [])].sort((a, b) => (b.asOf ?? b.createdAt).localeCompare(a.asOf ?? a.createdAt) || b.id.localeCompare(a.id));
  const pages = Math.max(1, Math.ceil(cycles.length / 10));
  const requested = Number(params.get('decisionPage') ?? 1);
  const page = Number.isSafeInteger(requested) ? Math.min(pages, Math.max(1, requested)) : 1;
  const changePage = (value: number) => setParams((current) => { current.set('decisionPage', String(value)); return current; });
  const time = (at: string) => formatDateTimeWithLocalZone(at);
  const name = (symbol: string) => detail.instrumentDirectory[symbol] ? detail.instrumentDirectory[symbol] + ' · ' + symbol : symbol;
  return <section className="grid min-w-0 gap-5">
    <div className="grid gap-1"><h2 className="text-xl font-semibold">历史决策</h2><p className="text-xs text-muted-foreground">按研究时间倒序展示。当前可查看全场最近 200 次研究中的记录。</p></div>
    {!cycles.length && <p className="text-sm text-muted-foreground">该模型在最近的研究记录中暂无历史决策。</p>}
    <div className="grid divide-y divide-border">{cycles.slice((page - 1) * 10, page * 10).map((cycle) => <article key={cycle.id} className="grid min-w-0 gap-3 py-5 first:pt-0">
      <header className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{arenaLiveLabel(cycle.state)}</strong><span className="text-xs text-muted-foreground">{time(cycle.asOf ?? cycle.createdAt)}</span></header>
      {cycle.decision ? <>
        <p className="text-sm whitespace-pre-wrap wrap-anywhere">{cycle.decision.summary}</p>
        <div className="grid gap-2 text-sm">
          {cycle.decision.orders.map((order) => <p key={order.clientId}>{order.side === 'buy' ? '买入' : '卖出'} {name(order.symbol)} · {formatDecimalNumber(order.quantity)} · {arenaLiveLabel(order.kind)}{order.price && ' ' + formatDecimalNumber(order.price)}</p>)}
          {!cycle.decision.orders.length && <p className="text-xs text-muted-foreground">本次未新增委托</p>}
          {cycle.decision.cancelOrderIds.length > 0 && <p>撤销委托 · {cycle.decision.cancelOrderIds.length} 笔</p>}
          {cycle.decision.wakeups.map((wakeup, index) => <p key={index} className="wrap-anywhere">{wakeup.kind === 'time' ? '预约时间 · ' + time(wakeup.at) : arenaAppointmentLabel(wakeup, name)}</p>)}
          {cycle.decision.watchedSymbols.length > 0 && <p className="text-xs text-muted-foreground wrap-anywhere">观察标的：{cycle.decision.watchedSymbols.map(name).join('、')}</p>}
        </div>
      </> : <p className="text-sm text-muted-foreground">{cycle.state === 'running' || cycle.state === 'pending' ? '研究尚未完成' : '本次研究未形成决策'}</p>}
      {cycle.reason && <p className="text-sm wrap-anywhere">{arenaLiveLabel(cycle.reason)}</p>}
      {arenaResearchFailureDetail(cycle.reason, cycle.usage) && <p role="alert" className="text-sm text-muted-foreground wrap-anywhere">{arenaResearchFailureDetail(cycle.reason, cycle.usage)}</p>}
      {cycle.requestId && <ArenaDisclosure title="调用与资料审计"><pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap wrap-anywhere">{JSON.stringify(cycle.usage, null, 2)}</pre></ArenaDisclosure>}
    </article>)}</div>
    {cycles.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">共 {cycles.length} 条研究</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => changePage(page - 1)}>上一页</Button><span>第 {page} / {pages} 页</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => changePage(page + 1)}>下一页</Button></div></div>}
  </section>;
}
