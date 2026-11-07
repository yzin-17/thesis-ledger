import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  arenaProtocolSchema,
  arenaComparisonSchema,
  arenaMarkSchema,
  marketInstrumentFactSchema,
  type ArenaComparison,
  type ArenaPeriod,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { arenaMetrics, benchmarkNav, equalWeightEntry } from './arena-performance.js';
import type { OpeningFact } from './arena-open-execution.js';

@Injectable()
export class ArenaComparisons {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async read(
    ownerId: string,
    id: string,
    period: ArenaPeriod,
    asOf = new Date(),
  ): Promise<ArenaComparison> {
    const arena = await this.db.modelArena.findFirst({
      where: { id, ownerId },
      include: { entrants: { orderBy: { id: 'asc' } } },
    });
    if (!arena) throw new NotFoundException('比赛不存在');
    const p = arenaProtocolSchema.parse(arena.protocol);
    const civil = new Intl.DateTimeFormat('en-CA', {
      timeZone: p.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const start = period.start ?? p.startsOn;
    const lastDay = civil.format(asOf);
    const end = period.end ?? (lastDay < p.startsOn ? p.startsOn : [p.endsOn, lastDay].sort()[0]!);
    if (start > end || start < p.startsOn || end > p.endsOn)
      throw new BadRequestException('区间超出比赛赛期');
    const [slots, rounds, allFills] = await Promise.all([
      this.db.arenaOccurrence.findMany({
        where: { arenaId: id, tradingDate: { lte: end }, dueAt: { lte: asOf } },
        orderBy: { tradingDate: 'asc' },
      }),
      this.db.arenaRound.findMany({
        where: { arenaId: id, tradingDate: { lte: end }, createdAt: { lte: asOf } },
        include: {
          packet: true,
          reservations: { select: { entrantId: true, decisionState: true, settledAt: true } },
        },
      }),
      this.db.arenaFill.findMany({
        where: {
          reservation: { arenaId: id },
          executedAt: { lte: asOf },
          recordedAt: { lte: asOf },
        },
        include: { reservation: { select: { entrantId: true } } },
      }),
    ]);
    const byDay = new Map(rounds.map((r) => [r.tradingDate, r]));
    const days = slots.filter((s) => s.tradingDate >= start);
    const prev = slots.filter((s) => s.tradingDate < start).at(-1);
    const inPeriod = (date: Date) => {
      const d = civil.format(date);
      return d >= start && d <= end;
    };
    const fills = allFills
      .filter((f) => inPeriod(f.executedAt))
      .map((f) => ({
        entrantId: f.reservation.entrantId,
        price: f.price.toFixed(),
        quantity: f.quantity.toFixed(),
        fee: f.fee.toFixed(),
      }));
    const marks = new Map(
      rounds.map((r) => [
        r.tradingDate,
        arenaMarkSchema
          .array()
          .parse(r.packet && r.packet.asOf <= asOf ? (r.packet.closeMarks ?? []) : []),
      ]),
    );
    const nav = (day: string, entrant: string) =>
      marks.get(day)?.find((m) => m.entrantId === entrant)?.book?.nav ?? null;
    const opened = days.filter((s) => {
      const r = byDay.get(s.tradingDate);
      return r && (r.outcome as { state: string }).state !== 'unopened';
    });
    const rows: ArenaComparison['rows'] = arena.entrants.map((e) => {
      const valid = opened.filter((s) =>
        byDay
          .get(s.tradingDate)
          ?.reservations.some(
            (r) =>
              r.entrantId === e.id &&
              r.settledAt &&
              r.settledAt <= asOf &&
              ['decision', 'observe'].includes(r.decisionState),
          ),
      );
      return {
        id: e.id,
        label: e.providerId + ' / ' + e.model,
        kind: 'model',
        rank: null,
        decisions: valid.length,
        metrics: arenaMetrics(
          prev ? nav(prev.tradingDate, e.id) : p.initialCash,
          days.map((s) => nav(s.tradingDate, e.id)),
          fills.filter((f) => f.entrantId === e.id),
        ),
      };
    });
    const ordered = rows
      .filter((r) => r.metrics.returnRatio !== null)
      .sort((a, b) => new Prisma.Decimal(b.metrics.returnRatio!).cmp(a.metrics.returnRatio!));
    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i]!,
        last = ordered[i - 1];
      row.rank = last && row.metrics.returnRatio === last.metrics.returnRatio ? last.rank : i + 1;
    }
    rows.push({
      id: 'cash',
      label: '现金基准',
      kind: 'cash',
      rank: null,
      decisions: 0,
      metrics: arenaMetrics(
        p.initialCash,
        days.map(() => p.initialCash),
        [],
      ),
    });
    const first = slots[0];
    const firstRound = first && byDay.get(first.tradingDate);
    const opening = (firstRound?.openingFacts as { facts?: OpeningFact[] } | null)?.facts;
    const baseline = first ? equalWeightEntry(p, first.nextOpenAt, opening) : null;
    function equalNav(day: string) {
      if (!first || day < civil.format(first.nextOpenAt)) return p.initialCash;
      const r = byDay.get(day);
      if (!r?.packet || r.packet.asOf > asOf) return null;
      return benchmarkNav(
        p.initialCash,
        baseline,
        marketInstrumentFactSchema.array().parse(r.packet.facts),
        day,
        r.packet.asOf,
        (r.corporateActionCoverage ?? {}) as Record<string, string[]>,
      );
    }
    const benchmark = arenaMetrics(
      prev ? equalNav(prev.tradingDate) : p.initialCash,
      days.map((s) => equalNav(s.tradingDate)),
      first && inPeriod(first.nextOpenAt) ? (baseline ?? []) : [],
    );
    rows.push({
      id: 'equal_weight',
      label: '等权买入持有基准',
      kind: 'equal_weight',
      rank: null,
      decisions: 0,
      metrics: {
        ...benchmark,
        tradeFees:
          first && inPeriod(first.nextOpenAt) && baseline === null ? null : benchmark.tradeFees,
      },
    });
    return arenaComparisonSchema.parse({
      arenaId: id,
      start,
      end,
      currency: p.currency,
      planned: days.length,
      opened: opened.length,
      rows,
    });
  }
}
