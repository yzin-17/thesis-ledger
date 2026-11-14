import { DecimalValue as D } from './decimal.js';
import type { ArenaPaperFees, ArenaPaperQuote } from './arena-live-types.js';

export function arenaOrderPrice(q: ArenaPaperQuote, side: 'buy' | 'sell', fees: ArenaPaperFees) {
  const multiplier = D.from('1').plus(D.from(String(fees.slippageBps)).dividedBy('10000').times(side === 'buy' ? '1' : '-1'));
  const raw = D.from(q.price).times(multiplier), tick = D.from(q.priceStep?.(raw.toString()) ?? q.tick);
  let aligned = raw.dividedBy(tick, 0).times(tick);
  if (side === 'buy' && aligned.compareTo(raw) < 0) aligned = aligned.plus(tick);
  if (side === 'sell' && aligned.compareTo(raw) > 0) aligned = aligned.minus(tick);
  return aligned;
}
export function arenaOrderFee(q: ArenaPaperQuote, side: 'buy' | 'sell', quantity: D, price: D, fees: ArenaPaperFees) {
  const amount = quantity.times(price);
  const configured = amount.times(String(side === 'buy' ? fees.buyBps : fees.sellBps)).dividedBy('10000');
  const commission = configured.compareTo(fees.minimum) < 0 ? D.from(fees.minimum) : configured;
  const charge = side === 'buy' ? q.statutoryBuyFee : q.statutorySellFee;
  return commission.plus(charge(amount.toString(), quantity.toString(), price.toString()));
}
export function arenaQuoteExecutable(q: ArenaPaperQuote, at: string, after: string) {
  const market = Date.parse(q.marketTime), observed = Date.parse(q.observedAt), now = Date.parse(at);
  return Number.isFinite(market) && Number.isFinite(observed) && market > Date.parse(after) &&
    market <= observed && observed <= now && D.from(q.price).isPositive() && D.from(q.tick).isPositive() && D.from(q.lot).isPositive();
}
