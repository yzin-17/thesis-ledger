import { DecimalValue as D } from './decimal.js';
import { arenaAccountNav } from './arena-live-account.js';
import { arenaOrderFee, arenaOrderPrice } from './arena-live-order-price.js';
import type { ArenaPaperAccount, ArenaPaperFees, ArenaPaperQuote } from './arena-live-types.js';

export interface ArenaCommonMark {
  agentId: string; nav: string | null; returnRatio: string | null; peakNav: string | null;
  drawdown: string | null; complete: boolean; reason: string | null; rank: number | null;
}
export function arenaCommonMarks(
  agents: readonly { id: string; account: ArenaPaperAccount }[], prices: ReadonlyMap<string, string>,
  initialCash: string, previous: readonly ArenaCommonMark[],
) {
  const marks: ArenaCommonMark[] = agents.map((agent) => {
    const old = previous.find((p) => p.agentId === agent.id);
    const nav = arenaAccountNav(agent.account, prices);
    if (nav === null) return { agentId: agent.id, nav, returnRatio: null, peakNav: old?.peakNav ?? null,
      drawdown: old?.drawdown ?? null, complete: false, reason: 'valuation_price_missing', rank: null };
    const value = D.from(nav), priorPeak = D.from(old?.peakNav ?? initialCash);
    const peak = priorPeak.compareTo(value) > 0 ? priorPeak : value;
    const drawdown = peak.isZero() ? D.from('0') : peak.minus(value).dividedBy(peak);
    return { agentId: agent.id, nav, returnRatio: value.dividedBy(initialCash).minus('1').toString(),
      peakNav: peak.toString(), drawdown: old?.drawdown && D.from(old.drawdown).compareTo(drawdown) > 0 ? old.drawdown : drawdown.toString(),
      complete: true, reason: null, rank: null };
  });
  if (marks.every((m) => m.complete)) {
    const ordered = [...marks].sort((a, b) => D.from(b.returnRatio!).compareTo(a.returnRatio!));
    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i]!, prior = ordered[i - 1];
      row.rank = prior && D.from(prior.returnRatio!).compareTo(row.returnRatio!) === 0 ? prior.rank : i + 1;
    }
  }
  return marks;
}

/** 固定篮子只在共同合格执行观察中建立一次，此后保留实际份额与余款。 */
export function arenaEqualWeightBook(initialCash: string, maxPositionBps: number, quotes: readonly ArenaPaperQuote[], fees: ArenaPaperFees, at: string, newId: () => string) {
  const account: ArenaPaperAccount = { revision: 0, cash: initialCash, positions: [], cashSettlements: [], orders: [], wakeups: [], watchedSymbols: [], fills: [] };
  if (!quotes.length) return account;
  const equal = D.from(initialCash).dividedBy(String(quotes.length));
  const capped = D.from(initialCash).times(String(maxPositionBps)).dividedBy('10000');
  const allocation = equal.compareTo(capped) < 0 ? equal : capped;
  for (const q of quotes) {
    if (q.buyBlocked) continue;
    const price = arenaOrderPrice(q, 'buy', fees), lot = D.from(q.lot);
    if (q.upperLimit && price.compareTo(q.upperLimit) >= 0 || q.lowerLimit && price.compareTo(q.lowerLimit) <= 0) continue;
    let low = 0n, high = BigInt(allocation.dividedBy(price.times(lot), 0).toString()) + 1n;
    while (low < high) {
      const middle = (low + high + 1n) / 2n;
      const value = lot.times(middle.toString()).times(price);
      if (value.plus(arenaOrderFee(q, 'buy', lot.times(middle.toString()), price, fees)).compareTo(allocation) <= 0) low = middle;
      else high = middle - 1n;
    }
    if (!low) continue;
    const quantity = lot.times(low.toString()), value = quantity.times(price), fee = arenaOrderFee(q, 'buy', quantity, price, fees);
    account.cash = D.from(account.cash).minus(value).minus(fee).toString();
    account.positions.push({ symbol: q.symbol, quantity: quantity.toString(), acquiredOn: q.tradingDate, availableOn: q.positionAvailableOn });
    account.fills.push({ id: newId(), orderId: newId(), symbol: q.symbol, side: 'buy', quantity: quantity.toString(),
      price: price.toString(), fee: fee.toString(), cashDelta: value.plus(fee).times('-1').toString(),
      marketTime: q.marketTime, recordedAt: at, sourceRef: q.sourceRef, evidence: q.evidence });
  }
  return account;
}
