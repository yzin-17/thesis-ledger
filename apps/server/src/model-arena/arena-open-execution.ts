import { Prisma } from '@prisma/client';
import type { ArenaBook, ArenaDecision, ArenaProtocol } from '@thesis-ledger/schemas';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export type OpeningFact = {
  symbol: string;
  openAt: string;
  price: string;
  lot: string;
  tick: string;
  sourceRef: string;
  buyBlocked: string | null;
  sellBlocked: string | null;
  sellable: string;
  upperLimit?: string;
  lowerLimit?: string;
};
export type ArenaFillDraft = {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  fee: string;
  cashDelta: string;
  sourceRef: string;
};
type Target = {
  symbol: string;
  fact: OpeningFact;
  desired: Prisma.Decimal;
  side: 'buy' | 'sell';
  price: Prisma.Decimal;
};
const lots = (value: Prisma.Decimal, lot: string) => value.div(lot).floor().times(lot);
export function executeAtArenaOpen(
  protocol: ArenaProtocol,
  book: ArenaBook,
  decision: ArenaDecision,
  nextOpenAt: string,
  facts: OpeningFact[],
) {
  const opening = new Map(
    facts
      .filter(
        (f) =>
          f.openAt === nextOpenAt &&
          D(f.price).gt(0) &&
          D(f.lot).gt(0) &&
          D(f.tick).gt(0) &&
          D(f.sellable).gte(0),
      )
      .map((f) => [f.symbol, f]),
  );
  const positions = new Map(book.positions.map((row) => [row.symbol, D(row.quantity)]));
  let cash = D(book.cash),
    nav = cash;
  const fills: ArenaFillDraft[] = [];
  const reasons: Record<string, string> = {};
  for (const [symbol, qty] of positions) {
    const quote = opening.get(symbol);
    if (!quote)
      return {
        fills,
        reasons: Object.fromEntries(
          decision.actions.map((a) => [
            a.symbol,
            a.action === 'target' ? 'opening_valuation_missing' : a.action,
          ]),
        ),
        cash: book.cash,
      };
    nav = nav.plus(qty.times(quote.price));
  }
  const { buys, sells } = planOpeningTargets(protocol, decision, opening, positions, nav, reasons);
  function amounts(order: Target, qty: Prisma.Decimal) {
    const gross = order.price.times(qty);
    const bps = order.side === 'buy' ? protocol.fees.buyBps : protocol.fees.sellBps;
    const fee = Prisma.Decimal.max(
      gross.times(bps).div(10000),
      protocol.fees.minimum,
    ).toDecimalPlaces(2);
    return { fee, delta: order.side === 'sell' ? gross.minus(fee) : gross.plus(fee).negated() };
  }
  function fill(order: Target, qty: Prisma.Decimal) {
    if (qty.lte(0)) {
      reasons[order.symbol] = 'insufficient_cash';
      return;
    }
    const { fee, delta } = amounts(order, qty);
    if (cash.plus(delta).lt(0)) {
      reasons[order.symbol] = 'insufficient_cash';
      return;
    }
    fills.push({
      symbol: order.symbol,
      side: order.side,
      quantity: qty.toFixed(),
      price: order.price.toFixed(),
      fee: fee.toFixed(),
      cashDelta: delta.toFixed(),
      sourceRef: order.fact.sourceRef,
    });
    if (qty.lt(order.desired)) reasons[order.symbol] = 'partially_filled';
    cash = cash.plus(delta);
  }
  for (const order of sells) fill(order, order.desired);
  const expense = (ratio: Prisma.Decimal) =>
    buys.reduce((sum, order) => {
      const q = lots(order.desired.times(ratio), order.fact.lot);
      return q.gt(0) ? sum.minus(amounts(order, q).delta) : sum;
    }, D(0));
  let ratio = D(1);
  if (expense(ratio).gt(cash)) {
    let affordable = D(0),
      over = D(1);
    for (let i = 0; i < 96; i++) {
      const mid = affordable.plus(over).div(2);
      if (expense(mid).lte(cash)) affordable = mid;
      else over = mid;
    }
    ratio = affordable;
  }
  for (const order of buys) fill(order, lots(order.desired.times(ratio), order.fact.lot));
  return { fills, reasons, cash: cash.toFixed() };
}

function planOpeningTargets(
  protocol: ArenaProtocol,
  decision: ArenaDecision,
  opening: ReadonlyMap<string, OpeningFact>,
  positions: ReadonlyMap<string, Prisma.Decimal>,
  nav: Prisma.Decimal,
  reasons: Record<string, string>,
) {
  const buys: Target[] = [],
    sells: Target[] = [];
  for (const action of [...decision.actions].sort((a, b) => a.symbol.localeCompare(b.symbol))) {
    if (action.action !== 'target') {
      reasons[action.symbol] = action.action;
      continue;
    }
    const fact = opening.get(action.symbol);
    if (!fact) {
      reasons[action.symbol] = 'opening_evidence_missing';
      continue;
    }
    const owned = positions.get(action.symbol) ?? D(0);
    const gap = nav.times(action.weightBps).div(10000).div(fact.price).minus(owned);
    const side = gap.isNegative() ? 'sell' : 'buy';
    const blocked = side === 'sell' ? fact.sellBlocked : fact.buyBlocked;
    if (blocked) {
      reasons[action.symbol] = blocked;
      continue;
    }
    const maximum = side === 'sell' ? Prisma.Decimal.min(gap.abs(), owned, fact.sellable) : gap;
    const desired = lots(maximum, fact.lot);
    if (desired.lte(0)) {
      reasons[action.symbol] = 'below_lot';
      continue;
    }
    const adjusted = D(fact.price)
      .times(10000 + (side === 'sell' ? -1 : 1) * protocol.fees.slippageBps)
      .div(10000);
    const ticks = adjusted.div(fact.tick);
    const price = (side === 'sell' ? ticks.floor() : ticks.ceil()).times(fact.tick);
    if (
      (fact.upperLimit && price.gt(fact.upperLimit)) ||
      (fact.lowerLimit && price.lt(fact.lowerLimit))
    ) {
      reasons[action.symbol] = 'price_limit';
      continue;
    }
    if (price.lte(0)) {
      reasons[action.symbol] = 'price_unavailable';
      continue;
    }
    (side === 'sell' ? sells : buys).push({ symbol: action.symbol, fact, desired, side, price });
  }
  return { buys, sells };
}
