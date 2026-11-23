import { DecimalValue as D } from './decimal.js';
import { arenaAccountNav, arenaAvailableCash } from './arena-live-account.js';
import { arenaActivateProtection, arenaEndWaitingProtection, arenaOrderSellableShares, arenaPositionBelongsToOrder, arenaProtectionAfterExit } from './arena-live-protection.js';
import { arenaExecutableQuantity, arenaFloorToLot, arenaObservationIsPast, arenaRecordOrderQuantities, arenaRemainingQuantity } from './arena-live-fill-quantity.js';
import { arenaBuyReservedCash, arenaOrderFee, arenaOrderPrice, arenaQuoteExecutable } from './arena-live-order-price.js';
import { arenaActivateNextEntries, arenaEndWaitingEntries } from './arena-live-entry-sequence.js';
import { arenaAdvanceTrailing } from './arena-live-trailing-stop.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperOrder, ArenaPaperQuote } from './arena-live-types.js';

function triggered(order: ArenaPaperOrder, quote: ArenaPaperQuote, price: D) {
  if (order.kind === 'market') return true;
  const threshold = D.from(order.price!);
  if (order.kind === 'limit') return order.side === 'buy' ? price.compareTo(threshold) <= 0 : price.compareTo(threshold) >= 0;
  if (order.kind === 'stop_loss') return !!order.triggeredAt || order.trailingState?.triggered || D.from(quote.price).compareTo(order.trailingState?.triggerPrice ?? threshold) <= 0;
  return D.from(quote.price).compareTo(threshold) >= 0;
}
function consumePosition(book: ArenaPaperAccount, order: ArenaPaperOrder, day: string, quantity: D) {
  let remaining = quantity;
  for (const position of book.positions) {
    if (!arenaPositionBelongsToOrder(book, position, order) || position.availableOn > day || remaining.isZero()) continue;
    const held = D.from(position.quantity);
    const taken = held.compareTo(remaining) > 0 ? remaining : held;
    position.quantity = held.minus(taken).toString();
    remaining = remaining.minus(taken);
  }
  if (!remaining.isZero()) throw new Error('position_invariant');
  book.positions = book.positions.filter((p) => !D.from(p.quantity).isZero());
}
function matchOrderQuote(order: ArenaPaperOrder, quotes: ReadonlyMap<string, ArenaPaperQuote>, c: ArenaPaperContext) {
  const quote = quotes.get(order.symbol);
  if (!quote || !arenaQuoteExecutable(quote, c.at, order.activeSince)) return undefined;
  if (order.side === 'buy' ? quote.buyBlocked : quote.sellBlocked) return undefined;
  const price = arenaOrderPrice(quote, order.side, c.fees);
  if (!price.isPositive() || !triggered(order, quote, price)) return undefined;
  if (quote.upperLimit && price.compareTo(quote.upperLimit) >= 0) return undefined;
  if (quote.lowerLimit && price.compareTo(quote.lowerLimit) <= 0) return undefined;
  return { quote, price };
}

function cancelPairedExitOrders(book: ArenaPaperAccount, order: ArenaPaperOrder): void {
  if (order.exitGroup) for (const paired of book.orders) {
    if (paired.id !== order.id && paired.exitGroup === order.exitGroup && paired.state === 'active') {
      paired.state = 'cancelled'; paired.reason = 'paired_exit_filled';
    }
  }
}

function buyRejection(book: ArenaPaperAccount, order: ArenaPaperOrder, quote: ArenaPaperQuote, quantity: D, price: D, fee: D, c: ArenaPaperContext) {
  const value = quantity.times(price);
  const available = D.from(arenaAvailableCash(book, quote.tradingDate)).plus(order.reservedCash);
  const nav = arenaAccountNav(book, c.valuationPrices ?? new Map(c.quotes.map((q) => [q.symbol, q.price])));
  if (nav === null) return 'position_valuation_missing';
  const held = book.positions.filter((p) => p.symbol === order.symbol).reduce((n, p) => n.plus(p.quantity), D.from('0'));
  if (held.plus(quantity).times(price).compareTo(D.from(nav).times(String(c.maxPositionBps)).dividedBy('10000')) > 0)
    return 'position_limit';
  if (available.compareTo(value.plus(fee)) < 0) return 'insufficient_cash';
  return null;
}

/** 休市时仅推进到期与父单终态，不读取行情或创建成交。 */
export function arenaExpireOrders(original: ArenaPaperAccount, at: string) {
  const book = structuredClone(original);
  let changed = false;
  for (const order of book.orders) {
    if ((!['active', 'waiting_entry'].includes(order.state) && !['awaiting_next_entry', 'awaiting_parent_quantity'].includes(order.reason ?? '')) || Date.parse(order.expiresAt) > Date.parse(at)) continue;
    order.state = 'expired'; order.reason = 'order_expired'; changed = true;
  }
  if (arenaEndWaitingEntries(book)) changed = true;
  if (arenaEndWaitingProtection(book)) changed = true;
  if (changed) book.revision++;
  return book;
}

export function arenaMatchOrders(original: ArenaPaperAccount, c: ArenaPaperContext, running: boolean) {
  if (!running) return original;
  const book = structuredClone(original);
  const quotes = new Map(c.quotes.map((q) => [q.symbol, q]));
  let changed = false;
  const sequence = new Map(book.orders.map((order, index) => [order.id, index]));
  const orders = [...book.orders].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    Number(a.side === 'buy') - Number(b.side === 'buy') || sequence.get(a.id)! - sequence.get(b.id)! || a.id.localeCompare(b.id));
  for (const order of orders) {
    if (order.state !== 'active') continue;
    if (Date.parse(order.expiresAt) <= Date.parse(c.at)) {
      order.state = 'expired'; order.reason = 'order_expired'; changed = true; continue;
    }
    const observation = quotes.get(order.symbol);
    if (observation && c.matching && arenaObservationIsPast(book, observation)) continue;
    if (arenaAdvanceTrailing(order, observation, c)) changed = true;
    if (latchStop(order, observation, c)) changed = true;
    const candidate = matchOrderQuote(order, quotes, c);
    if (!candidate) continue;
    const { quote, price } = candidate;
    const quantity = executableOrderQuantity(book, order, quote, c);
    if (!quantity.isPositive()) continue;
    const fee = arenaOrderFee(quote, order.side, quantity, price, c.fees);
    const decision = orderExecutionDecision(book, order, quote, quantity, price, fee, c);
    if (!decision) continue;
    const { rejection, delta } = decision;
    if (rejection) { order.state = 'rejected'; order.reason = rejection; changed = true; continue; }
    recordOrderExecution(book, order, quote, price, quantity, fee, delta, c);
    changed = true;
  }
  if (arenaEndWaitingEntries(book)) changed = true;
  if (arenaEndWaitingProtection(book)) changed = true;
  if (changed) book.revision += 1;
  return book;
}

function latchStop(order: ArenaPaperOrder, quote: ArenaPaperQuote | undefined, c: ArenaPaperContext) {
  if (order.kind !== 'stop_loss' || order.triggeredAt || !quote || quote.sellBlocked || !arenaQuoteExecutable(quote, c.at, order.activeSince)) return false;
  if (!triggered(order, quote, D.from(quote.price))) return false;
  order.triggeredAt = quote.marketTime;
  return true;
}

function recordOrderExecution(book: ArenaPaperAccount, order: ArenaPaperOrder, quote: ArenaPaperQuote, price: D, quantity: D, fee: D, delta: D, c: ArenaPaperContext) {
  if (order.side === 'buy') book.positions.push({
    symbol: order.symbol, quantity: quantity.toString(), acquiredOn: quote.tradingDate, availableOn: quote.positionAvailableOn,
    ...(order.onFill ? { entryOrderId: order.id } : {}),
  });
  else {
    consumePosition(book, order, quote.tradingDate, quantity);
    if (quote.cashAvailableOn > quote.tradingDate && delta.isPositive())
      book.cashSettlements.push({ amount: delta.toString(), availableOn: quote.cashAvailableOn });
  }
  book.cash = D.from(book.cash).plus(delta).toString();
  book.fills.push({ id: c.newId(), orderId: order.id, symbol: order.symbol, side: order.side,
    quantity: quantity.toString(), price: price.toString(), fee: fee.toString(), cashDelta: delta.toString(),
    marketTime: quote.marketTime, recordedAt: c.at, sourceRef: quote.sourceRef, evidence: quote.evidence });
  arenaRecordOrderQuantities(book, order);
  order.state = arenaRemainingQuantity(book, order).isZero() ? 'filled' : 'active'; order.reason = null;
  if (order.side === 'buy') {
    const remaining = arenaRemainingQuantity(book, order);
    const reservePrice = order.kind === 'limit' ? D.from(order.price!) : price;
    order.reservedCash = arenaBuyReservedCash(quote, remaining, reservePrice, c.fees, !!c.matching);
    arenaActivateProtection(book, order, quote, c);
    arenaActivateNextEntries(book, order, quote, c);
  } else {
    cancelPairedExitOrders(book, order);
    arenaProtectionAfterExit(book, order);
  }
}

function executableOrderQuantity(book: ArenaPaperAccount, order: ArenaPaperOrder, quote: ArenaPaperQuote, c: ArenaPaperContext) {
  let quantity = arenaExecutableQuantity(book, order, quote, c);
  if (order.parentOrderId && c.matching) {
    const sellable = arenaOrderSellableShares(book, order, quote.tradingDate);
    if (sellable.compareTo(quantity) < 0) quantity = arenaFloorToLot(sellable, quote.lot);
  }
  return quantity;
}

function orderExecutionDecision(book: ArenaPaperAccount, order: ArenaPaperOrder, quote: ArenaPaperQuote, quantity: D, price: D, fee: D, c: ArenaPaperContext) {
  const value = quantity.times(price);
  let rejection: string | null = null;
  if (order.side === 'buy') {
    rejection = buyRejection(book, order, quote, quantity, price, fee, c);
    if (rejection === 'position_valuation_missing') return null;
  } else if (arenaOrderSellableShares(book, order, quote.tradingDate).compareTo(quantity) < 0) {
    if (order.parentOrderId) return null;
    rejection = 'insufficient_position';
  }
  const delta = order.side === 'buy' ? value.plus(fee).times('-1') : value.minus(fee);
  if (D.from(book.cash).plus(delta).isNegative()) rejection = 'insufficient_cash';
  return { rejection, delta };
}
