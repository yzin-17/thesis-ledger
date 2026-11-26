import { DecimalValue as D } from './decimal.js';
import type { BacktestDailyOrder } from './backtest-order-contract.js';

/** 只分配本计划已交收的买入份额，不借用同标的其他持仓。 */
export class BacktestOrderSettledOwnership {
  private readonly quantities = new Map<string, string>();
  settle(orderId: string, quantity: string) {
    this.quantities.set(
      orderId,
      D.from(this.quantities.get(orderId) ?? '0')
        .plus(quantity)
        .toString(),
    );
  }
  split(ratio: string) {
    for (const [id, quantity] of this.quantities)
      this.quantities.set(id, D.from(quantity).times(ratio).toString());
  }
  available(parent: BacktestDailyOrder, exits: Record<string, string>) {
    const remaining = D.from(this.quantities.get(parent.id) ?? '0').minus(exits[parent.id] ?? '0');
    return remaining.isPositive() ? remaining.toString() : '0';
  }
  forExit(order: BacktestDailyOrder, orders: BacktestDailyOrder[], exits: Record<string, string>) {
    return orders
      .filter(
        (parent) =>
          parent.side === 'buy' &&
          parent.cycleId === order.cycleId &&
          (!order.parent || parent.id === order.parent.orderId),
      )
      .reduce((sum, parent) => sum.plus(this.available(parent, exits)), D.from('0'))
      .toString();
  }
}
