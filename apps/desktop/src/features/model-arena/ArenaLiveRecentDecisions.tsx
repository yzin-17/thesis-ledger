import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { formatDecimalNumber } from '@thesis-ledger/domain';
import { Button } from '@/components/ui/button';
import { formatDateTimeWithLocalZone } from '@/lib/date-display';

export function selectRecentArenaDecisions(detail: ArenaLiveDetail, limit = 4) {
  return detail.agents
    .flatMap((agent) =>
      agent.cycles.filter((cycle) => cycle.decision !== null).map((cycle) => ({ agent, cycle })),
    )
    .sort(
      (a, b) =>
        (b.cycle.asOf ?? b.cycle.createdAt).localeCompare(a.cycle.asOf ?? a.cycle.createdAt) ||
        b.cycle.id.localeCompare(a.cycle.id),
    )
    .slice(0, limit);
}

export function ArenaLiveRecentDecisions({
  detail,
  onOpenDecision,
}: {
  detail: ArenaLiveDetail;
  onOpenDecision: (agentId: string) => void;
}) {
  const recent = selectRecentArenaDecisions(detail);
  const name = (symbol: string) =>
    detail.instrumentDirectory[symbol]
      ? detail.instrumentDirectory[symbol] + ' · ' + symbol
      : symbol;

  return (
    <section className="grid min-w-0 content-start gap-3" aria-label="最近模型决策">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">最近模型决策</h2>
        {recent.length > 0 && (
          <span className="text-xs text-muted-foreground">最近 {recent.length} 条</span>
        )}
      </div>
      {recent.length === 0 ? (
        <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
          暂无已生成的模型决策，研究完成后将在这里展示。
        </p>
      ) : (
        <div className="min-w-0 divide-y divide-border overflow-hidden rounded-md border border-border">
          {recent.map(({ agent, cycle }) => {
            const decision = cycle.decision!;
            return (
              <article key={agent.id + ':' + cycle.id} className="grid min-w-0 gap-2 p-3">
                <header className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={agent.model}>
                      {agent.model}
                    </p>
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={cycle.asOf ?? cycle.createdAt}
                    >
                      {formatDateTimeWithLocalZone(cycle.asOf ?? cycle.createdAt)}
                    </time>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => onOpenDecision(agent.id)}
                  >
                    查看详情
                  </Button>
                </header>
                <p
                  className="line-clamp-2 text-sm whitespace-pre-wrap wrap-anywhere"
                  title={decision.summary}
                >
                  {decision.summary}
                </p>
                <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {decision.orders.length > 0 ? (
                    <>
                      {decision.orders.slice(0, 2).map((order) => (
                        <span
                          key={order.clientId}
                          className="max-w-full truncate"
                          title={name(order.symbol)}
                        >
                          {order.side === 'buy' ? '买入' : '卖出'} {name(order.symbol)}
                          {' · '}
                          {formatDecimalNumber(order.quantity)}
                        </span>
                      ))}
                      {decision.orders.length > 2 && (
                        <span>共 {decision.orders.length} 笔委托</span>
                      )}
                    </>
                  ) : (
                    <span>本次未新增委托</span>
                  )}
                  {decision.cancelOrderIds.length > 0 && (
                    <span>撤销 {decision.cancelOrderIds.length} 笔委托</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
