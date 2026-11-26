import { DecimalValue as D } from './decimal.js';
import { floorLotUnits } from './backtest-sizing.js';
import type {
  BacktestDailyMatching,
  BacktestDailyOrder,
  BacktestOrderPoint,
} from './backtest-order-contract.js';
import {
  acceptBacktestOrderFill,
  backtestOrderCanMatch,
  endBacktestOrder,
  expireBacktestOrder,
  triggerBacktestOrder,
} from './backtest-order-state.js';
import {
  backtestDailyOrderPrice,
  compareBacktestDailyOrders,
  type BacktestDailyBar,
} from './backtest-daily-order-price.js';
import {
  allocateBacktestExit,
  backtestParentRemaining,
  cancelBacktestStopSiblings,
  reconcileBacktestProtection,
} from './backtest-order-protection.js';

export interface BacktestDailyMatchFill {
  fillId: string;
  orderId: string;
  quantity: string;
  price: string;
  at: BacktestOrderPoint;
}
export interface BacktestDailyMatchState {
  orders: BacktestDailyOrder[];
  fills: BacktestDailyMatchFill[];
  exits: Record<string, string>;
  currentBar?: { key: string; index: number; consumed: string; phases: Array<'open' | 'range'> };
  rejects: Array<{ orderId: string; reason: string }>;
  conflicts: Array<{ barKey: string; exitGroup: string; resolution: 'stopFirst' }>;
}
export const createBacktestDailyMatchState = (
  orders: BacktestDailyOrder[],
): BacktestDailyMatchState => ({
  orders: structuredClone(orders),
  fills: [],
  exits: {},
  rejects: [],
  conflicts: [],
});

export function matchBacktestDailyPhase(input: {
  state: BacktestDailyMatchState;
  bar: BacktestDailyBar;
  phase: 'open' | 'range';
  policy: BacktestDailyMatching;
  lotSize?: string;
  tradable?: boolean;
  availableQuantity: (order: BacktestDailyOrder, state: BacktestDailyMatchState) => string;
  availableForParent?: (parent: BacktestDailyOrder, state: BacktestDailyMatchState) => string;
  execute?: (
    fill: BacktestDailyMatchFill,
    order: BacktestDailyOrder,
  ) => { accepted: true; quantity: string; price: string } | { accepted: false; reason: string };
}): BacktestDailyMatchState {
  const { bar, phase, policy } = input;
  const prior = input.state.currentBar;
  if (
    prior &&
    (bar.index < prior.index || (bar.index === prior.index && prior.phases.includes(phase)))
  )
    return input.state;
  if (prior?.index === bar.index && prior.key !== bar.key)
    throw new Error('同一交易根索引对应不同根标识');
  const state = structuredClone(input.state);
  const budget =
    prior?.index === bar.index
      ? { ...prior, phases: [...prior.phases] }
      : { key: bar.key, index: bar.index, consumed: '0', phases: [] as Array<'open' | 'range'> };
  if (phase === 'open' && budget.phases.includes('range'))
    throw new Error('开盘阶段不能晚于区间阶段');
  if (phase === 'range' && !budget.phases.includes('open'))
    throw new Error('区间阶段必须在开盘阶段之后');
  state.currentBar = budget;
  const at = { barIndex: bar.index, phase };
  state.orders = reconcileBacktestProtection(state.orders, state.exits, at);
  const ranked = [...state.orders].sort(compareBacktestDailyOrders);
  for (const reference of ranked) {
    if (input.tradable === false) break;
    let order = state.orders.find((o) => o.id === reference.id)!;
    if (!backtestOrderCanMatch(order, at)) continue;
    const price = backtestDailyOrderPrice(order, bar, phase);
    if (price === undefined) continue;
    if (order.price.kind === 'stopMarket' && !order.triggeredAt) {
      recordConflict(state, order, bar, phase);
      order = triggerBacktestOrder(order, at);
      state.orders = state.orders.map((o) => (o.id === order.id ? order : o));
      if (order.action.kind === 'stopLoss')
        state.orders = cancelBacktestStopSiblings(state.orders, order);
    }
    let quantity = D.from(order.remainingQuantity);
    const limits = [input.availableQuantity(order, state)];
    if (policy.liquidity.kind === 'perBarCap')
      limits.push(D.from(policy.liquidity.quantity).minus(budget.consumed).toString());
    if (order.side === 'sell') limits.push(sellableCycleQuantity(order, state).toString());
    for (const limit of limits) if (D.from(limit).compareTo(quantity) < 0) quantity = D.from(limit);
    if (input.lotSize && order.quantityBasis === 'actual-units' && quantity.isPositive())
      quantity = D.from(floorLotUnits(quantity.toString(), input.lotSize)).times(input.lotSize);
    const wholeOrder = policy.liquidity.kind === 'wholeOrder';
    if (!quantity.isPositive() || (wholeOrder && quantity.compareTo(order.remainingQuantity) !== 0)) continue;
    const fill: BacktestDailyMatchFill = {
      fillId: `${encodeURIComponent(order.id)}:${encodeURIComponent(bar.key)}:fill`,
      orderId: order.id,
      quantity: quantity.toString(),
      price,
      at,
    };
    const result = input.execute?.(fill, order) ?? {
      accepted: true,
      quantity: fill.quantity,
      price: fill.price,
    };
    if (!result.accepted) {
      state.rejects.push({ orderId: order.id, reason: result.reason });
      state.orders = state.orders.map((o) =>
        o.id === order.id ? endBacktestOrder(o, 'rejected') : o,
      );
      state.orders = reconcileBacktestProtection(state.orders, state.exits, at);
      continue;
    }
    if (!D.from(result.quantity).isPositive() || D.from(result.quantity).compareTo(quantity) > 0)
      throw new Error('执行接受量超出本次撮合候选数量');
    if (wholeOrder && D.from(result.quantity).compareTo(quantity) !== 0)
      throw new Error('整笔撮合不能接受部分成交');
    const acceptedFill = { ...fill, quantity: result.quantity, price: result.price };
    const accepted = acceptBacktestOrderFill(order, acceptedFill).order;
    state.orders = state.orders.map((o) => (o.id === order.id ? accepted : o));
    state.fills.push(acceptedFill);
    budget.consumed = D.from(budget.consumed).plus(result.quantity).toString();
    if (order.side === 'sell') {
      state.exits = allocateBacktestExit(
        state.orders,
        order,
        result.quantity,
        state.exits,
        input.availableForParent ? (parent) => input.availableForParent!(parent, state) : undefined,
      );
      if (sellableCycleQuantity(order, state, true).isZero())
        state.orders = state.orders.map((o) =>
          o.cycleId === order.cycleId ? endBacktestOrder(o, 'cancelled') : o,
        );
    }
    state.orders = reconcileBacktestProtection(state.orders, state.exits, at);
  }
  if (phase === 'range') {
    state.orders = state.orders.map((o) => expireBacktestOrder(o, bar.index));
    state.orders = reconcileBacktestProtection(state.orders, state.exits, at);
  }
  budget.phases.push(phase);
  return state;
}

function sellableCycleQuantity(
  order: BacktestDailyOrder,
  state: BacktestDailyMatchState,
  wholeCycle = false,
) {
  return state.orders
    .filter(
      (p) =>
        p.side === 'buy' &&
        p.cycleId === order.cycleId &&
        (wholeCycle || !order.parent || p.id === order.parent.orderId),
    )
    .reduce((sum, parent) => sum.plus(backtestParentRemaining(parent, state.exits)), D.from('0'));
}

function recordConflict(
  state: BacktestDailyMatchState,
  stop: BacktestDailyOrder,
  bar: BacktestDailyBar,
  phase: 'open' | 'range',
) {
  if (phase !== 'range' || !stop.exitGroup) return;
  const profit = state.orders.find(
    (o) =>
      o.exitGroup === stop.exitGroup &&
      o.parent?.orderId === stop.parent?.orderId &&
      o.action.kind === 'takeProfit' &&
      backtestOrderCanMatch(o, { barIndex: bar.index, phase }),
  );
  if (profit && backtestDailyOrderPrice(profit, bar, phase) !== undefined)
    state.conflicts.push({ barKey: bar.key, exitGroup: stop.exitGroup, resolution: 'stopFirst' });
}
