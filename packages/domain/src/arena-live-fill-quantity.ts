import { DecimalValue as D } from './decimal.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperOrder, ArenaPaperQuote } from './arena-live-types.js';

export function arenaFilledQuantity(book: ArenaPaperAccount, order: ArenaPaperOrder) {
  return book.fills.filter(f => f.orderId === order.id).reduce((n, f) => n.plus(f.quantity), D.from('0'));
}
export function arenaRemainingQuantity(book: ArenaPaperAccount, order: ArenaPaperOrder) {
  if (order.parentOrderId) {
    const held = book.positions.filter(p => p.entryOrderId === order.parentOrderId).reduce((n, p) => n.plus(p.quantity), D.from('0'));
    if (order.exitQuantity?.basis === 'parent_filled_fraction') {
      const parent = book.orders.find(o => o.id === order.parentOrderId)!;
      const goal = arenaFractionQuantity(arenaFilledQuantity(book, parent), order.exitQuantity, order.quantityLot ?? '1');
      const remaining = goal.minus(arenaFilledQuantity(book, order));
      if (!remaining.isPositive()) return D.from('0');
      return remaining.compareTo(held) < 0 ? remaining : held;
    }
    return held;
  }
  return D.from(order.quantity).minus(arenaFilledQuantity(book, order));
}

export function arenaFractionQuantity(total: D, fraction: { numerator: number; denominator: number }, lot: string) {
  const numerator = total.times(String(fraction.numerator));
  const quantum = D.from(lot).times(String(fraction.denominator));
  let units = numerator.dividedBy(quantum, 0);
  if (units.times(quantum).compareTo(numerator) > 0) units = units.minus('1');
  return units.times(lot);
}

export function arenaFloorToLot(quantity: D, lot: string) {
  const rounded = quantity.dividedBy(lot, 0).times(lot);
  return rounded.compareTo(quantity) > 0 ? rounded.minus(lot) : rounded;
}

/** 额度来自显式模拟配置；成交账本是重复行情和恢复后额度的事实源。 */
export function arenaExecutableQuantity(book: ArenaPaperAccount, order: ArenaPaperOrder, q: ArenaPaperQuote, c: ArenaPaperContext) {
  const remaining = arenaRemainingQuantity(book, order);
  if (!c.matching) return remaining;
  if (arenaObservationIsPast(book, q)) return D.from('0');
  const consumed = book.fills.filter(f => f.symbol === q.symbol && Date.parse(f.marketTime) === Date.parse(q.marketTime))
    .reduce((n, f) => n.plus(f.quantity), D.from('0'));
  const available = D.from(c.matching.maxSharesPerObservation).minus(consumed);
  if (!available.isPositive()) return D.from('0');
  const bounded = available.compareTo(remaining) < 0 ? available : remaining;
  return arenaFloorToLot(bounded, q.lot);
}

export function arenaObservationIsPast(book: ArenaPaperAccount, q: ArenaPaperQuote) {
  return book.fills.some(f => f.symbol === q.symbol && Date.parse(f.marketTime) > Date.parse(q.marketTime));
}

export function arenaRecordOrderQuantities(book: ArenaPaperAccount, order: ArenaPaperOrder) {
  order.filledQuantity = arenaFilledQuantity(book, order).toString();
  order.remainingQuantity = arenaRemainingQuantity(book, order).toString();
}
