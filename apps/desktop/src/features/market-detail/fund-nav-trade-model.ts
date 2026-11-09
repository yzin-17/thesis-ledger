import { DecimalValue } from '@thesis-ledger/domain';
import type { FundNavHistory, TradeChartMarker } from '@thesis-ledger/schemas';

export type FundNavTradeGroup = {
  id: string;
  date: string;
  side: TradeChartMarker['side'];
  trades: TradeChartMarker[];
};

/** 只对齐实际净值日期；同一成交的卖出分摊使用十进制精确合并。 */
export function fundNavTradeGroups(history: FundNavHistory, markers: readonly TradeChartMarker[]) {
  const dates = new Set(history.map((point) => point.navDate.slice(0, 10)));
  const executions = new Map<string, TradeChartMarker>();
  let unmatched = 0;
  for (const marker of markers) {
    if (!dates.has(marker.tradingDate)) {
      unmatched++;
      continue;
    }
    const key = JSON.stringify([
      marker.eventId,
      marker.factId,
      marker.side,
      marker.tradingDate,
      marker.occurredAt,
      marker.timePrecision,
      marker.price,
      marker.currency,
    ]);
    const previous = executions.get(key);
    executions.set(
      key,
      previous
        ? {
            ...previous,
            quantity: DecimalValue.from(previous.quantity).plus(marker.quantity).toString(),
          }
        : { ...marker },
    );
  }
  const groups = new Map<string, FundNavTradeGroup>();
  for (const trade of executions.values()) {
    const id = `fund-trade:${trade.tradingDate}:${trade.side}`;
    let group = groups.get(id);
    if (!group) {
      group = { id, date: trade.tradingDate, side: trade.side, trades: [] };
      groups.set(id, group);
    }
    group.trades.push(trade);
  }
  const result = [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
  result.forEach((group) =>
    group.trades.sort(
      (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    ),
  );
  return { groups: result, unmatched };
}
