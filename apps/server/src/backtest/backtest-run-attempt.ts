import { Prisma, type BacktestJob } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import { prepareBacktestAttempt } from './backtest-run-attempt-preflight.js';

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
  runnerId: string | undefined;
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
  const eligibility = await prepareBacktestAttempt(
    prisma,
    job,
    input.runnerId,
    execution !== undefined,
  );
  if (!eligibility.allowed) return eligibility.job;

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
          mode: 'frozen',
          status: { in: ['queued', 'running'] },
          executionAttempt: { lt: attempt },
          cancelRequestedAt: null,
        }
      : {
          id: runId,
          mode: 'frozen',
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
      engineVersion: eligibility.runnerId,
      errorCode: null,
      errorSummary: null,
      diagnostics: Prisma.JsonNull,
    },
  });
  if (claimed.count !== 1) return findCurrent();

  const controller = new AbortController();
  activeControllers.set(runId, controller);
  let polling = false;
  const checkPersistentCancellation = async () => {
    if (polling || activeControllers.get(runId) !== controller) return;
    polling = true;
    try {
      const current = await prisma.backtestJob.findUnique({ where: { id: runId },
        select: { status: true, executionAttempt: true, cancelRequestedAt: true } });
      if (activeControllers.get(runId) !== controller) return;
      if (!current || current.cancelRequestedAt || current.status !== 'running' || current.executionAttempt !== attempt)
        controller.abort(new Error(current?.cancelRequestedAt ? '回测已取消' : '回测执行归属已变化'));
    } catch {
      // 本次读取未知不推断任务消失；下一周期只重试读取，不重复计算。
    } finally { polling = false; }
  };
  const cancellationPoll = setInterval(() => { void checkPersistentCancellation(); }, 1_000);
  cancellationPoll.unref();
  try {
    await checkPersistentCancellation();
    controller.signal.throwIfAborted();
    const ownedJob = await findCurrent();
    if (!ownedJob || ownedJob.status !== 'running' || ownedJob.executionAttempt !== attempt || ownedJob.cancelRequestedAt)
      throw new Error('回测执行归属已变化');
    const parsed = await input.execute(ownedJob, controller.signal);
    if (controller.signal.aborted) throw new Error('回测已取消');

    const committed = await prisma.backtestJob.updateMany({
      where: {
        id: runId,
        mode: 'frozen',
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
    return await handleFailure(error, attempt);
  } finally {
    clearInterval(cancellationPoll);
    if (activeControllers.get(runId) === controller) activeControllers.delete(runId);
  }

  async function handleFailure(error: unknown, attempt: number): Promise<TJob | null> {
    const current = await findCurrent();
    if (!current || finishedStatuses.has(current.status)) return current;
    if (current.status !== 'running' || current.executionAttempt !== attempt) return current;
    if (current.cancelRequestedAt) return acknowledgeCancellation(attempt);

    const failure = input.classifyFailure(error);
    if (execution && failure.retryable) {
      const requeued = await prisma.backtestJob.updateMany({
        where: {
          id: runId,
          mode: 'frozen',
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
        mode: 'frozen',
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
    if (execution) throw Object.assign(error instanceof Error ? error : new Error(failure.summary), { unrecoverable: true });
    return findCurrent();
  }

  async function acknowledgeCancellation(currentAttempt: number): Promise<TJob | null> {
    await prisma.backtestJob.updateMany({
      where: {
        id: runId,
        mode: 'frozen',
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
