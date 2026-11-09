import type { Prisma, StrategySubmission } from '@prisma/client';
import { strategySubmissionInputSchema } from '@thesis-ledger/schemas';
import { recordBacktestPreparationFailure } from '../backtest/backtest-preparation-failure.js';
import type { PrismaService } from '../platform/prisma.service.js';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** 提交协调层拥有事务；任务的准备失败合同由 Backtest 拥有。 */
export async function settleOrdinarySubmissionFailure(
  db: PrismaService,
  row: StrategySubmission,
  reason: string,
  prepared?: unknown,
) {
  const input = strategySubmissionInputSchema.parse(row.input);
  if (input.kind !== 'ordinary') return false;
  await db.$transaction(async (tx) => {
    const claim = await tx.strategySubmission.updateMany({
      where: { id: row.id, state: row.state, attempt: row.attempt },
      data: { state: 'creating' },
    });
    if (!claim.count) return;
    const stored = await tx.strategySubmission.findUniqueOrThrow({ where: { id: row.id }, select: { prepared: true } });
    const detail = prepared ?? stored.prepared;
    const diagnostics = detail && typeof detail === 'object' && 'diagnostics' in detail ? detail.diagnostics : undefined;
    const first: unknown = Array.isArray(diagnostics) ? diagnostics[0] : undefined;
    const summary = first && typeof first === 'object' && 'message' in first && typeof first.message === 'string'
      ? first.message : reason;
    const job = await recordBacktestPreparationFailure(tx, {
      submissionId: row.id,
      preparation: input.preparation,
      reason: summary,
      createdAt: row.createdAt,
      diagnostics: detail ? json(detail) : undefined,
    });
    const settled = await tx.strategySubmission.updateMany({
      where: { id: row.id, state: 'creating', attempt: row.attempt },
      data: {
        state: 'submitted',
        ...(detail ? { prepared: json(detail) } : {}),
        outcome: { id: job.id, reason, ...(diagnostics ? { diagnostics: json(diagnostics) } : {}) },
      },
    });
    if (settled.count !== 1) throw new Error('回测失败任务关联未完成');
  });
  return true;
}
