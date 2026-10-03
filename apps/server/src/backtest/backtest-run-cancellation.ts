import { ConflictException } from '@nestjs/common';
import type { BacktestJob } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import { persistedContractVersion } from './backtest-v3-run-lifecycle.js';

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
  if (persistedContractVersion(job) !== 3) {
    throw new ConflictException({
      code: 'UNSUPPORTED_CONTRACT_VERSION',
      message: '旧回测记录不支持取消',
    });
  }
  if (terminalStatuses.has(job.status)) return { job, changed: false, wasQueued: false };

  const wasQueued = job.status === 'queued';
  const now = new Date();
  try {
    const updated = await prisma.backtestJob.update({
      where: {
        id: jobId,
        mode: 'V3',
        status: job.status,
        executionAttempt: job.executionAttempt,
      },
      data: wasQueued
        ? {
            status: 'cancelled',
            stage: 'cancelled',
            progress: 100,
            cancelRequestedAt: now,
            finishedAt: now,
          }
        : { cancelRequestedAt: now },
    });
    return { job: updated, changed: true, wasQueued };
  } catch (error) {
    if (!isMissingRecordError(error)) throw error;
    const current = await prisma.backtestJob.findUnique({ where: { id: jobId } });
    if (current && persistedContractVersion(current) !== 3) {
      throw new ConflictException({
        code: 'UNSUPPORTED_CONTRACT_VERSION',
        message: '旧回测记录不支持取消',
      });
    }
    return {
      job: current,
      changed: false,
      wasQueued: false,
    };
  }
}

function isMissingRecordError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025',
  );
}
