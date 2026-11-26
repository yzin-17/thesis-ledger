import { ConflictException } from '@nestjs/common';
import type { BacktestJob } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import { asRecord } from './backtest-v3-run-lifecycle.js';

export async function advanceBacktestStage(prisma: PrismaService, job: BacktestJob, signal: AbortSignal,
  stage: 'preparing' | 'freezing' | 'simulating' | 'analyzing') {
  signal.throwIfAborted();
  const progress = { preparing: 10, freezing: 25, simulating: 40, analyzing: 90 }[stage];
  const changed = await prisma.backtestJob.updateMany({ where: {
    id: job.id, mode: 'frozen', status: 'running', executionAttempt: job.executionAttempt, cancelRequestedAt: null,
  }, data: { stage, progress } });
  if (changed.count !== 1) throw new ConflictException({ code: 'BACKTEST_ATTEMPT_OWNERSHIP_LOST', message: '回测已取消或执行归属已变化。' });
  signal.throwIfAborted();
}

/** 只关联完整、不可变的本次产物；文件不在此处移动或覆盖。 */
export async function publishBacktestSnapshot(prisma: PrismaService, job: BacktestJob, signal: AbortSignal,
  manifest: { contentHash: string; manifestVersion: string }, storageAttempt: number, warnings: readonly string[] = []) {
  signal.throwIfAborted();
  const input = { ...asRecord(job.input), snapshotId: manifest.contentHash,
    snapshotVersion: manifest.manifestVersion, snapshotStorageAttempt: storageAttempt };
  const changed = await prisma.backtestJob.updateMany({ where: {
    id: job.id, mode: 'frozen', status: 'running', executionAttempt: job.executionAttempt, cancelRequestedAt: null,
    snapshotId: null,
  }, data: { snapshotId: manifest.contentHash, snapshotManifest: manifest,
    input, warnings: [...warnings] } });
  if (changed.count !== 1) throw new ConflictException({ code: 'BACKTEST_ATTEMPT_OWNERSHIP_LOST', message: '快照未关联：回测已取消或执行归属已变化。' });
  const current = await prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } });
  signal.throwIfAborted();
  return current;
}
