import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  backtestPreparationFailureInputSchema,
  type BacktestRunPreparationRequestV3,
} from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from './backtest-snapshot.js';

/** 只登记准备失败终态，不生成正式配置、快照或队列任务。 */
export async function recordBacktestPreparationFailure(
  tx: Prisma.TransactionClient,
  failure: {
    submissionId: string;
    preparation: BacktestRunPreparationRequestV3;
    reason: string;
    diagnostics?: Prisma.InputJsonValue | undefined;
    createdAt: Date;
  },
) {
  const input = backtestPreparationFailureInputSchema.parse({
    contractVersion: 1,
    schemaVersion: 'backtest-trade-run-v1',
    kind: 'preparation-failure',
    submissionId: failure.submissionId,
    preparation: failure.preparation,
  });
  const request = input.preparation;
  const job = await tx.backtestJob.upsert({
    where: {
      strategyVersionId_idempotencyKey: {
        strategyVersionId: request.strategyVersionId,
        idempotencyKey: `strategy-submit:${failure.submissionId}`,
      },
    },
    update: {},
    create: {
      strategyVersionId: request.strategyVersionId,
      idempotencyKey: `strategy-submit:${failure.submissionId}`,
      mode: 'frozen',
      status: 'failed',
      stage: 'preparation-failed',
      progress: 100,
      periodStart: new Date(`${request.runConfig.startDate}T00:00:00Z`),
      periodEnd: new Date(`${request.runConfig.endDate}T00:00:00Z`),
      dataAsOf: new Date(request.runConfig.dataAsOf),
      input,
      errorCode: 'PREPARATION_FAILED',
      errorSummary: failure.reason,
      ...(failure.diagnostics ? { diagnostics: failure.diagnostics } : {}),
      createdAt: failure.createdAt,
      finishedAt: new Date(),
    },
  });
  if (job.status !== 'failed' || job.errorCode !== 'PREPARATION_FAILED' ||
      hashCanonicalManifest(job.input) !== hashCanonicalManifest(input))
    throw new ConflictException('提交标识已关联其他回测任务');
  return job;
}
