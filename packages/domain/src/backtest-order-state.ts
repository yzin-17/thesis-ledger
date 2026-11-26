import { DecimalValue as D } from './decimal.js';
import type {
  BacktestDailyOrder,
  BacktestOrderFill,
  BacktestOrderPoint,
} from './backtest-order-contract.js';

export const backtestOrderTerminal = (order: BacktestDailyOrder) =>
  ['filled', 'cancelled', 'expired', 'rejected'].includes(order.state);

export function createBacktestDailyOrder(
  input: Omit<BacktestDailyOrder, 'state' | 'filledQuantity' | 'remainingQuantity' | 'fills'>,
): BacktestDailyOrder {
  const quantity = D.from(input.quantity);
  if (quantity.isNegative() || (!input.parent && !quantity.isPositive()))
    throw new Error('委托数量必须大于零，待父单保护可为零');
  return {
    ...structuredClone(input),
    quantity: quantity.toString(),
    filledQuantity: '0',
    remainingQuantity: quantity.toString(),
    state: input.parent ? 'waiting_parent' : 'active',
    fills: [],
  };
}

export function acceptBacktestOrderFill(order: BacktestDailyOrder, fill: BacktestOrderFill) {
  const duplicate = order.fills.find((item) => item.fillId === fill.fillId);
  if (duplicate) {
    if (
      D.from(duplicate.quantity).compareTo(fill.quantity) !== 0 ||
      duplicate.at.barIndex !== fill.at.barIndex ||
      duplicate.at.phase !== fill.at.phase
    )
      throw new Error('重复成交标识对应了不同成交');
    return { order, applied: false };
  }
  if (!backtestOrderCanMatch(order, fill.at)) throw new Error('当前委托状态不能接受成交');
  const quantity = D.from(fill.quantity);
  if (!quantity.isPositive() || quantity.compareTo(order.remainingQuantity) > 0)
    throw new Error('成交数量必须为正且不超过未成交余量');
  const filled = D.from(order.filledQuantity).plus(quantity);
  const remaining = D.from(order.remainingQuantity).minus(quantity);
  return {
    applied: true,
    order: {
      ...order,
      filledQuantity: filled.toString(),
      remainingQuantity: remaining.toString(),
      state: remaining.isZero() ? 'filled' : 'partially_filled',
      fills: [...order.fills, { fillId: fill.fillId, quantity: fill.quantity, at: { ...fill.at } }],
    } as BacktestDailyOrder,
  };
}

export function endBacktestOrder(
  order: BacktestDailyOrder,
  state: 'cancelled' | 'expired' | 'rejected',
) {
  if (backtestOrderTerminal(order)) return order;
  // 终态保留未成交数量作审计；可撮合量由状态决定。
  return { ...order, state };
}

export function backtestOrderExpiresAt(order: BacktestDailyOrder): number | undefined {
  if (order.activatedBarIndex === undefined || order.validity.kind === 'position') return undefined;
  return order.activatedBarIndex + (order.validity.kind === 'bars' ? order.validity.bars : 1) - 1;
}

export function expireBacktestOrder(order: BacktestDailyOrder, completedBarIndex: number) {
  const expires = backtestOrderExpiresAt(order);
  if (expires === undefined || completedBarIndex < expires) return order;
  return endBacktestOrder(order, 'expired');
}

export function backtestOrderCanMatch(order: BacktestDailyOrder, at: BacktestOrderPoint) {
  if (
    backtestOrderTerminal(order) ||
    order.state === 'waiting_parent' ||
    !order.eligibleFrom ||
    !D.from(order.remainingQuantity).isPositive() ||
    order.fills.some((f) => f.at.barIndex === at.barIndex)
  )
    return false;
  const expires = backtestOrderExpiresAt(order);
  if (expires !== undefined && at.barIndex > expires) return false;
  return (
    at.barIndex > order.eligibleFrom.barIndex ||
    (at.barIndex === order.eligibleFrom.barIndex &&
      (order.eligibleFrom.phase === 'open' || at.phase === 'range'))
  );
}

export function triggerBacktestOrder(order: BacktestDailyOrder, at: BacktestOrderPoint) {
  if (order.price.kind !== 'stopMarket' || order.triggeredAt || !backtestOrderCanMatch(order, at))
    return order;
  return { ...order, triggeredAt: { ...at } };
}

/** exitedQuantity 只接收已分配给这个父单的实际退出量。 */
export function updateBacktestProtection(
  child: BacktestDailyOrder,
  parent: BacktestDailyOrder,
  exitedQuantity: string,
  fillAt: BacktestOrderPoint,
): BacktestDailyOrder {
  if (
    child.parent?.orderId !== parent.id ||
    child.cycleId !== parent.cycleId ||
    parent.side !== 'buy' ||
    child.side !== 'sell' ||
    child.quantityBasis !== parent.quantityBasis
  )
    throw new Error('保护与父买单的引用或持仓周期不一致');
  if (backtestOrderTerminal(child)) return child;
  const bought = D.from(parent.filledQuantity);
  const exited = D.from(exitedQuantity);
  if (exited.isNegative() || exited.compareTo(bought) > 0)
    throw new Error('父单退出量超出实际买入量');
  if (child.parent.activation === 'fullFill' && parent.state !== 'filled') {
    if (backtestOrderTerminal(parent)) return endBacktestOrder(child, 'cancelled');
    return child;
  }
  if (bought.isZero()) {
    if (backtestOrderTerminal(parent)) return endBacktestOrder(child, 'cancelled');
    return child;
  }
  const remaining = bought.minus(exited);
  const quantity = D.from(child.filledQuantity).plus(remaining);
  const eligibleFrom =
    child.eligibleFrom ??
    (fillAt.phase === 'open'
      ? { barIndex: fillAt.barIndex, phase: 'range' as const }
      : { barIndex: fillAt.barIndex + 1, phase: 'open' as const });
  const next = {
    ...child,
    quantity: quantity.toString(),
    remainingQuantity: remaining.toString(),
    activatedBarIndex: child.activatedBarIndex ?? fillAt.barIndex,
    eligibleFrom,
  };
  if (remaining.isZero())
    return { ...next, state: D.from(child.filledQuantity).isPositive() ? 'filled' : 'cancelled' };
  return {
    ...next,
    state: D.from(child.filledQuantity).isPositive() ? 'partially_filled' : 'active',
  };
}
