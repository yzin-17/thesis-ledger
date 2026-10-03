import { ConflictException } from '@nestjs/common';
import type { BacktestJob } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import type { BacktestQueueService } from './backtest-queue.service.js';
import {
  BacktestSnapshotUnavailableError,
  BacktestV3RunLifecycle,
} from './backtest-v3-run-lifecycle.js';
import type { BacktestSnapshotBuilder } from './backtest-run.service.js';
import type { BacktestNavRunExecution } from './backtest-nav-run-execution.js';
import { isNavBacktestInput } from './backtest-nav-run-read.js';
import { loadVerifiedBacktestV3Snapshot } from './backtest-v3-run-execution.js';
import type { LocalSnapshotStore } from './backtest-snapshot.js';

export async function verifyBacktestRunRetrySnapshot(input: {
  job: BacktestJob;
  prisma: PrismaService;
  snapshotBuilder?: BacktestSnapshotBuilder | undefined;
  snapshotStore: LocalSnapshotStore;
  queueService?: BacktestQueueService | undefined;
  navExecution?: BacktestNavRunExecution | undefined;
  defaultV3RunnerAvailable: boolean;
}): Promise<void> {
  const { job, prisma, snapshotBuilder, snapshotStore, queueService, navExecution } = input;
  if (isNavBacktestInput(job.input)) {
    if (!navExecution) {
      throw new ConflictException({
        code: 'NAV_V3_EXECUTION_UNAVAILABLE',
        message: 'NAV Runner 未配置，当前 Run 不能 retry',
      });
    }
    if (!queueService?.supportsNavExecution()) {
      throw new ConflictException({
        code: 'QUEUE_UNAVAILABLE',
        message: 'NAV Run 队列未配置，当前 Run 不能 retry',
      });
    }
    try {
      await navExecution.loadVerified(job);
    } catch (error) {
      if (error instanceof BacktestSnapshotUnavailableError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
    return;
  }

  new BacktestV3RunLifecycle(
    prisma,
    snapshotBuilder,
    queueService,
    input.defaultV3RunnerAvailable,
  ).assertRetryAvailable(job);
  try {
    await loadVerifiedBacktestV3Snapshot(job, snapshotStore);
  } catch (error) {
    if (error instanceof BacktestSnapshotUnavailableError) {
      throw new ConflictException({ code: error.code, message: error.message });
    }
    throw error;
  }
}
