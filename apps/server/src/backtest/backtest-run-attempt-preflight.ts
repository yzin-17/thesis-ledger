import type { BacktestJob } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import { persistedRunContract } from './backtest-v3-run-lifecycle.js';
import {
  backtestRunnerIdentity,
  backtestHasExecutionHistory,
  indicatorEngineVersionMessage,
} from './backtest-indicator-engine-version.js';

export const prepareBacktestAttempt = async <TJob extends BacktestJob>(
  prisma: PrismaService,
  job: TJob,
  runnerId: string | undefined,
  queueDelivery: boolean,
): Promise<{ allowed: true; runnerId: string } | { allowed: false; job: TJob | null }> => {
  if (!persistedRunContract(job)) throw new Error('旧 Run 持久化合同拒绝执行');
  if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return { allowed: false, job };
  if (!queueDelivery && job.status !== 'queued') return { allowed: false, job };
  const identity = backtestRunnerIdentity(job.engineVersion, runnerId, backtestHasExecutionHistory(job));
  if (runnerId && (identity === 'same' || identity === 'unbound-new')) return { allowed: true, runnerId };
  let errorCode = 'BACKTEST_RUNNER_VERSION_CHANGED';
  let errorSummary = indicatorEngineVersionMessage;
  if (identity === 'unknown-executed') errorCode = 'BACKTEST_RUNNER_VERSION_UNKNOWN';
  if (identity === 'unavailable') {
    errorCode = 'BACKTEST_RUNNER_UNAVAILABLE';
    errorSummary = '当前资产的回测执行器未装配，Run未进入计算。';
  }
  await prisma.backtestJob.updateMany({
    where: { id: job.id, mode: 'frozen', status: 'queued', executionAttempt: job.executionAttempt, cancelRequestedAt: null },
    data: {
      status: 'failed',
      stage: 'failed',
      progress: 100,
      finishedAt: new Date(),
      errorCode,
      errorSummary,
    },
  });
  const current = await prisma.backtestJob.findUnique({ where: { id: job.id } });
  return { allowed: false, job: current as TJob | null };
};
