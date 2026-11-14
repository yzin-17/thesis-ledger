import { DecimalValue as D } from './decimal.js';
import { arenaAccountNav, arenaAvailableCash, arenaAvailableShares } from './arena-live-account.js';
import { arenaOrderFee, arenaOrderPrice, arenaQuoteExecutable } from './arena-live-order-price.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperOrder, ArenaPaperQuote } from './arena-live-types.js';

function triggered(order: ArenaPaperOrder, quote: ArenaPaperQuote, price: D) {
  if (order.kind === 'market') return true;
  const threshold = D.from(order.price!);
  if (order.kind === 'limit') return order.side === 'buy' ? price.compareTo(threshold) <= 0 : price.compareTo(threshold) >= 0;
  if (order.kind === 'stop_loss') return D.from(quote.price).compareTo(threshold) <= 0;
  return D.from(quote.price).compareTo(threshold) >= 0;
}
function consumePosition(book: ArenaPaperAccount, symbol: string, amount: string, day: string) {
  let remaining = D.from(amount);
  for (const position of book.positions) {
    if (position.symbol !== symbol || position.availableOn > day || remaining.isZero()) continue;
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

export function arenaMatchOrders(original: ArenaPaperAccount, c: ArenaPaperContext, running: boolean) {
  if (!running) return original;
  const book = structuredClone(original);
  const quotes = new Map(c.quotes.map((q) => [q.symbol, q]));
  let changed = false;
  const orders = [...book.orders].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  for (const order of orders) {
    if (order.state !== 'active') continue;
    if (Date.parse(order.expiresAt) <= Date.parse(c.at)) {
      order.state = 'expired'; order.reason = 'order_expired'; changed = true; continue;
    }
    const candidate = matchOrderQuote(order, quotes, c);
    if (!candidate) continue;
    const { quote, price } = candidate;
    const value = D.from(order.quantity).times(price);
    const fee = arenaOrderFee(quote, order.side, D.from(order.quantity), price, c.fees);
    let rejection: string | null = null;
    if (order.side === 'buy') {
      const available = D.from(arenaAvailableCash(book, quote.tradingDate)).plus(order.reservedCash);
      if (available.compareTo(value.plus(fee)) < 0) rejection = 'insufficient_cash';
      const nav = arenaAccountNav(book, new Map(c.quotes.map((q) => [q.symbol, q.price])));
      if (nav === null) continue;
      const held = book.positions.filter((p) => p.symbol === order.symbol).reduce((n, p) => n.plus(p.quantity), D.from('0'));
      if (held.plus(order.quantity).times(price).compareTo(D.from(nav).times(String(c.maxPositionBps)).dividedBy('10000')) > 0)
        rejection = 'position_limit';
    } else if (D.from(arenaAvailableShares(book, order.symbol, quote.tradingDate)).plus(order.quantity).compareTo(order.quantity) < 0) {
      rejection = 'insufficient_position';
    }
    const delta = order.side === 'buy' ? value.plus(fee).times('-1') : value.minus(fee);
    if (D.from(book.cash).plus(delta).isNegative()) rejection = 'insufficient_cash';
    if (rejection) { order.state = 'rejected'; order.reason = rejection; changed = true; continue; }
    if (order.side === 'buy') book.positions.push({
      symbol: order.symbol, quantity: order.quantity, acquiredOn: quote.tradingDate, availableOn: quote.positionAvailableOn,
    });
    else {
      consumePosition(book, order.symbol, order.quantity, quote.tradingDate);
      if (quote.cashAvailableOn > quote.tradingDate && delta.isPositive())
        book.cashSettlements.push({ amount: delta.toString(), availableOn: quote.cashAvailableOn });
    }
    book.cash = D.from(book.cash).plus(delta).toString();
    order.state = 'filled'; order.reason = null;
    cancelPairedExitOrders(book, order);
    book.fills.push({ id: c.newId(), orderId: order.id, symbol: order.symbol, side: order.side,
      quantity: order.quantity, price: price.toString(), fee: fee.toString(), cashDelta: delta.toString(),
      marketTime: quote.marketTime, recordedAt: c.at, sourceRef: quote.sourceRef, evidence: quote.evidence });
    changed = true;
  }
  if (changed) book.revision += 1;
  return book;
}
