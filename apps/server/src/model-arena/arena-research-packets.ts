import { settleReservation } from './arena-settlement.js';
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  arenaBookSchema,
  arenaProtocolSchema,
  marketInstrumentFactSchema,
  type MarketInstrumentFact,
  type ArenaMark,
} from '@thesis-ledger/schemas';
import { MarketInstrumentEvidence } from '../market/market-instrument-evidence.js';
import { PrismaService } from '../platform/prisma.service.js';
import { lockArena } from './model-arena.repository.js';

type Fill = { symbol: string; side: string; quantity: Prisma.Decimal; cashDelta: Prisma.Decimal };
export function arenaBookAt(
  initialCash: string,
  fills: Fill[],
  facts: MarketInstrumentFact[],
  day: string,
  asOf: Date,
) {
  let cash = new Prisma.Decimal(initialCash);
  const amounts = new Map<string, Prisma.Decimal>();
  for (const f of fills) {
    cash = cash.plus(f.cashDelta);
    const q = amounts.get(f.symbol) ?? new Prisma.Decimal(0);
    amounts.set(f.symbol, f.side === 'buy' ? q.plus(f.quantity) : q.minus(f.quantity));
  }
  if (cash.isNegative()) return null;
  let nav = cash;
  const positions = [];
  for (const [symbol, quantity] of [...amounts].sort(([a], [b]) => a.localeCompare(b))) {
    if (quantity.isZero()) continue;
    const close = facts.find(
      (f) => f.kind === 'daily_bar' && f.date === day && f.symbol === symbol,
    );
    if (quantity.isNegative() || close?.kind !== 'daily_bar') return null;
    positions.push({ symbol, quantity: quantity.toFixed(), close: close.close });
    nav = nav.plus(quantity.times(close.close));
  }
  return arenaBookSchema.parse({
    asOf: asOf.toISOString(),
    cash: cash.toFixed(),
    nav: nav.toFixed(),
    positions,
  });
}
@Injectable()
export class ArenaResearchPackets {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MarketInstrumentEvidence) private readonly market: MarketInstrumentEvidence,
  ) {}
  async freeze(id: string) {
    const row = await this.db.arenaRound.findUniqueOrThrow({
      where: { id },
      include: { arena: true, packet: true },
    });
    if (row.packet) return row.packet;
    const state = (row.outcome as { state: string }).state;
    if (!['open', 'unopened'].includes(state)) return null;
    const protocol = arenaProtocolSchema.parse(row.arena.protocol);
    let asOf = row.createdAt;
    let news: MarketInstrumentFact[] = [];
    if (state === 'open' && row.arena.state === 'running') {
      const slot = await this.db.arenaOccurrence.findUnique({
        where: { arenaId_tradingDate: { arenaId: row.arenaId, tradingDate: row.tradingDate } },
        select: { deadlineAt: true },
      });
      if (slot && slot.deadlineAt.getTime() > Date.now()) {
        const collected = await this.market.recentNews(protocol, slot.deadlineAt);
        const completed = new Date();
        if (collected.length && completed < slot.deadlineAt) {
          asOf = completed;
          news = collected;
        }
      }
    }
    const facts = marketInstrumentFactSchema
      .array()
      .parse([...(await this.market.read(protocol, row.tradingDate, asOf)), ...news])
      .filter(
        (f) =>
          Date.parse(f.availableAt) <= asOf.getTime() &&
          f.date <= row.tradingDate &&
          (f.kind !== 'news' || Date.parse(f.publishedAt) <= asOf.getTime()),
      )
      .sort((a, b) => a.ref.localeCompare(b.ref));
    const promptVersion = 'arena-targets-v1';
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([promptVersion, asOf.toISOString(), facts]))
      .digest('hex');
    return this.db.$transaction(async (tx) => {
      const arena = await lockArena(tx, row.arenaId, row.arena.ownerId);
      const existing = await tx.arenaResearchPacket.findUnique({ where: { roundId: id } });
      if (existing) return existing;
      const entrants = await tx.arenaEntrant.findMany({
        where: { arenaId: arena.id },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      const coverage = (row.corporateActionCoverage ?? {}) as Record<string, string[]>;
      const closeMarks: ArenaMark[] = [];
      const hasPrices = protocol.instruments.every((i) =>
        facts.some(
          (f) => f.kind === 'daily_bar' && f.date === row.tradingDate && f.symbol === i.symbol,
        ),
      );
      for (const entrant of entrants) {
        const fills = await tx.arenaFill.findMany({
          where: {
            reservation: { entrantId: entrant.id },
            executedAt: { lte: asOf },
            recordedAt: { lte: asOf },
          },
          orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
        });
        const earlier = await tx.arenaReservation.findMany({
          where: {
            entrantId: entrant.id,
            OR: [{ executionAt: null }, { executionAt: { gt: asOf } }],
            decisionState: 'decision',
            round: { tradingDate: { lt: row.tradingDate } },
          },
          select: { id: true },
          take: 1,
        });
        const value = arenaBookAt(protocol.initialCash, fills, facts, row.tradingDate, asOf);
        let reason: ArenaMark['reason'] = null;
        if (earlier.length) reason = 'pending_execution';
        else if (!value) reason = 'valuation_unavailable';
        else if (value.positions.some((i) => !coverage[i.symbol]?.length))
          reason = 'corporate_action_unverified';
        const book = reason ? null : value;
        closeMarks.push({ entrantId: entrant.id, book, reason });
        const reservation = await tx.arenaReservation.findUnique({
          where: { roundId_entrantId: { roundId: id, entrantId: entrant.id } },
        });
        if (!reservation || reservation.decisionState !== 'pending' || arena.state !== 'running')
          continue;
        await tx.arenaReservation.update({
          where: { id: reservation.id },
          data: {
            ...(book ? { privateBook: book } : {}),
            decisionState: book && hasPrices ? 'ready' : 'missing_material',
          },
        });
        if (!book || !hasPrices)
          await settleReservation(tx, reservation.id, { requests: 0, tokens: 0, costMicros: 0 });
      }
      const common = await tx.arenaResearchPacket.create({
        data: { roundId: id, promptVersion, asOf, facts, fingerprint, closeMarks },
      });
      return common;
    });
  }
}
