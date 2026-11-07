import { z } from 'zod';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { marketCivilInstant } from '@thesis-ledger/domain';
import {
  arenaPointSchema,
  arenaProtocolSchema,
  type ArenaPointQuery,
  arenaRoundReportSchema,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

@Injectable()
export class ArenaRoundReports {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async points(ownerId: string, arenaId: string, q: ArenaPointQuery) {
    const arena = await this.db.modelArena.findFirst({
      where: { id: arenaId, ownerId },
      select: { protocol: true, entrants: { select: { id: true } } },
    });
    if (!arena || (q.entrantId && !arena.entrants.some((e) => e.id === q.entrantId)))
      throw new NotFoundException('比赛或模型不存在');
    const p = arenaProtocolSchema.parse(arena.protocol);
    if (!p.instruments.some((i) => i.symbol === q.symbol))
      throw new NotFoundException('比赛标的不存在');
    const dayAfter = new Date(Date.parse(q.end + 'T00:00:00Z') + 86400000)
      .toISOString()
      .slice(0, 10);
    const rows = await this.db.arenaFill.findMany({
      where: {
        symbol: q.symbol,
        executedAt: {
          gte: new Date(marketCivilInstant(q.start, 0, p.timeZone)),
          lt: new Date(marketCivilInstant(dayAfter, 0, p.timeZone)),
        },
        reservation: { arenaId, ...(q.entrantId && { entrantId: q.entrantId }) },
      },
      orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
      include: {
        reservation: {
          select: {
            roundId: true,
            entrantId: true,
            entrant: { select: { model: true, providerId: true } },
          },
        },
      },
    });
    const civil = new Intl.DateTimeFormat('en-CA', {
      timeZone: p.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return rows.map((f) =>
      arenaPointSchema.parse({
        id: f.id,
        arenaId,
        roundId: f.reservation.roundId,
        entrantId: f.reservation.entrantId,
        model: f.reservation.entrant.providerId + ' / ' + f.reservation.entrant.model,
        symbol: f.symbol,
        day: civil.format(f.executedAt),
        executedAt: f.executedAt.toISOString(),
        side: f.side,
        price: f.price.toFixed(),
        quantity: f.quantity.toFixed(),
      }),
    );
  }
  async read(ownerId: string, arenaId: string, roundId: string) {
    const round = await this.db.arenaRound.findFirst({
      where: { id: roundId, arenaId, arena: { ownerId } },
      include: {
        arena: { select: { protocol: true } },
        packet: true,
        reservations: {
          include: {
            entrant: { select: { model: true, providerId: true } },
            fills: { orderBy: { symbol: 'asc' } },
          },
          orderBy: { entrantId: 'asc' },
        },
      },
    });
    if (!round) throw new NotFoundException('比赛轮次不存在');
    return arenaRoundReportSchema.parse({
      id: round.id,
      arenaId,
      tradingDate: round.tradingDate,
      asOf: round.packet?.asOf.toISOString() ?? null,
      fingerprint: round.packet?.fingerprint ?? null,
      facts: round.packet?.facts ?? [],
      closeMarks: round.packet?.closeMarks ?? [],
      entries: round.reservations.map((r) => ({
        entrantId: r.entrantId,
        ...r.entrant,
        state: r.decisionState,
        requestId: r.requestId,
        ...arenaDispatchReceipt(
          r.requestAudit,
          r.requestId,
          arenaProtocolSchema.parse(round.arena.protocol).budgetCurrency,
        ),
        executionReasons: executionReasons(r.execution),
        decision: r.decision,
        book: r.privateBook,
        settledAt: r.settledAt?.toISOString() ?? null,
        executionAt: r.executionAt?.toISOString() ?? null,
        fills: r.fills.map((f) => ({
          symbol: f.symbol,
          side: f.side,
          quantity: f.quantity.toFixed(),
          price: f.price.toFixed(),
          fee: f.fee.toFixed(),
          sourceRef: f.sourceRef,
          executedAt: f.executedAt.toISOString(),
        })),
      })),
    });
  }
}

function arenaDispatchReceipt(raw: unknown, id: string | null, currency: string) {
  const audit = z
    .object({
      actualModel: z.string().nullish(),
      receivedAt: z.iso.datetime().optional(),
      cost: z
        .object({
          amount: z.string().nullable(),
          currency: z.string().nullable(),
          status: z.enum(['known', 'estimated', 'unknown']).optional(),
        })
        .optional(),
    })
    .safeParse(raw).data;
  return {
    actualModel: audit?.actualModel ?? null,
    receivedAt: audit?.receivedAt ?? null,
    costStatus: id ? (audit?.cost?.status ?? 'unknown') : 'known',
    modelCost: id ? (audit?.cost?.amount ?? null) : '0',
    costCurrency: id ? (audit?.cost?.currency ?? null) : currency,
  };
}
function executionReasons(raw: unknown) {
  const out = z
    .object({ reasons: z.record(z.string(), z.string()).optional(), reason: z.string().optional() })
    .safeParse(raw).data;
  return out?.reasons ?? (out?.reason ? { '': out.reason } : {});
}
