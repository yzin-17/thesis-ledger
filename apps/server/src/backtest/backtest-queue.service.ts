import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { StructuredLogger } from '../platform/structured-logger.js';
import { requestBacktestCancellation } from './backtest-run-cancellation.js';
import { persistedContractVersion } from './backtest-v3-run-lifecycle.js';
import { BACKTEST_QUEUE_NAME } from './backtest-bull-queue.js';
import { isNavBacktestInput } from './backtest-nav-run-read.js';
import { BacktestNavRunExecution } from './backtest-nav-run-execution.js';

export const BACKTEST_QUEUE_TRANSPORT = Symbol('BACKTEST_QUEUE_TRANSPORT');
export const BACKTEST_JOB_EVENTS = Symbol('BACKTEST_JOB_EVENTS');

export interface BacktestQueueTransport {
  add(jobId: string): Promise<unknown>;
  getState?(jobId: string): Promise<string | null>;
  remove?(jobId: string): Promise<void>;
}

export interface BacktestJobEvents {
  publishJob(jobId: string): Promise<void>;
}

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled']);

@Injectable()
export class BacktestQueueService {
  private readonly logger = new StructuredLogger('thesis-ledger.backtest-queue');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BACKTEST_QUEUE_TRANSPORT) private readonly queue: BacktestQueueTransport,
    @Inject(BACKTEST_JOB_EVENTS) private readonly events: BacktestJobEvents,
    @Optional() @Inject(BacktestNavRunExecution)
    private readonly navExecution?: BacktestNavRunExecution,
  ) {}

  supportsNavExecution(): boolean {
    return this.navExecution !== undefined;
  }

  async ensureEnqueued(jobId: string) {
    const startedAt = Date.now();
    const job = await this.prisma.backtestJob.findUnique({ where: { id: jobId } });
    if (!job || terminalStatuses.has(job.status)) return job;
    if (isNavBacktestInput(job.input) && !this.navExecution) {
      throw new ConflictException({
        code: 'NAV_V3_EXECUTION_UNAVAILABLE',
        message: 'NAV Runner 未配置，Run 未进入执行队列',
      });
    }
    if (persistedContractVersion(job) !== 3) return job;

    const persistDispatch = async (data: {
      dispatchedAt: Date | null;
      errorCode: string | null;
      errorSummary: string | null;
    }) => {
      try {
        const updated = await this.prisma.backtestJob.update({
          where: {
            id: job.id,
            mode: 'V3',
            status: job.status,
            executionAttempt: job.executionAttempt,
          },
          data,
        });
        return { job: updated, changed: true };
      } catch (error) {
        if (!isMissingRecordError(error)) throw error;
        return {
          job: await this.prisma.backtestJob.findUnique({ where: { id: jobId } }),
          changed: false,
        };
      }
    };

    try {
      const state = await this.queue.getState?.(jobId);
      if (state && ['completed', 'failed'].includes(state)) await this.queue.remove?.(jobId);
      await this.queue.add(jobId);
    } catch {
      const pending = await persistDispatch({
        dispatchedAt: null,
        errorCode: 'queue_temporarily_unavailable',
        errorSummary: '回测队列暂时不可用，服务恢复后将自动派发。',
      });
      if (pending.changed) await this.events.publishJob(jobId).catch(() => undefined);
      this.logger.warn({
        operation: 'backtest.queue.deferred',
        queue: BACKTEST_QUEUE_NAME,
        jobId,
        errorCode: 'queue_temporarily_unavailable',
        durationMs: Date.now() - startedAt,
      });
      return pending.job;
    }

    const dispatched = await persistDispatch({
      dispatchedAt: new Date(),
      errorCode: null,
      errorSummary: null,
    });
    if (dispatched.changed) {
      await this.events.publishJob(jobId).catch(() => undefined);
      this.logger.log({
        operation: 'backtest.queue.dispatched',
        queue: BACKTEST_QUEUE_NAME,
        jobId,
        durationMs: Date.now() - startedAt,
      });
    }
    return dispatched.job;
  }

  async cancel(jobId: string) {
    const result = await requestBacktestCancellation(this.prisma, jobId);
    if (!result.job || !result.changed) return result.job;
    if (result.wasQueued) await this.queue.remove?.(jobId).catch(() => undefined);
    await this.events.publishJob(jobId).catch(() => undefined);
    this.logger.log({
      operation: 'backtest.queue.cancel_requested',
      queue: BACKTEST_QUEUE_NAME,
      jobId,
      status: result.job.status,
    });
    return result.job;
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
