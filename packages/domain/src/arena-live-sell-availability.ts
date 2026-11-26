import { DecimalValue as D } from './decimal.js';
import { arenaAvailableShares } from './arena-live-account.js';
import type { ArenaPaperAccount } from './arena-live-types.js';

/** 消费实际持仓可卖日及原预留算法，不推定市场的结算制度。 */
export function arenaSellAvailability(account: ArenaPaperAccount, symbol: string, tradingDate: string) {
  const positions = account.positions.filter(p => p.symbol === symbol);
  const total = positions.reduce((n, p) => n.plus(p.quantity), D.from('0'));
  const settled = positions.filter(p => p.availableOn <= tradingDate)
    .reduce((n, p) => n.plus(p.quantity), D.from('0'));
  const remaining = D.from(arenaAvailableShares(account, symbol, tradingDate));
  const available = remaining.compareTo('0') < 0 ? D.from('0') : remaining;
  const reserved = settled.minus(available);
  const settlements = new Map<string, D>();
  for (const p of positions) if (p.availableOn > tradingDate)
    settlements.set(p.availableOn, (settlements.get(p.availableOn) ?? D.from('0')).plus(p.quantity));
  return { symbol, tradingDate, totalQuantity: total.toString(), settledQuantity: settled.toString(),
    unsettledQuantity: total.minus(settled).toString(), reservedQuantity: reserved.toString(),
    availableQuantity: available.toString(), settlements: [...settlements].sort(([a], [b]) => a.localeCompare(b))
      .map(([availableOn, quantity]) => ({ availableOn, quantity: quantity.toString() })),
    activeSellOrderIds: account.orders.filter(o => o.symbol === symbol && o.side === 'sell' && o.state === 'active').map(o => o.id) };
}

export class ArenaSellAvailabilityError extends Error {
  readonly reason: 'insufficient_holding' | 'position_not_settled' | 'sell_orders_reserved';
  constructor(readonly availability: ReturnType<typeof arenaSellAvailability>, readonly requestedQuantity: string) {
    super('insufficient_position');
    this.name = 'ArenaSellAvailabilityError';
    if (D.from(requestedQuantity).compareTo(availability.totalQuantity) > 0) this.reason = 'insufficient_holding';
    else if (D.from(requestedQuantity).compareTo(availability.settledQuantity) > 0) this.reason = 'position_not_settled';
    else this.reason = 'sell_orders_reserved';
  }
}
