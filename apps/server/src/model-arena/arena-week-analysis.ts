import { Prisma } from '@prisma/client';
import {
  arenaBookSchema,
  arenaDecisionSchema,
  arenaMarkSchema,
  marketInstrumentFactSchema,
  type ArenaBook,
  type ArenaWeekly,
  type MarketInstrumentFact,
} from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { OpeningFact } from './arena-open-execution.js';

const D = (v: string | number) => new Prisma.Decimal(v);
type Bar = Extract<MarketInstrumentFact, { kind: 'daily_bar' }>;
export function observeWindow(
  input: { roundId: string; day: string; symbol: string },
  length: 5 | 20,
  sessions: string[],
  opening: OpeningFact | undefined,
  barFor: (day: string) => Bar | undefined,
  covered: (day: string) => boolean,
): ArenaWeekly['observations'][number] {
  const window = sessions.slice(0, length),
    endDay = window.length === length ? window.at(-1)! : null;
  const row = {
    ...input,
    window: length,
    endDay,
    change: null,
    high: null,
    low: null,
    sourceRefs: [],
  };
  if (!endDay) return { ...row, state: 'pending' };
  const bars = window.map(barFor);
  if (!opening || !D(opening.price).gt(0) || bars.some((b) => !b?.high || !b.low))
    return { ...row, state: 'missing_price' };
  if (!window.every(covered)) return { ...row, state: 'basis_unverified' };
  const valid = bars as Array<Bar & { high: string; low: string }>;
  const ratio = (v: Prisma.Decimal) => v.div(opening.price).minus(1).toFixed();
  return {
    ...row,
    state: 'ready',
    change: ratio(D(valid.at(-1)!.close)),
    high: ratio(Prisma.Decimal.max(...valid.map((b) => b.high))),
    low: ratio(Prisma.Decimal.min(...valid.map((b) => b.low))),
    sourceRefs: [opening.sourceRef, ...valid.map((b) => b.ref)],
  };
}
function positionValues(book: ArenaBook) {
  return new Map(book.positions.map((p) => [p.symbol, D(p.quantity).times(p.close)]));
}
function contributions(
  entrantId: string,
  start: ArenaBook | null,
  end: ArenaBook | null,
  fills: ArenaWeekly['fills'],
) {
  const trades = fills.filter((f) => f.entrantId === entrantId);
  const fees = trades.reduce((a, f) => a.plus(f.fee), D(0));
  if (!start || !end) return { entrantId, symbols: [], fees: fees.toFixed(), residual: null };
  const before = positionValues(start),
    after = positionValues(end);
  const symbols = [...new Set([...before.keys(), ...after.keys(), ...trades.map((f) => f.symbol)])]
    .sort()
    .map((symbol) => {
      let change = (after.get(symbol) ?? D(0)).minus(before.get(symbol) ?? 0);
      for (const f of trades.filter((f) => f.symbol === symbol)) {
        const gross = D(f.price).times(f.quantity);
        change = change.plus(f.side === 'buy' ? gross.negated() : gross);
      }
      return { symbol, amount: change.toFixed() };
    });
  const attributed = symbols.reduce((sum, s) => sum.plus(s.amount), fees.negated());
  return {
    entrantId,
    symbols,
    fees: fees.toFixed(),
    residual: D(end.nav).minus(start.nav).minus(attributed).toFixed(),
  };
}

export async function analyzeArenaWeek(db: PrismaService, base: ArenaWeekly, initialCash: string) {
  const { arenaId, start, end } = base.comparison,
    cutoff = new Date(base.cutoff);
  const all = await db.arenaOccurrence.findMany({
    where: { arenaId, tradingDate: { lte: end }, dueAt: { lt: cutoff } },
    select: { tradingDate: true, nextOpenAt: true },
    orderBy: { tradingDate: 'asc' },
  });
  const prev = all.filter((s) => s.tradingDate < start),
    slots = [...prev.slice(-20), ...all.filter((s) => s.tradingDate >= start)];
  const rounds = await db.arenaRound.findMany({
    where: {
      arenaId,
      tradingDate: { in: slots.map((s) => s.tradingDate) },
      createdAt: { lt: cutoff },
    },
    include: {
      packet: true,
      reservations: {
        select: { entrantId: true, privateBook: true, decision: true, settledAt: true },
      },
    },
  });
  const byDay = new Map(rounds.map((r) => [r.tradingDate, r]));
  const facts = new Map(
    rounds.map((r) => [
      r.tradingDate,
      marketInstrumentFactSchema
        .array()
        .parse(r.packet && r.packet.asOf <= cutoff ? r.packet.facts : []),
    ]),
  );
  const laterNews: ArenaWeekly['laterNews'] = [];
  const news = [
    ...new Map(
      [...facts.values()]
        .flat()
        .filter(
          (f): f is Extract<MarketInstrumentFact, { kind: 'news' }> =>
            f.kind === 'news' && Date.parse(f.availableAt) <= cutoff.getTime(),
        )
        .map((f) => [f.ref, f]),
    ).values(),
  ].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.ref.localeCompare(b.ref));
  const divergences: ArenaWeekly['divergences'] = [],
    observations: ArenaWeekly['observations'] = [];
  for (const [i, slot] of slots.entries()) {
    const r = byDay.get(slot.tradingDate);
    if (!r) continue;
    const weights = new Map<string, { id: string; bps: Prisma.Decimal }[]>();
    for (const e of r.reservations) {
      if (!e.decision || !e.settledAt || e.settledAt > cutoff) continue;
      const own = arenaBookSchema.nullable().parse(e.privateBook);
      for (const a of arenaDecisionSchema.parse(e.decision).actions) {
        let bps = D(0);
        if (a.action === 'target') bps = D(a.weightBps);
        if (a.action === 'hold') {
          const held = own?.positions.find((s) => s.symbol === a.symbol);
          if (!own || !held || D(own.nav).isZero()) continue;
          bps = D(held.quantity).times(held.close).times(10000).div(own.nav);
        }
        const choices = weights.get(a.symbol) ?? [];
        choices.push({ id: e.entrantId, bps });
        weights.set(a.symbol, choices);
      }
    }
    for (const [symbol, values] of weights) {
      if (slot.tradingDate >= start && r.packet) {
        const publishedAfter = r.packet.asOf.getTime();
        for (const f of news
          .filter((n) => n.symbol === symbol && Date.parse(n.publishedAt) > publishedAfter)
          .slice(0, 3))
          laterNews.push({
            roundId: r.id,
            symbol,
            ref: f.ref,
            publishedAt: f.publishedAt,
            url: f.url,
            title: f.title,
          });
      }
      const input = { day: r.tradingDate, roundId: r.id, symbol };
      values.sort((a, b) => a.bps.cmp(b.bps) || a.id.localeCompare(b.id));
      const low = values[0]!,
        high = values.at(-1)!;
      if (r.tradingDate >= start && high.bps.gt(low.bps))
        divergences.push({
          ...input,
          spreadBps: high.bps.minus(low.bps).toFixed(),
          lowest: low.id,
          highest: high.id,
        });
      const next = slots.slice(i + 1).map((s) => s.tradingDate);
      const opening = (r.openingFacts as { facts?: OpeningFact[] } | null)?.facts?.find(
        (f) => f.symbol === symbol && f.openAt === slot.nextOpenAt.toISOString(),
      );
      for (const n of [5, 20] as const) {
        const observed = observeWindow(
          input,
          n,
          next,
          opening,
          (day) =>
            facts
              .get(day)
              ?.find(
                (f): f is Bar => f.kind === 'daily_bar' && f.symbol === symbol && f.date === day,
              ),
          (day) =>
            Boolean(
              (byDay.get(day)?.corporateActionCoverage as Record<string, string[]> | null)?.[symbol]
                ?.length,
            ),
        );
        if (r.tradingDate >= start || (observed.endDay && observed.endDay >= start))
          observations.push(observed);
      }
    }
  }
  divergences.sort(
    (a, b) =>
      D(b.spreadBps).cmp(a.spreadBps) ||
      a.day.localeCompare(b.day) ||
      a.symbol.localeCompare(b.symbol) ||
      a.roundId.localeCompare(b.roundId),
  );
  const marks = (s: string | undefined, id: string) =>
    s
      ? (arenaMarkSchema
          .array()
          .parse(byDay.get(s)?.packet?.closeMarks ?? [])
          .find((m) => m.entrantId === id)?.book ?? null)
      : null;
  const first: ArenaBook = {
    asOf: base.cutoff,
    cash: initialCash,
    nav: initialCash,
    positions: [],
  };
  const closing = slots.filter((s) => s.tradingDate >= start).at(-1)?.tradingDate;
  const attribution = base.comparison.rows
    .filter((r) => r.kind === 'model')
    .map((r) =>
      contributions(
        r.id,
        prev.length ? marks(prev.at(-1)!.tradingDate, r.id) : first,
        marks(closing, r.id),
        base.fills,
      ),
    );
  observations.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      a.symbol.localeCompare(b.symbol) ||
      a.window - b.window ||
      a.roundId.localeCompare(b.roundId),
  );
  return {
    ...base,
    laterNews: laterNews.sort(
      (a, b) => a.roundId.localeCompare(b.roundId) || a.ref.localeCompare(b.ref),
    ),
    divergences: divergences.slice(0, 10),
    observations,
    attribution,
  };
}
