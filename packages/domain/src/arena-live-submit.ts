import { DecimalValue as D } from './decimal.js';
import { arenaAccountNav, arenaAvailableCash, arenaAvailableShares } from './arena-live-account.js';
import { arenaBuyReservedCash, arenaOrderPrice } from './arena-live-order-price.js';
import { arenaCreateProtection, arenaEndWaitingProtection } from './arena-live-protection.js';
import { arenaRemainingQuantity } from './arena-live-fill-quantity.js';
import { arenaEndWaitingEntries } from './arena-live-entry-sequence.js';
import { arenaSellAvailability, ArenaSellAvailabilityError } from './arena-live-sell-availability.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperDecision, ArenaPaperOrder, ArenaPaperQuote } from './arena-live-types.js';

function requireSubmissionQuote(quotes: ReadonlyMap<string, ArenaPaperQuote>, symbol: string, c: ArenaPaperContext): ArenaPaperQuote {
  const q = quotes.get(symbol);
  if (!q || Date.parse(q.marketTime) > Date.parse(c.at) || Date.parse(q.observedAt) > Date.parse(c.at)) throw new Error('execution_evidence_missing');
  return q;
}

function reserveBuyOrder(book: ArenaPaperAccount, order: ArenaPaperOrder, q: ArenaPaperQuote, quantity: D, nav: string | null, c: ArenaPaperContext): void {
    const price = order.kind === 'limit' ? D.from(order.price!) : arenaOrderPrice(q, order.side, c.fees);
    order.reservedCash = arenaBuyReservedCash(q, quantity, price, c.fees, !!c.matching);
    if (D.from(arenaAvailableCash(book, c.tradingDate)).compareTo(order.reservedCash) < 0) throw new Error('insufficient_cash');
    if (nav === null) throw new Error('position_valuation_missing');
    const held = book.positions.filter((p) => p.symbol === order.symbol).reduce((n, p) => n.plus(p.quantity), D.from('0'));
    const pending = book.orders.filter((o) => ['active', 'waiting_entry'].includes(o.state) && o.side === 'buy' && o.symbol === order.symbol)
      .reduce((n, o) => n.plus(arenaRemainingQuantity(book, o)), D.from('0'));
    if (held.plus(pending).plus(quantity).times(price).compareTo(D.from(nav).times(String(c.maxPositionBps)).dividedBy('10000')) > 0)
      throw new Error('position_limit');
}

function validateSellOrder(book: ArenaPaperAccount, order: ArenaPaperOrder, c: ArenaPaperContext): void {
    const paired = order.exitGroup && book.orders.find((o) => o.state === 'active' && o.exitGroup === order.exitGroup);
    if (!paired && D.from(arenaAvailableShares(book, order.symbol, c.tradingDate)).compareTo(order.quantity) < 0)
      throw new ArenaSellAvailabilityError(arenaSellAvailability(book, order.symbol, c.tradingDate), order.quantity);
    if (paired && (paired.symbol !== order.symbol || paired.quantity !== order.quantity || paired.kind === order.kind))
      throw new Error('invalid_exit_group');
}

export function arenaSubmitDecision(original: ArenaPaperAccount, expectedRevision: number, decision: ArenaPaperDecision, c: ArenaPaperContext) {
  if (original.revision !== expectedRevision) throw new Error('account_conflict');
  if (!decision.wakeups.length) throw new Error('appointment_missing');
  const book = structuredClone(original);
  for (const id of decision.cancelOrderIds) {
    const order = book.orders.find((o) => o.id === id && ['active', 'waiting_parent', 'waiting_entry'].includes(o.state));
    if (!order) throw new Error('order_not_active');
    order.state = 'cancelled'; order.reason = 'model_cancelled';
  }
  arenaEndWaitingEntries(book); arenaEndWaitingProtection(book);
  const requested = [...new Set([
    ...decision.watchedSymbols, ...decision.orders.map((o) => o.symbol),
    ...decision.wakeups.flatMap((w) => w.kind !== 'time' && w.symbol ? [w.symbol] : []),
    ...book.positions.map((p) => p.symbol), ...book.orders.filter((o) => o.state === 'active').map((o) => o.symbol),
  ])];
  if (requested.length > c.maxActiveSymbols) throw new Error('active_symbols_limit');
  if (requested.some((s) => !c.allowedSymbols.has(s))) throw new Error('symbol_outside_universe');
  const quotes = new Map(c.quotes.map((q) => [q.symbol, q]));
  const nav = arenaAccountNav(book, c.valuationPrices ?? new Map(c.quotes.map((q) => [q.symbol, q.price])));
  for (const input of decision.orders) {
    submitOrder(book, input, quotes, nav, decision, c);
  }
  book.wakeups = decision.wakeups.map((condition) => {
    if (condition.kind === 'time' && Date.parse(condition.at) <= Date.parse(c.at)) throw new Error('appointment_in_past');
    return { id: c.newId(), condition, createdAt: c.at, firedAt: null };
  });
  book.watchedSymbols = requested;
  book.revision += 1;
  return book;
}

function submitOrder(book: ArenaPaperAccount, input: ArenaPaperDecision['orders'][number], quotes: ReadonlyMap<string, ArenaPaperQuote>, nav: string | null, decision: ArenaPaperDecision, c: ArenaPaperContext) {
  const q = requireSubmissionQuote(quotes, input.symbol, c);
  if (input.side === 'buy' ? q.buyBlocked : q.sellBlocked) throw new Error('instrument_not_tradable');
  const quantity = D.from(input.quantity);
  if (!quantity.isPositive() || !quantity.isMultipleOf(q.lot)) throw new Error('invalid_quantity');
  if (input.price !== null && (!D.from(input.price).isPositive() || !D.from(input.price).isMultipleOf(q.priceStep?.(input.price) ?? q.tick))) throw new Error('invalid_tick');
  const expiresAt = c.expiresAt(input.expiresOn, input.kind);
  if (Date.parse(expiresAt) <= Date.parse(c.at)) throw new Error('order_expired');
  const order: ArenaPaperOrder = { ...input, id: c.newId(), createdAt: c.at, activeSince: c.at, expiresAt, state: 'active', reservedCash: '0', filledQuantity: '0', remainingQuantity: input.quantity, reason: null };
  if (book.orders.some((o) => o.clientId === input.clientId)) throw new Error('duplicate_order');
  if (order.side === 'buy') reserveBuyOrder(book, order, q, quantity, nav, c);
  else validateSellOrder(book, order, c);
  if (order.entryAfter) {
    const previous = book.orders.find(o => o.clientId === order.entryAfter!.clientId);
    if (order.side !== 'buy' || previous?.side !== 'buy' || !decision.orders.some(o => o.clientId === previous.clientId))
      throw new Error('invalid_entry_sequence');
    order.activationOrderId = previous.id; order.state = 'waiting_entry'; order.reason = 'awaiting_previous_entry';
  }
  book.orders.push(order);
  arenaCreateProtection(book, order, q, c);
}
