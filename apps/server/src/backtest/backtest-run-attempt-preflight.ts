import type { BacktestJob } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import { persistedContractVersion } from './backtest-v3-run-lifecycle.js';
import {
  indicatorEngineChanged,
  indicatorEngineVersionMessage,
} from './backtest-indicator-engine-version.js';

export const prepareBacktestAttempt = async <TJob extends BacktestJob>(
  prisma: PrismaService,
  job: TJob,
  runnerId: string,
  queueDelivery: boolean,
): Promise<{ allowed: true } | { allowed: false; job: TJob | null }> => {
  if (persistedContractVersion(job) !== 3) throw new Error('旧 Run 持久化合同拒绝执行');
  if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return { allowed: false, job };
  if (!queueDelivery && job.status !== 'queued') return { allowed: false, job };
  if (!indicatorEngineChanged(job.engineVersion, runnerId)) return { allowed: true };
  await prisma.backtestJob.updateMany({
    where: { id: job.id, status: 'queued', executionAttempt: job.executionAttempt },
    data: {
      status: 'failed',
      stage: 'failed',
      progress: 100,
      finishedAt: new Date(),
      errorCode: 'INDICATOR_ENGINE_VERSION_CHANGED',
      errorSummary: indicatorEngineVersionMessage,
    },
  });
  const current = await prisma.backtestJob.findUnique({ where: { id: job.id } });
  return { allowed: false, job: current as TJob | null };
};
