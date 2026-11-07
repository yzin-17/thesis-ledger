import { analyzeArenaWeek } from './arena-week-analysis.js';
import { Inject, Injectable } from '@nestjs/common';
import type { ArenaWeek } from '@prisma/client';
import {
  arenaDecisionSchema,
  type ArenaWeekly,
  arenaProtocolSchema,
  arenaWeeklySchema,
} from '@thesis-ledger/schemas';
import { marketCivilInstant } from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import { ArenaComparisons } from './arena-comparison.js';

@Injectable()
export class ArenaWeekProjector {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ArenaComparisons) private readonly comparison: ArenaComparisons,
  ) {}
  async build(job: ArenaWeek, owner: string, raw: unknown): Promise<ArenaWeekly> {
    const p = arenaProtocolSchema.parse(raw);
    const cutoff = job.cutoff;
    const start = new Date(marketCivilInstant(job.periodStart, 0, p.timeZone));
    const comparison = await this.comparison.read(
      owner,
      job.arenaId,
      { start: job.periodStart, end: job.periodEnd },
      cutoff,
    );
    const [rounds, fills] = await Promise.all([
      this.db.arenaRound.findMany({
        where: {
          arenaId: job.arenaId,
          tradingDate: { gte: job.periodStart, lte: job.periodEnd },
          createdAt: { lte: cutoff },
        },
        orderBy: { tradingDate: 'asc' },
        include: {
          packet: true,
          reservations: { orderBy: { entrantId: 'asc' }, include: { entrant: true } },
        },
      }),
      this.db.arenaFill.findMany({
        where: {
          reservation: { arenaId: job.arenaId },
          executedAt: { gte: start, lt: cutoff },
          recordedAt: { lte: cutoff },
        },
        orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
        include: { reservation: { select: { entrantId: true, roundId: true } } },
      }),
    ]);
    const base = arenaWeeklySchema.parse({
      method: job.method,
      calendarVersion: p.calendarVersion,
      week: job.week,
      cutoff: cutoff.toISOString(),
      timeZone: p.timeZone,
      comparison,
      rounds: rounds.map((r) => {
        const outcome = r.outcome as { state: string; reason?: string };
        const entries = r.reservations.map((e) => {
          const settled = e.settledAt && e.settledAt <= cutoff;
          const audit = e.requestAudit as {
            receivedAt?: string;
            cost?: {
              amount?: string | null;
              currency?: string | null;
              status?: 'known' | 'estimated' | 'unknown';
            };
          } | null;
          const received = audit?.receivedAt && Date.parse(audit.receivedAt) <= cutoff.getTime();
          let costStatus: 'known' | 'estimated' | 'unknown' = 'unknown';
          let modelCost: string | null = null,
            costCurrency: string | null = null;
          if (!e.requestId && settled) {
            costStatus = 'known';
            modelCost = '0';
            costCurrency = p.budgetCurrency;
          } else if (received && audit?.cost) {
            costStatus = audit.cost.status ?? 'unknown';
            modelCost = audit.cost.amount ?? null;
            costCurrency = audit.cost.currency ?? null;
          }
          return {
            entrantId: e.entrantId,
            model: e.entrant.model,
            state: settled ? e.decisionState : 'pending',
            decision: settled && e.decision ? arenaDecisionSchema.parse(e.decision) : null,
            costStatus,
            modelCost,
            costCurrency,
            requestId: settled ? e.requestId : null,
          };
        });
        const state =
          outcome.state === 'sealed' && entries.some((e) => e.state === 'pending')
            ? 'open'
            : outcome.state;
        return {
          id: r.id,
          day: r.tradingDate,
          state,
          reason: outcome.reason ?? null,
          fingerprint: r.packet && r.packet.asOf <= cutoff ? r.packet.fingerprint : null,
          entries,
        };
      }),
      fills: fills.map((f) => ({
        id: f.id,
        ...f.reservation,
        symbol: f.symbol,
        side: f.side,
        quantity: f.quantity.toFixed(),
        price: f.price.toFixed(),
        fee: f.fee.toFixed(),
        executedAt: f.executedAt.toISOString(),
        sourceRef: f.sourceRef,
      })),
    });
    return analyzeArenaWeek(this.db, base, p.initialCash);
  }
}
