import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { StructuredLogger } from '../platform/structured-logger.js';

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
  ) {}

  async ensureEnqueued(jobId: string) {
    const startedAt = Date.now();
    const job = await this.prisma.backtestJob.findUnique({ where: { id: jobId } });
    if (!job || terminalStatuses.has(job.status)) return job;
    try {
      const state = await this.queue.getState?.(jobId);
      if (state && ['completed', 'failed'].includes(state)) await this.queue.remove?.(jobId);
      await this.queue.add(jobId);
      const dispatched = await this.prisma.backtestJob.update({
        where: { id: jobId },
        data: {
          dispatchedAt: new Date(),
          errorCode: null,
          errorSummary: null,
        },
      });
      await this.events.publishJob(jobId).catch(() => undefined);
      this.logger.log({
        operation: 'backtest.queue.dispatched',
        queue: 'backtest-v1',
        jobId,
        durationMs: Date.now() - startedAt,
      });
      return dispatched;
    } catch {
      const pending = await this.prisma.backtestJob.update({
        where: { id: jobId },
        data: {
          dispatchedAt: null,
          errorCode: 'queue_temporarily_unavailable',
          errorSummary: '回测队列暂时不可用，服务恢复后将自动派发。',
        },
      });
      await this.events.publishJob(jobId).catch(() => undefined);
      this.logger.warn({
        operation: 'backtest.queue.deferred',
        queue: 'backtest-v1',
        jobId,
        errorCode: 'queue_temporarily_unavailable',
        durationMs: Date.now() - startedAt,
      });
      return pending;
    }
  }

  async cancel(jobId: string) {
    const job = await this.prisma.backtestJob.findUnique({ where: { id: jobId } });
    if (!job || terminalStatuses.has(job.status)) return job;
    const now = new Date();
    const cancelled = await this.prisma.backtestJob.update({
      where: { id: jobId },
      data:
        job.status === 'queued'
          ? {
              status: 'cancelled',
              stage: 'cancelled',
              progress: 100,
              cancelRequestedAt: now,
              finishedAt: now,
            }
          : { cancelRequestedAt: now },
    });
    if (job.status === 'queued') await this.queue.remove?.(jobId).catch(() => undefined);
    await this.events.publishJob(jobId).catch(() => undefined);
    this.logger.log({
      operation: 'backtest.queue.cancel_requested',
      queue: 'backtest-v1',
      jobId,
      status: cancelled.status,
    });
    return cancelled;
  }
}
