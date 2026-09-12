import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { automationJobTypeSchema } from '@thesis-ledger/schemas';
import { loadConfig } from '../platform/config.js';
import { PrismaService } from '../platform/prisma.service.js';
import { AutomationRuntimeHandlers } from './automation-runtime.service.js';
import { AutomationService } from './automation.service.js';

const AUTOMATION_POLL_INTERVAL_MS = 30_000;

@Injectable()
export class AutomationScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly automations: AutomationService,
    private readonly handlers: AutomationRuntimeHandlers,
  ) {}

  async onModuleInit() {
    if (loadConfig().environment === 'test') return;
    await this.automations.ensureManagedValuationJobs();
    this.timer = setInterval(() => void this.runDue(), AUTOMATION_POLL_INTERVAL_MS);
    this.timer.unref?.();
    this.startupTimer = setTimeout(() => void this.runDue(), 0);
    this.startupTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }

  async runDue(now = new Date()) {
    if (this.running) return { skipped: true, reason: '调度器上一轮仍在运行', jobs: [] } as const;
    this.running = true;
    try {
      // 先接住“occurrence 已登记但进程在 claim 前崩溃”以及 lease 过期后的安全恢复。
      // claim 仍由 PostgreSQL ownerAttempt 决定，多实例同时进入这里不会产生双 owner。
      const pending = await this.automations.recoverPendingRuns(now);
      for (const run of pending) {
        const pendingJob = await this.prisma.automationJob.findUnique({ where: { id: run.jobId } });
        if (!pendingJob?.enabled) continue;
        try {
          const type = automationJobTypeSchema.parse(pendingJob.type);
          await this.automations.resumePendingRun(run, this.handlers.for(type), now);
        } catch {
          // 单个恢复任务失败不阻断本轮其他 due job；终态与失败通知由 AutomationService 负责。
        }
      }

      const jobs = await this.prisma.automationJob.findMany({
        where: { enabled: true, nextRunAt: { lte: now } },
        orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
        take: 100,
      });
      const results: Array<{
        jobId: string;
        status: 'succeeded' | 'skipped' | 'failed';
        reason?: string;
      }> = [];
      for (const job of jobs) {
        try {
          const type = automationJobTypeSchema.parse(job.type);
          const execution = await this.automations.executeScheduled(
            job.id,
            this.handlers.for(type),
            now,
          );
          results.push({
            jobId: job.id,
            status: execution.skipped ? 'skipped' : 'succeeded',
            ...(execution.skipped && 'reason' in execution ? { reason: execution.reason } : {}),
          });
        } catch (error) {
          results.push({
            jobId: job.id,
            status: 'failed',
            reason: error instanceof Error ? error.message : '自动化执行失败',
          });
        }
      }
      return { skipped: false, jobs: results } as const;
    } finally {
      this.running = false;
    }
  }
}
