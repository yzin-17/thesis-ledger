import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { arenaDecisionSchema, arenaProtocolSchema, arenaBookSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { lockArena } from './model-arena.repository.js';
import { executeAtArenaOpen, type OpeningFact } from './arena-open-execution.js';
@Injectable()
export class ArenaExecutionStore {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  apply(id: string, at: Date, facts: OpeningFact[], missing: Record<string, string> = {}) {
    return this.db.$transaction(async (tx) => {
      const init = await tx.arenaReservation.findUniqueOrThrow({
        where: { id },
        include: { round: { include: { arena: true } } },
      });
      const arena = await lockArena(tx, init.arenaId, init.round.arena.ownerId);
      const row = await tx.arenaReservation.findUniqueOrThrow({
        where: { id },
        include: { entrant: true },
      });
      if (row.executionAt) return row.execution;
      const day = await tx.arenaOccurrence.findUniqueOrThrow({
        where: { arenaId_tradingDate: { arenaId: arena.id, tradingDate: init.round.tradingDate } },
      });
      if (at.getTime() !== day.nextOpenAt.getTime() || at.getTime() > Date.now())
        throw new ConflictException('尚未到达指定开盘');
      if (arena.state !== 'running' || !['decision', 'observe'].includes(row.decisionState))
        throw new ConflictException('指令不可执行');
      const decision = arenaDecisionSchema.parse(row.decision),
        book = arenaBookSchema.parse(row.privateBook),
        p = arenaProtocolSchema.parse(arena.protocol);
      if (row.entrant.cash.toFixed() !== new Prisma.Decimal(book.cash).toFixed())
        throw new ConflictException('模拟资金与决策快照不一致');
      const result = executeAtArenaOpen(p, book, decision, at.toISOString(), facts);
      const reasons = { ...result.reasons };
      for (const [symbol, reason] of Object.entries(missing))
        if (
          reasons[symbol] === 'opening_evidence_missing' ||
          reasons[symbol] === 'opening_valuation_missing'
        )
          reasons[symbol] = reason;
      if (result.fills.length)
        await tx.arenaFill.createMany({
          data: result.fills.map((f) => ({ ...f, reservationId: id, executedAt: at })),
        });
      await tx.arenaEntrant.update({ where: { id: row.entrantId }, data: { cash: result.cash } });
      const receipt = { version: 1, openAt: at.toISOString(), facts, cash: result.cash, reasons };
      await tx.arenaReservation.update({
        where: { id },
        data: { executionAt: new Date(), execution: receipt },
      });
      return receipt;
    });
  }
}
