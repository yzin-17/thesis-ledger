import type { PrismaService } from '../platform/prisma.service.js';

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
  const stale = await prisma.aiRun.updateMany({
    where: {
      status: 'running',
      promptVersion: { not: 'strategy-optimization-v1' },
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
      promptVersion: { not: 'strategy-optimization-v1' },
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
    requeued: stale.count,
    failed: exhausted.count + optimizationUnknown.count,
    optimizationUnknown: optimizationUnknown.count,
  };
}
