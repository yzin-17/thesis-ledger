import type { PrismaService } from '../platform/prisma.service.js';

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled']);

export type BacktestExecutionPreparation =
  | { action: 'run'; ownerAttempt: number }
  | {
      action: 'skip';
      reason: 'missing' | 'terminal' | 'cancel_requested' | 'already_running' | 'attempts_exhausted';
    };

export async function prepareBacktestExecution(
  prisma: PrismaService,
  jobId: string,
  maxAttempts: number,
): Promise<BacktestExecutionPreparation> {
  const job = await prisma.backtestJob.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      executionAttempt: true,
      cancelRequestedAt: true,
    },
  });
  if (!job) return { action: 'skip', reason: 'missing' };
  if (terminalStatuses.has(job.status)) return { action: 'skip', reason: 'terminal' };
  if (job.cancelRequestedAt) return { action: 'skip', reason: 'cancel_requested' };
  if (job.status !== 'queued') return { action: 'skip', reason: 'already_running' };

  if (job.executionAttempt >= maxAttempts) {
    await prisma.backtestJob.updateMany({
      where: {
        id: jobId,
        status: 'queued',
        executionAttempt: job.executionAttempt,
        cancelRequestedAt: null,
      },
      data: {
        status: 'failed',
        progress: 100,
        finishedAt: new Date(),
        errorCode: 'worker_attempts_exhausted',
        errorSummary: '回测 Worker 多次中断，已停止自动重试。',
      },
    });
    return { action: 'skip', reason: 'attempts_exhausted' };
  }

  return { action: 'run', ownerAttempt: job.executionAttempt + 1 };
}
