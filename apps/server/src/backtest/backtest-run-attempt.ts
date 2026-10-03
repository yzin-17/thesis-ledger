import { Prisma, type BacktestJob } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import { persistedContractVersion } from './backtest-v3-run-lifecycle.js';

export interface BacktestRunAttemptExecution {
  attempt: number;
  maxAttempts: number;
}

export interface BacktestRunAttemptFailure {
  code: string;
  summary: string;
  retryable: boolean;
}

interface BacktestRunAttemptResult {
  result: unknown;
  resultChecksum: string;
}

interface BacktestRunAttemptInput<TJob extends BacktestJob> {
  prisma: PrismaService;
  job: TJob;
  execution?: BacktestRunAttemptExecution;
  runnerId: string;
  activeControllers: Map<string, AbortController>;
  execute: (job: TJob, signal: AbortSignal) => Promise<BacktestRunAttemptResult>;
  classifyFailure: (error: unknown) => BacktestRunAttemptFailure;
}

const finishedStatuses = new Set(['succeeded', 'failed', 'cancelled']);

export async function runBacktestAttempt<TJob extends BacktestJob>(
  input: BacktestRunAttemptInput<TJob>,
): Promise<TJob | null> {
  const { job, execution, prisma, activeControllers } = input;
  const runId = job.id;
  if (persistedContractVersion(job) !== 3) throw new Error('旧 Run 持久化合同拒绝执行');
  if (finishedStatuses.has(job.status)) return job;
  if (!execution && job.status !== 'queued') return job;

  const attempt = execution?.attempt ?? job.executionAttempt + 1;
  if (job.cancelRequestedAt) {
    if (execution && job.status === 'running' && job.executionAttempt === attempt) {
      return acknowledgeCancellation(attempt);
    }
    return job;
  }

  const claimed = await prisma.backtestJob.updateMany({
    where: execution
      ? {
          id: runId,
          mode: 'V3',
          status: { in: ['queued', 'running'] },
          executionAttempt: { lt: attempt },
          cancelRequestedAt: null,
        }
      : {
          id: runId,
          mode: 'V3',
          status: 'queued',
          executionAttempt: job.executionAttempt,
          cancelRequestedAt: null,
        },
    data: {
      status: 'running',
      stage: 'running',
      progress: 5,
      executionAttempt: attempt,
      startedAt: job.startedAt ?? new Date(),
      engineVersion: input.runnerId,
      errorCode: null,
      errorSummary: null,
      diagnostics: Prisma.JsonNull,
    },
  });
  if (claimed.count !== 1) return findCurrent();

  const controller = new AbortController();
  activeControllers.set(runId, controller);
  try {
    const parsed = await input.execute(job, controller.signal);
    if (controller.signal.aborted) throw new Error('回测已取消');

    const committed = await prisma.backtestJob.updateMany({
      where: {
        id: runId,
        mode: 'V3',
        status: 'running',
        executionAttempt: attempt,
        cancelRequestedAt: null,
      },
      data: {
        status: 'succeeded',
        stage: 'succeeded',
        progress: 100,
        finishedAt: new Date(),
        result: parsed.result as Prisma.InputJsonValue,
        resultChecksum: parsed.resultChecksum,
      },
    });
    if (committed.count === 1) return findCurrent();
    return latestOrAcknowledgeCancellation(attempt);
  } catch (error) {
    const current = await findCurrent();
    if (!current || finishedStatuses.has(current.status)) return current;
    if (current.status !== 'running' || current.executionAttempt !== attempt) return current;
    if (current.cancelRequestedAt) return acknowledgeCancellation(attempt);

    const failure = input.classifyFailure(error);
    if (execution && failure.retryable) {
      const requeued = await prisma.backtestJob.updateMany({
        where: {
          id: runId,
          mode: 'V3',
          status: 'running',
          executionAttempt: attempt,
          cancelRequestedAt: null,
        },
        data: {
          status: 'queued',
          stage: 'queued',
          progress: 0,
          errorCode: failure.code,
          errorSummary: failure.summary,
          diagnostics: { code: failure.code, message: failure.summary, path: ['run'] },
        },
      });
      if (requeued.count === 0) {
        const latest = await latestOrAcknowledgeCancellation(attempt);
        if (latest?.status !== 'running' || latest.executionAttempt !== attempt) return latest;
        if (latest.cancelRequestedAt) return latest;
      }
      throw error;
    }

    const failed = await prisma.backtestJob.updateMany({
      where: {
        id: runId,
        mode: 'V3',
        status: 'running',
        executionAttempt: attempt,
        cancelRequestedAt: null,
      },
      data: {
        status: 'failed',
        stage: 'failed',
        progress: 100,
        finishedAt: new Date(),
        errorCode: failure.code,
        errorSummary: failure.summary,
        diagnostics: { code: failure.code, message: failure.summary, path: ['run'] },
      },
    });
    if (failed.count === 0) return latestOrAcknowledgeCancellation(attempt);
    if (execution) throw error;
    return findCurrent();
  } finally {
    if (activeControllers.get(runId) === controller) activeControllers.delete(runId);
  }

  async function acknowledgeCancellation(currentAttempt: number): Promise<TJob | null> {
    await prisma.backtestJob.updateMany({
      where: {
        id: runId,
        mode: 'V3',
        status: 'running',
        executionAttempt: currentAttempt,
        cancelRequestedAt: { not: null },
      },
      data: {
        status: 'cancelled',
        stage: 'cancelled',
        progress: 100,
        finishedAt: new Date(),
      },
    });
    return findCurrent();
  }

  async function latestOrAcknowledgeCancellation(currentAttempt: number): Promise<TJob | null> {
    const current = await findCurrent();
    if (
      current?.status === 'running' &&
      current.executionAttempt === currentAttempt &&
      current.cancelRequestedAt
    ) {
      return acknowledgeCancellation(currentAttempt);
    }
    return current;
  }

  async function findCurrent(): Promise<TJob | null> {
    return (await prisma.backtestJob.findUnique({ where: { id: runId } })) as TJob | null;
  }
}
