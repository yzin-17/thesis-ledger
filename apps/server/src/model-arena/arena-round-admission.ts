import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { arenaBudgetSchema, arenaProtocolSchema, type ArenaBudget } from '@thesis-ledger/schemas';
import { z } from 'zod';
import { PrismaService } from '../platform/prisma.service.js';
import { lockArena } from './model-arena.repository.js';

const zero = () => ({ requests: 0, tokens: 0, costMicros: 0 });
const covers = (left: ArenaBudget, need: ArenaBudget) =>
  left.requests >= need.requests &&
  left.tokens >= need.tokens &&
  left.costMicros >= need.costMicros;
const subtract = (left: ArenaBudget, need: ArenaBudget) => ({
  requests: left.requests - need.requests,
  tokens: left.tokens - need.tokens,
  costMicros: left.costMicros - need.costMicros,
});
type Outcome =
  | { state: 'open' }
  | {
      state: 'unopened';
      reason: 'participant_budget' | 'competition_budget' | 'unknown_pricing';
      entrantId: string | null;
    };
// 调度方按显式模型与冻结币种取得本轮最坏费用。缺项必须保持未知。
export type RoundPricing = ReadonlyMap<string, { currency: string; maxCostMicros: number }>;
@Injectable()
export class ArenaRoundAdmission {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  open(
    ownerId: string,
    id: string,
    tradingDate: string,
    pricing: RoundPricing,
    claim?: { id: string; attempt: number },
    corporateActionCoverage: Record<string, string[]> = {},
  ) {
    z.iso.date().parse(tradingDate);
    return this.db.$transaction(async (tx) => {
      const arena = await lockArena(tx, id, ownerId);
      if (claim) {
        const completed = await tx.arenaOccurrence.updateMany({
          where: {
            id: claim.id,
            arenaId: id,
            tradingDate,
            state: 'running',
            attempt: claim.attempt,
            deadlineAt: { gt: new Date() },
            leaseUntil: { gt: new Date() },
            arena: { state: 'running' },
          },
          data: { state: 'complete', leaseUntil: null },
        });
        if (!completed.count) throw new ConflictException('轮次领取已过期');
      }
      const existing = await tx.arenaRound.findUnique({
        where: { arenaId_tradingDate: { arenaId: id, tradingDate } },
      });
      if (existing) return existing;
      const protocol = arenaProtocolSchema.parse(arena.protocol);
      if (
        arena.state !== 'running' ||
        tradingDate < protocol.startsOn ||
        tradingDate > protocol.endsOn
      )
        throw new ConflictException('当前比赛不能开轮');
      const entrants = await tx.arenaEntrant.findMany({
        where: { arenaId: id },
        orderBy: [{ providerId: 'asc' }, { model: 'asc' }],
      });
      if (entrants.length !== protocol.entrants.length)
        throw new ConflictException('参赛名单不完整');
      const plan: { entrantId: string; need: ArenaBudget; remaining: ArenaBudget }[] = [];
      const total = zero();
      let outcome: Outcome = { state: 'open' };
      for (const entrant of entrants) {
        const binding = protocol.entrants.find(
          (e) => e.providerId === entrant.providerId && e.model === entrant.model,
        );
        if (!binding) throw new ConflictException('参赛名单已变化');
        const price = pricing.get(entrant.id);
        if (
          !price ||
          price.currency !== protocol.budgetCurrency ||
          !Number.isSafeInteger(price.maxCostMicros) ||
          price.maxCostMicros < 0
        ) {
          outcome = { state: 'unopened', reason: 'unknown_pricing', entrantId: entrant.id };
          break;
        }
        const need = {
          requests: 1,
          tokens: binding.maxInputTokens + binding.maxOutputTokens,
          costMicros: price.maxCostMicros,
        };
        const available = arenaBudgetSchema.parse(entrant.remaining);
        if (!covers(available, need)) {
          outcome = { state: 'unopened', reason: 'participant_budget', entrantId: entrant.id };
          break;
        }
        total.requests += need.requests;
        total.tokens += need.tokens;
        total.costMicros += need.costMicros;
        plan.push({ entrantId: entrant.id, need, remaining: subtract(available, need) });
      }
      const available = arenaBudgetSchema.parse(arena.remaining);
      if (outcome.state === 'open' && !covers(available, total))
        outcome = { state: 'unopened', reason: 'competition_budget', entrantId: null };
      const round = await tx.arenaRound.create({
        data: { arenaId: id, tradingDate, outcome, corporateActionCoverage },
      });
      if (outcome.state === 'unopened') return round;
      await tx.modelArena.update({
        where: { id },
        data: { remaining: subtract(available, total) },
      });
      for (const row of plan) {
        await tx.arenaEntrant.update({
          where: { id: row.entrantId },
          data: { remaining: row.remaining },
        });
        await tx.arenaReservation.create({
          data: { arenaId: id, roundId: round.id, entrantId: row.entrantId, amount: row.need },
        });
      }
      return round;
    });
  }
}
