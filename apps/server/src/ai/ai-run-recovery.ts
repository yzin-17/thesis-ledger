import type { PrismaService } from '../platform/prisma.service.js';
import { aiExecutionSummarySchema } from '@thesis-ledger/schemas';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const researchRecovery = (metadata: unknown) => {
  const parsed = aiExecutionSummarySchema.safeParse(asRecord(metadata)?.sdkExecution);
  if (!parsed.success || parsed.data.contract.id !== 'research') return 'unknown' as const;
  const requests = parsed.data.requests;
  if (requests.every((request) => request.state === 'prepared')) return 'requeue' as const;
  const last = requests.at(-1);
  if (
    last?.state === 'completed' &&
    last.error?.code === 'provider_rejected' &&
    last.error.externalResult === 'rejected_before_generation' &&
    requests.length < (parsed.data.frozenPolicy?.maxAiCalls ?? 0)
  )
    return 'requeue' as const;
  return 'unknown' as const;
};

export async function recoverStaleAiRuns(
  prisma: PrismaService,
  now: Date,
  maxAttempts: number,
) {
  const optimizationUnknown = await prisma.aiRun.updateMany({
    where: {
      status: 'running',
      promptVersion: 'strategy-optimization-v1',
      leaseUntil: { lt: now },
    },
    data: {
      status: 'failed',
      claimedAt: null,
      leaseUntil: null,
      errorCode: 'optimization_unknown_outcome',
      errorSummary: '优化 Provider 调用租约已过期，外部结果未知；禁止自动重新请求 Provider',
      completedAt: now,
    },
  });
  const findResearchRuns = (
    prisma.aiRun as unknown as {
      findMany?: (args: unknown) => Promise<
        Array<{ id: string; executionAttempt: number; modelMetadata: unknown }>
      >;
    }
  ).findMany;
  const researchRuns = findResearchRuns
    ? await findResearchRuns({
        where: {
          status: 'running',
          promptVersion: 'research-v1',
          leaseUntil: { lt: now },
        },
        select: { id: true, executionAttempt: true, modelMetadata: true },
      })
    : [];
  let researchRequeued = 0;
  let researchUnknown = 0;
  for (const run of researchRuns) {
    const recovery = researchRecovery(run.modelMetadata);
    const result = await prisma.aiRun.updateMany({
      where: {
        id: run.id,
        status: 'running',
        executionAttempt: run.executionAttempt,
        leaseUntil: { lt: now },
      },
      data:
        recovery === 'requeue'
          ? {
              status: 'queued',
              claimedAt: null,
              leaseUntil: null,
              errorCode: 'research_lease_recovered',
              errorSummary: '研究任务尚无结果未知的请求，已使用新的领取代次恢复',
            }
          : {
              status: 'failed',
              claimedAt: null,
              leaseUntil: null,
              errorCode: 'research_unknown_outcome',
              errorSummary: '研究任务租约过期且发送结果未知；禁止自动重放 Provider',
              completedAt: now,
            },
    });
    if (result.count === 1 && recovery === 'requeue') researchRequeued += 1;
    if (result.count === 1 && recovery === 'unknown') researchUnknown += 1;
  }
  const stale = await prisma.aiRun.updateMany({
    where: {
      status: 'running',
      promptVersion: { notIn: ['strategy-optimization-v1', 'research-v1'] },
      leaseUntil: { lt: now },
      executionAttempt: { lt: maxAttempts },
    },
    data: {
      status: 'queued',
      claimedAt: null,
      leaseUntil: null,
      errorCode: 'worker_lease_expired',
      errorSummary: '执行 Worker 租约已过期，任务已重新排队',
    },
  });
  const exhausted = await prisma.aiRun.updateMany({
    where: {
      status: 'running',
      promptVersion: { notIn: ['strategy-optimization-v1', 'research-v1'] },
      leaseUntil: { lt: now },
      executionAttempt: { gte: maxAttempts },
    },
    data: {
      status: 'failed',
      claimedAt: null,
      leaseUntil: null,
      errorCode: 'worker_lease_exhausted',
      errorSummary: '执行 Worker 多次租约过期，已停止自动重试',
      completedAt: now,
    },
  });
  return {
    requeued: stale.count + researchRequeued,
    failed: exhausted.count + optimizationUnknown.count + researchUnknown,
    optimizationUnknown: optimizationUnknown.count,
  };
}
