import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  optimizationRetryRequestSchema,
  optimizationRetryStateSchema,
} from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import { toRecord, type ExperimentRow } from './strategy-optimization-common.js';
import { markOptimizationUnknownOutcome, type OptimizationStepRow } from './strategy-optimization-attempt-lifecycle.js';

function assertRemainingBudget(experiment: ExperimentRow) {
  const budget = toRecord(experiment.budget);
  const counters = [
    ['maxAiCalls', experiment.aiCallsUsed],
    ['maxBacktestRuns', experiment.backtestRunsUsed],
    ['maxInputTokens', experiment.inputTokensUsed],
    ['maxOutputTokens', experiment.outputTokensUsed],
  ] as const;
  for (const [key, used] of counters) {
    const limit = Number(budget[key] ?? 0);
    if (limit > 0 && used >= limit) throw new BadRequestException('实验累计预算已耗尽，无法重试');
  }
  if (budget.maxCost !== undefined) {
    if (typeof budget.maxCost !== 'string' && typeof budget.maxCost !== 'number')
      throw new BadRequestException('实验费用预算格式无效，无法重试');
    if (experiment.costUsed.gte(budget.maxCost))
      throw new BadRequestException('实验累计费用预算已耗尽，无法重试');
  }
  const usedMs =
    experiment.updatedAt.getTime() - experiment.createdAt.getTime() - experiment.pausedDurationMs;
  if (usedMs >= Number(budget.maxDurationSeconds ?? 1800) * 1000)
    throw new BadRequestException('实验累计运行时长已耗尽，无法重试');
}

/** 人工受理只追加审计并排队；不调用模型、不删除尝试、不变更预算。 */
export async function requestOptimizationRetry(prisma: PrismaService, id: string, input: unknown) {
  const request = optimizationRetryRequestSchema.parse(input);
  return prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id"=${id}::uuid AND "ownerKey"='local-user' FOR UPDATE
    `);
    const experiment = rows[0];
    if (!experiment) throw new NotFoundException('优化实验不存在');
    const state = optimizationRetryStateSchema.parse(experiment.retryState ?? {});
    const previous = state.history.find((item) => item.idempotencyKey === request.idempotencyKey);
    if (previous) {
      if (previous.executionAttempt !== request.expectedExecutionAttempt)
        throw new ConflictException('重试请求身份与原执行尝试不一致');
      return { accepted: false };
    }
    if (experiment.status !== 'failed' || experiment.cancelRequestedAt !== null)
      throw new ConflictException('只有已失败的实验可以重试，请刷新当前状态');
    if (experiment.executionAttempt !== request.expectedExecutionAttempt)
      throw new ConflictException('实验执行状态已变化，请刷新后再重试');
    if (
      (Array.isArray(experiment.lockedCandidateIds) && experiment.lockedCandidateIds.length) ||
      toRecord(experiment.baselineRunRefs).test
    )
      throw new BadRequestException('封存测试已锁定，请使用未完成测试的重试入口');
    assertRemainingBudget(experiment);
    const attempts = await transaction.$queryRaw<OptimizationStepRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationAttempt" WHERE "experimentId"=${id}::uuid
    `);
    if (attempts.some(attempt => attempt.status === 'running' &&
      (!attempt.leaseUntil || attempt.leaseUntil.getTime() >= Date.now())))
      throw new ConflictException('模型请求尚未停止，请等待当前请求收敛后重试');
    for (const attempt of attempts.filter(attempt => attempt.status === 'running')) {
      await markOptimizationUnknownOutcome(transaction, attempt,
        new Error('人工重试确认：旧模型请求租约已过期，外部结果未知'));
      attempt.status = 'unknown_outcome';
    }
    const roundOffset = Math.max(
      state.roundOffset,
      0,
      ...attempts.map((attempt) => attempt.attempt),
    );
    const allowedUnknownAttemptIds = attempts
      .filter((attempt) => attempt.status === 'unknown_outcome')
      .map((attempt) => attempt.id);
    const nextState = {
      roundOffset,
      allowedUnknownAttemptIds,
      history: [
        ...state.history,
        {
          idempotencyKey: request.idempotencyKey,
          executionAttempt: experiment.executionAttempt,
          failedAt: experiment.updatedAt.toISOString(),
          requestedAt: new Date().toISOString(),
          stopReason: experiment.stopReason,
          roundOffset,
          allowedUnknownAttemptIds,
        },
      ],
    };
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='queued', "stage"='preparing', "retryState"=${JSON.stringify(nextState)}::jsonb,
          "executionAttempt"="executionAttempt"+1, "stopReason"=NULL, "leaseUntil"=NULL,
          "pausedDurationMs"="pausedDurationMs"+GREATEST(0,
            FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-"updatedAt"))*1000))::int,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status"='failed' AND "executionAttempt"=${request.expectedExecutionAttempt}
        AND "cancelRequestedAt" IS NULL
    `);
    if (updated !== 1) throw new ConflictException('实验执行状态已变化，请刷新后再重试');
    return { accepted: true };
  });
}
