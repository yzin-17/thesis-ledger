import { DecimalValue as D } from './decimal.js';
import type { BacktestDailyOrder, BacktestOrderPhase } from './backtest-order-contract.js';

export interface BacktestDailyBar {
  key: string;
  index: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

/** 只选择约定的日线模拟基价；资金、费用和市场规则由成交接缝处理。 */
export function backtestDailyOrderPrice(
  order: BacktestDailyOrder,
  bar: BacktestDailyBar,
  phase: BacktestOrderPhase,
): string | undefined {
  const instruction = order.price;
  if (instruction.kind === 'market') return phase === 'open' ? bar.open : undefined;
  const price = D.from(instruction.price);
  const open = D.from(bar.open);
  const buy = order.side === 'buy';
  if (instruction.kind === 'limit') {
    if (phase === 'open') {
      if ((buy && open.compareTo(price) <= 0) || (!buy && open.compareTo(price) >= 0))
        return bar.open;
    } else if (
      (buy && D.from(bar.low).compareTo(price) <= 0) ||
      (!buy && D.from(bar.high).compareTo(price) >= 0)
    )
      return instruction.price;
    return undefined;
  }
  if (order.triggeredAt) {
    if (phase === 'open') return bar.open;
    if (order.triggeredAt.barIndex === bar.index && order.triggeredAt.phase === 'range')
      return instruction.price;
    return undefined;
  }
  if (phase === 'open') {
    if ((buy && open.compareTo(price) >= 0) || (!buy && open.compareTo(price) <= 0))
      return bar.open;
  } else if (
    (buy && D.from(bar.high).compareTo(price) >= 0) ||
    (!buy && D.from(bar.low).compareTo(price) <= 0)
  )
    return instruction.price;
  return undefined;
}

export function compareBacktestDailyOrders(left: BacktestDailyOrder, right: BacktestDailyOrder) {
  const priority = (order: BacktestDailyOrder) => {
    if (order.action.kind === 'stopLoss') return 0;
    if (order.action.kind === 'exit') return 1;
    if (order.side === 'sell') return 2;
    return 3;
  };
  const rank = priority(left) - priority(right);
  if (rank) return rank;
  const market = (order: BacktestDailyOrder) =>
    order.price.kind === 'market' ||
    (order.price.kind === 'stopMarket' && Boolean(order.triggeredAt));
  if (market(left) !== market(right)) return market(left) ? -1 : 1;
  if (left.price.kind === 'limit' && right.price.kind === 'limit' && left.side === right.side) {
    const price = D.from(left.price.price).compareTo(right.price.price);
    if (price) return left.side === 'buy' ? -price : price;
  }
  return left.acceptedSequence - right.acceptedSequence || left.id.localeCompare(right.id);
}
