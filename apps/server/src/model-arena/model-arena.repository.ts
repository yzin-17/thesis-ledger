import { settleReservation } from './arena-settlement.js';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  arenaCanTransition,
  arenaProtocolSchema,
  arenaStateSchema,
  type ArenaState,
} from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';

export async function lockArena(tx: Prisma.TransactionClient, id: string, ownerId: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "ModelArena" WHERE id=${id}::uuid AND "ownerId"=${ownerId}::uuid FOR UPDATE`;
  if (!rows.length) throw new NotFoundException('比赛不存在');
  return tx.modelArena.findUniqueOrThrow({ where: { id } });
}

@Injectable()
export class ModelArenaRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  create(ownerId: string, raw: unknown) {
    const protocol = arenaProtocolSchema.parse(raw);
    return this.db.$transaction(async (tx) => {
      const instruments = await tx.instrument.findMany({
        where: { id: { in: protocol.instruments.map((i) => i.instrumentId) }, active: true },
        select: { id: true, canonicalCode: true, market: true, instrumentType: true },
      });
      const byId = new Map(instruments.map((i) => [i.id, i]));
      for (const i of protocol.instruments) {
        const row = byId.get(i.instrumentId);
        if (
          !row ||
          row.instrumentType !== i.assetType ||
          row.canonicalCode + '.' + row.market !== i.symbol
        )
          throw new BadRequestException('比赛标的与当前目录身份不一致');
      }
      return tx.modelArena.create({
        data: {
          ownerId,
          protocol,
          remaining: protocol.budget,
          entrants: {
            create: protocol.entrants.map((e) => ({
              providerId: e.providerId,
              model: e.model,
              remaining: e.budget,
              cash: protocol.initialCash,
            })),
          },
        },
        select: { id: true, state: true },
      });
    });
  }
  list(ownerId: string) {
    return this.db.modelArena.findMany({
      where: { ownerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: { id: true, state: true, protocol: true, createdAt: true },
    });
  }
  async read(ownerId: string, id: string) {
    const arena = await this.db.modelArena.findFirst({
      where: { id, ownerId },
      include: {
        entrants: { orderBy: { id: 'asc' } },
        rounds: { orderBy: { tradingDate: 'desc' }, take: 50 },
      },
    });
    if (!arena) throw new NotFoundException('比赛不存在');
    return arena;
  }
  transition(ownerId: string, id: string, next: ArenaState) {
    return this.db.$transaction(async (tx) => {
      const row = await lockArena(tx, id, ownerId);
      if (!arenaCanTransition(arenaStateSchema.parse(row.state), next))
        throw new ConflictException('比赛状态已变化');
      if (next === 'paused' || next === 'ended') {
        await tx.arenaReservation.updateMany({
          where: { arenaId: id, decisionState: 'dispatching' },
          data: { decisionState: 'cancelled' },
        });
        const unsent = await tx.arenaReservation.findMany({
          where: { arenaId: id, decisionState: { in: ['pending', 'ready'] }, settledAt: null },
          select: { id: true },
        });
        for (const r of unsent) {
          await tx.arenaReservation.update({
            where: { id: r.id },
            data: { decisionState: 'cancelled' },
          });
          await settleReservation(tx, r.id, { requests: 0, tokens: 0, costMicros: 0 });
        }
        await tx.arenaReservation.updateMany({
          where: { arenaId: id, executionAt: null, decisionState: { in: ['decision', 'observe'] } },
          data: {
            executionAt: new Date(),
            execution: { state: 'cancelled', reason: 'arena_' + next },
          },
        });
        const dueAt = next === 'paused' ? { lte: new Date() } : undefined;
        await tx.arenaOccurrence.updateMany({
          where: {
            arenaId: id,
            state: { in: ['scheduled', 'running'] },
            ...(dueAt ? { dueAt } : {}),
          },
          data: { state: 'skipped', reason: 'arena_' + next, leaseUntil: null },
        });
      }
      return tx.modelArena.update({
        where: { id },
        data: { state: next, ...(next === 'ended' ? { endedAt: new Date() } : {}) },
        select: { id: true, state: true },
      });
    });
  }
}
