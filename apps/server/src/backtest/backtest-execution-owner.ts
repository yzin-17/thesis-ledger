import type { PrismaService } from '../platform/prisma.service.js';
import { resolveBacktestRetryBudget } from './backtest-retry-budget.js';
import { persistedContractVersion } from './backtest-v3-run-lifecycle.js';

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled']);

export type BacktestExecutionPreparation =
  | { action: 'run'; ownerAttempt: number; maxAttempts: number }
  | {
      action: 'skip';
      reason:
        | 'missing'
        | 'terminal'
        | 'cancel_requested'
        | 'already_running'
        | 'unsupported_contract'
        | 'attempts_exhausted'
        | 'invalid_retry_budget';
    };

export async function prepareBacktestExecution(
  prisma: PrismaService,
  jobId: string,
  maxAttempts: number,
): Promise<BacktestExecutionPreparation> {
  const job = await prisma.backtestJob.findUnique({
    where: { id: jobId },
    select: {
      mode: true,
      status: true,
      executionAttempt: true,
      cancelRequestedAt: true,
      input: true,
    },
  });
  if (!job) return { action: 'skip', reason: 'missing' };
  if (persistedContractVersion(job) !== 3)
    return { action: 'skip', reason: 'unsupported_contract' };
  if (terminalStatuses.has(job.status)) return { action: 'skip', reason: 'terminal' };
  if (job.cancelRequestedAt) return { action: 'skip', reason: 'cancel_requested' };
  if (job.status !== 'queued') return { action: 'skip', reason: 'already_running' };

  let budget: ReturnType<typeof resolveBacktestRetryBudget>;
  try {
    budget = resolveBacktestRetryBudget(job.input, job.executionAttempt, maxAttempts);
  } catch {
    await prisma.backtestJob.updateMany({
      where: {
        id: jobId,
        mode: 'V3',
        status: 'queued',
        executionAttempt: job.executionAttempt,
        cancelRequestedAt: null,
      },
      data: {
        status: 'failed',
        stage: 'failed',
        progress: 100,
        finishedAt: new Date(),
        errorCode: 'invalid_retry_budget',
        errorSummary: '回测重试预算无效，已停止执行。',
      },
    });
    return { action: 'skip', reason: 'invalid_retry_budget' };
  }

  if (job.executionAttempt >= budget.maxAttempts) {
    await prisma.backtestJob.updateMany({
      where: {
        id: jobId,
        mode: 'V3',
        status: 'queued',
        executionAttempt: job.executionAttempt,
        cancelRequestedAt: null,
      },
      data: {
        status: 'failed',
        stage: 'failed',
        progress: 100,
        finishedAt: new Date(),
        errorCode: 'worker_attempts_exhausted',
        errorSummary: '回测 Worker 多次中断，已停止自动重试。',
      },
    });
    return { action: 'skip', reason: 'attempts_exhausted' };
  }

  return {
    action: 'run',
    ownerAttempt: job.executionAttempt + 1,
    maxAttempts: budget.maxAttempts,
  };
}
