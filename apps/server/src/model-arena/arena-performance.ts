import { Prisma } from '@prisma/client';
import type { ArenaBook, ArenaProtocol, MarketInstrumentFact } from '@thesis-ledger/schemas';
import {
  executeAtArenaOpen,
  type OpeningFact,
  type ArenaFillDraft,
} from './arena-open-execution.js';
import { arenaBookAt } from './arena-research-packets.js';

const D = (value: string | number) => new Prisma.Decimal(value);
export type PerformanceFill = { quantity: string; price: string; fee: string };
export function arenaMetrics(
  start: string | null,
  closes: (string | null)[],
  fills: PerformanceFill[],
) {
  const valid = closes.filter((n): n is string => n !== null);
  const end = closes.at(-1) ?? null;
  const summary = {
    startNav: start,
    endNav: end,
    returnRatio: null,
    drawdown: null,
    turnover: null,
    tradeFees: fills.reduce((sum, f) => sum.plus(f.fee), D(0)).toFixed(),
    validCloses: valid.length,
    expectedCloses: closes.length,
  };
  if (start === null || !closes.length || valid.length !== closes.length || !D(start).gt(0))
    return summary;
  const values = [D(start), ...valid.map(D)];
  let peak = values[0]!,
    drawdown = D(0);
  for (const v of values) {
    peak = Prisma.Decimal.max(peak, v);
    drawdown = Prisma.Decimal.max(drawdown, peak.minus(v).div(peak));
  }
  const gross = fills.reduce((sum, f) => sum.plus(D(f.quantity).times(f.price)), D(0));
  const mean = values.reduce((sum, n) => sum.plus(n), D(0)).div(values.length);
  return {
    ...summary,
    returnRatio: D(end!).div(start).minus(1).toFixed(),
    drawdown: drawdown.toFixed(),
    turnover: gross.div(mean).toFixed(),
  };
}

export function equalWeightEntry(
  p: ArenaProtocol,
  openAt: Date,
  facts: OpeningFact[] | undefined,
): ArenaFillDraft[] | null {
  if (
    !facts ||
    p.instruments.some(
      (i) => !facts.some((f) => f.symbol === i.symbol && f.openAt === openAt.toISOString()),
    )
  )
    return null;
  const sorted = [...p.instruments].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const weight = Math.floor(10000 / sorted.length),
    extras = 10000 % sorted.length;
  const actions = sorted.map((i, index) => ({
    symbol: i.symbol,
    action: 'target' as const,
    weightBps: weight + (index < extras ? 1 : 0),
    reason: '等权基准',
    invalidatedBy: '',
    references: [],
  }));
  const book: ArenaBook = {
    cash: p.initialCash,
    nav: p.initialCash,
    positions: [],
    asOf: openAt.toISOString(),
  };
  return executeAtArenaOpen(p, book, { actions }, openAt.toISOString(), facts).fills;
}
export function benchmarkNav(
  initialCash: string,
  fills: ArenaFillDraft[] | null,
  facts: MarketInstrumentFact[],
  day: string,
  asOf: Date,
  coverage: Record<string, string[]>,
) {
  if (!fills || fills.some((f) => !coverage[f.symbol]?.length)) return null;
  return (
    arenaBookAt(
      initialCash,
      fills.map((f) => ({ ...f, quantity: D(f.quantity), cashDelta: D(f.cashDelta) })),
      facts,
      day,
      asOf,
    )?.nav ?? null
  );
}
