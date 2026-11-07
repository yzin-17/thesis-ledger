import type { Prisma } from '@prisma/client';
import { arenaBudgetSchema, type ArenaBudget } from '@thesis-ledger/schemas';
const refund = (available: unknown, reserved: ArenaBudget, used: ArenaBudget) => {
  const amount = arenaBudgetSchema.parse(available);
  // 超出预留的真实用量照实审计，余额最低为零。
  return {
    requests: Math.max(0, amount.requests + reserved.requests - used.requests),
    tokens: Math.max(0, amount.tokens + reserved.tokens - used.tokens),
    costMicros: Math.max(0, amount.costMicros + reserved.costMicros - used.costMicros),
  };
};
// 调用方已锁比赛行。同一预留的首次结算才退还已知未用部分。
export async function settleReservation(
  tx: Prisma.TransactionClient,
  id: string,
  used: ArenaBudget | null,
  reconcileLateUsage = false,
) {
  const r = await tx.arenaReservation.findUniqueOrThrow({
    where: { id },
    include: { entrant: true, round: { include: { arena: true } } },
  });
  if (r.settledAt && !(reconcileLateUsage && used && r.decisionState === 'unknown_usage')) return;
  if (used) {
    const reserved = arenaBudgetSchema.parse(r.amount);
    await tx.arenaEntrant.update({
      where: { id: r.entrantId },
      data: { remaining: refund(r.entrant.remaining, reserved, used) },
    });
    await tx.modelArena.update({
      where: { id: r.arenaId },
      data: { remaining: refund(r.round.arena.remaining, reserved, used) },
    });
  }
  await tx.arenaReservation.update({ where: { id }, data: { settledAt: new Date() } });
}
