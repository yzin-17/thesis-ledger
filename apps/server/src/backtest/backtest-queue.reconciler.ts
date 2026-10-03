import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import {
  BACKTEST_JOB_EVENTS,
  BACKTEST_QUEUE_TRANSPORT,
  type BacktestJobEvents,
  type BacktestQueueTransport,
  BacktestQueueService,
} from './backtest-queue.service.js';
import { BACKTEST_MAX_ATTEMPTS } from './backtest-bull-queue.js';
import { resolveBacktestRetryBudget } from './backtest-retry-budget.js';
import { persistedContractVersion } from './backtest-v3-run-lifecycle.js';
import type { BacktestJob } from '@prisma/client';

const RECONCILE_PAGE_SIZE = 100;

@Injectable()
export class BacktestQueueReconciler implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private reconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: BacktestQueueService,
    @Inject(BACKTEST_QUEUE_TRANSPORT) private readonly queue: BacktestQueueTransport,
    @Inject(BACKTEST_JOB_EVENTS) private readonly events: BacktestJobEvents,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    void this.reconcile().catch(() => undefined);
    this.timer = setInterval(() => void this.reconcile().catch(() => undefined), 15_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcile() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      let cursor: { createdAt: Date; id: string } | undefined;
      for (;;) {
        const jobs = await this.prisma.backtestJob.findMany({
          where: {
            mode: 'V3',
            status: { in: ['queued', 'running'] },
            ...(cursor
              ? {
                  OR: [
                    { createdAt: { gt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: RECONCILE_PAGE_SIZE,
          select: {
            id: true,
            mode: true,
            status: true,
            executionAttempt: true,
            input: true,
            cancelRequestedAt: true,
            createdAt: true,
          },
        });
        if (jobs.length === 0) break;

        for (const job of jobs) await this.reconcileJob(job);

        const last = jobs.at(-1);
        if (!last || jobs.length < RECONCILE_PAGE_SIZE) break;
        cursor = { createdAt: last.createdAt, id: last.id };
      }
    } finally {
      this.reconciling = false;
    }
  }

  private async reconcileJob(
    job: Pick<
      BacktestJob,
      'id' | 'mode' | 'status' | 'executionAttempt' | 'input' | 'cancelRequestedAt'
    >,
  ) {
    if (persistedContractVersion(job) !== 3) return;
    if (!this.queue.getState) return;

    let queueState: string | null;
    try {
      queueState = await this.queue.getState(job.id);
    } catch {
      if (job.status === 'queued' && !job.cancelRequestedAt) {
        await this.queueService.ensureEnqueued(job.id);
      }
      return;
    }
    if (queueState !== null && !['completed', 'failed'].includes(queueState)) return;

    if (job.status === 'running' && job.cancelRequestedAt) {
      const cancelled = await this.prisma.backtestJob.updateMany({
        where: {
          id: job.id,
          mode: 'V3',
          status: 'running',
          executionAttempt: job.executionAttempt,
          cancelRequestedAt: { not: null },
        },
        data: {
          status: 'cancelled',
          stage: 'cancelled',
          progress: 100,
          finishedAt: new Date(),
          errorCode: null,
          errorSummary: null,
        },
      });
      if (cancelled.count === 1) await this.events.publishJob(job.id).catch(() => undefined);
      return;
    }

    let maxAttempts: number;
    try {
      maxAttempts = resolveBacktestRetryBudget(
        job.input,
        job.executionAttempt,
        BACKTEST_MAX_ATTEMPTS,
      ).maxAttempts;
    } catch {
      const failed = await this.prisma.backtestJob.updateMany({
        where: {
          id: job.id,
          mode: 'V3',
          status: job.status,
          executionAttempt: job.executionAttempt,
          cancelRequestedAt: null,
        },
        data: {
          status: 'failed',
          stage: 'failed',
          progress: 100,
          finishedAt: new Date(),
          errorCode: 'invalid_retry_budget',
          errorSummary: '回测重试预算无效，已停止自动重试。',
        },
      });
      if (failed.count === 1) await this.events.publishJob(job.id).catch(() => undefined);
      return;
    }

    if (job.executionAttempt >= maxAttempts) {
      const failed = await this.prisma.backtestJob.updateMany({
        where: {
          id: job.id,
          mode: 'V3',
          status: job.status,
          executionAttempt: job.executionAttempt,
          cancelRequestedAt: null,
        },
        data: {
          status: 'failed',
          progress: 100,
          finishedAt: new Date(),
          errorCode: 'worker_attempts_exhausted',
          errorSummary: '回测 Worker 多次中断，已停止自动重试。',
        },
      });
      if (failed.count === 1) await this.events.publishJob(job.id).catch(() => undefined);
      return;
    }

    if (job.status === 'running') {
      const requeued = await this.prisma.backtestJob.updateMany({
        where: {
          id: job.id,
          mode: 'V3',
          status: 'running',
          executionAttempt: job.executionAttempt,
          cancelRequestedAt: null,
        },
        data: {
          status: 'queued',
          errorCode: 'worker_attempt_failed',
          errorSummary: '回测 Worker 中断，任务已重新排队。',
        },
      });
      if (requeued.count !== 1) return;
    }
    await this.queueService.ensureEnqueued(job.id);
  }
}
