import { DecimalValue as D } from './decimal.js';
import { arenaFloorToLot } from './arena-live-fill-quantity.js';
import { arenaQuoteExecutable } from './arena-live-order-price.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperOrder, ArenaPaperQuote } from './arena-live-types.js';

export function arenaInitialTrailingState(book: ArenaPaperAccount, parent: ArenaPaperOrder, child: ArenaPaperOrder, q: ArenaPaperQuote, reset = false) {
  const fills = book.fills.filter(f => f.orderId === parent.id);
  const quantity = fills.reduce((n, f) => n.plus(f.quantity), D.from('0'));
  const turnover = fills.reduce((n, f) => n.plus(D.from(f.quantity).times(f.price)), D.from('0'));
  if (child.trailingState && !reset) { child.trailingState.entryPrice = turnover.dividedBy(quantity).toString(); return; }
  child.trailingState = { highWater: q.price, entryPrice: turnover.dividedBy(quantity).toString(), triggerPrice: child.price!, marketTime: q.marketTime, triggered: false };
}

/** 仅消费激活后的有效可卖行情；触发后锁定退出意图，恢复与跳空不回退保护线。 */
export function arenaAdvanceTrailing(order: ArenaPaperOrder, quote: ArenaPaperQuote | undefined, c: ArenaPaperContext) {
  const rule = order.trailing, state = order.trailingState;
  if (!rule || !state || !quote || state.triggered || quote.sellBlocked || !arenaQuoteExecutable(quote, c.at, order.activeSince) ||
    Date.parse(quote.marketTime) <= Date.parse(state.marketTime)) return false;
  const price = D.from(quote.price), oldHigh = D.from(state.highWater);
  const high = price.compareTo(oldHigh) > 0 ? price : oldHigh;
  let line = rule.distance.kind === 'amount' ? high.minus(rule.distance.value)
    : high.times(D.from('1').minus(D.from(rule.distance.value).dividedBy('100')));
  const entry = D.from(state.entryPrice);
  if (rule.breakEven && high.compareTo(entry.times(D.from('1').plus(D.from(rule.breakEven.triggerGainPercent).dividedBy('100')))) >= 0 && line.compareTo(entry) < 0)
    line = entry;
  const minimum = D.from(state.triggerPrice);
  if (line.compareTo(minimum) < 0) line = minimum;
  const aligned = arenaFloorToLot(line, quote.priceStep?.(line.toString()) ?? quote.tick);
  state.highWater = high.toString(); state.marketTime = quote.marketTime;
  state.triggerPrice = aligned.toString(); state.triggered = price.compareTo(aligned) <= 0;
  return true;
}
