import { DecimalValue as D } from './decimal.js';
import type { BacktestDailyOrder, BacktestOrderPoint } from './backtest-order-contract.js';
import {
  backtestOrderTerminal,
  endBacktestOrder,
  updateBacktestProtection,
} from './backtest-order-state.js';

export function backtestParentRemaining(parent: BacktestDailyOrder, exits: Record<string, string>) {
  return D.from(parent.filledQuantity).minus(exits[parent.id] ?? '0');
}

export function allocateBacktestExit(
  orders: readonly BacktestDailyOrder[],
  order: BacktestDailyOrder,
  quantity: string,
  exits: Record<string, string>,
  availableForParent?: (parent: BacktestDailyOrder) => string,
) {
  let remaining = D.from(quantity);
  const next = { ...exits };
  const parents = orders
    .filter(
      (p) =>
        p.side === 'buy' &&
        p.cycleId === order.cycleId &&
        (!order.parent || p.id === order.parent.orderId),
    )
    .sort((a, b) => a.acceptedSequence - b.acceptedSequence);
  for (const parent of parents) {
    let available = backtestParentRemaining(parent, next);
    if (availableForParent) {
      const settled = D.from(availableForParent(parent));
      if (settled.compareTo(available) < 0) available = settled;
    }
    const used = available.compareTo(remaining) < 0 ? available : remaining;
    next[parent.id] = D.from(next[parent.id] ?? '0')
      .plus(used)
      .toString();
    remaining = remaining.minus(used);
    if (remaining.isZero()) break;
  }
  if (remaining.isPositive()) throw new Error('退出量超过本周期实际买入份额');
  return next;
}

export function reconcileBacktestProtection(
  orders: BacktestDailyOrder[],
  exits: Record<string, string>,
  at: BacktestOrderPoint,
): BacktestDailyOrder[] {
  return orders.map((order) => {
    if (!order.parent || backtestOrderTerminal(order)) return order;
    const parent = orders.find((p) => p.id === order.parent!.orderId);
    if (!parent) throw new Error('关联父买单不存在');
    return updateBacktestProtection(
      order,
      parent,
      exits[parent.id] ?? '0',
      parent.fills.at(-1)?.at ?? at,
    );
  });
}

export function cancelBacktestStopSiblings(orders: BacktestDailyOrder[], stop: BacktestDailyOrder) {
  return orders.map((order) => {
    const pendingBuy = order.cycleId === stop.cycleId && order.side === 'buy';
    const sibling =
      stop.exitGroup &&
      order.exitGroup === stop.exitGroup &&
      order.parent?.orderId === stop.parent?.orderId &&
      order.action.kind === 'takeProfit';
    return pendingBuy || sibling ? endBacktestOrder(order, 'cancelled') : order;
  });
}
