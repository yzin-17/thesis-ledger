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
          select: { id: true, status: true, executionAttempt: true, createdAt: true },
        });
        if (jobs.length === 0) break;

        for (const job of jobs) {
          let queueState: string | null | undefined;
          try {
            queueState = await this.queue.getState?.(job.id);
          } catch {
            if (job.status === 'queued') await this.queueService.ensureEnqueued(job.id);
            continue;
          }
          if (queueState && !['completed', 'failed'].includes(queueState)) continue;

          if (job.executionAttempt >= BACKTEST_MAX_ATTEMPTS) {
            const failed = await this.prisma.backtestJob.updateMany({
              where: {
                id: job.id,
                status: job.status,
                executionAttempt: job.executionAttempt,
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
            continue;
          }

          if (job.status === 'running') {
            const requeued = await this.prisma.backtestJob.updateMany({
              where: {
                id: job.id,
                status: 'running',
                executionAttempt: job.executionAttempt,
              },
              data: {
                status: 'queued',
                errorCode: 'worker_attempt_failed',
                errorSummary: '回测 Worker 中断，任务已重新排队。',
              },
            });
            if (requeued.count !== 1) continue;
          }
          await this.queueService.ensureEnqueued(job.id);
        }

        const last = jobs.at(-1);
        if (!last || jobs.length < RECONCILE_PAGE_SIZE) break;
        cursor = { createdAt: last.createdAt, id: last.id };
      }
    } finally {
      this.reconciling = false;
    }
  }
}
