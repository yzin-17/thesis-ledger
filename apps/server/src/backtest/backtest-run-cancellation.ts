import { ConflictException } from '@nestjs/common';
import type { BacktestJob } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import { persistedRunContract } from './backtest-v3-run-lifecycle.js';

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled']);

export interface BacktestCancellationResult {
  job: BacktestJob | null;
  changed: boolean;
  wasQueued: boolean;
}

export async function requestBacktestCancellation(
  prisma: PrismaService,
  jobId: string,
): Promise<BacktestCancellationResult> {
  const job = await prisma.backtestJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return { job, changed: false, wasQueued: false };
  }
  if (!persistedRunContract(job)) {
    throw new ConflictException({
      code: 'UNSUPPORTED_CONTRACT_VERSION',
      message: '旧回测记录不支持取消',
    });
  }
  if (terminalStatuses.has(job.status)) return { job, changed: false, wasQueued: false };

  const now = new Date();
  // Run级意图不绑定早先读取的status或attempt，领取竞争不能丢掉取消。
  const registered = await prisma.backtestJob.updateMany({
    where: { id: jobId, mode: 'frozen', status: { notIn: [...terminalStatuses] }, cancelRequestedAt: null },
    data: { cancelRequestedAt: now },
  });
  const queued = await prisma.backtestJob.updateMany({
    where: { id: jobId, mode: 'frozen', status: 'queued', cancelRequestedAt: { not: null } },
    data: { status: 'cancelled', stage: 'cancelled', progress: 100, finishedAt: now },
  });
  const current = await prisma.backtestJob.findUnique({ where: { id: jobId } });
  if (current && !persistedRunContract(current))
    throw new ConflictException({ code: 'UNSUPPORTED_CONTRACT_VERSION', message: '旧回测记录不支持取消' });
  return { job: current, changed: registered.count > 0 || queued.count > 0, wasQueued: queued.count > 0 };
}
