import { Injectable } from '@nestjs/common';
import { Cron } from 'croner';
import { cnTradingCalendar } from '@thesis-ledger/domain';
import {
  automationJobSchema,
  automationJobTypeSchema,
  isMarketAutomationJobType,
  type AutomationJobType,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService, redisKey } from '../platform/redis.service.js';

export const nextCronOccurrence = (cron: string, timezone: string, after = new Date()) => {
  const schedule = new Cron(cron, { timezone, paused: true });
  try {
    const next = schedule.nextRun(after);
    if (!next) throw new Error('找不到下一次 cron 执行时间');
    return next;
  } finally {
    schedule.stop();
  }
};

export const runWithRetry = async <T>(
  operation: (attempt: number) => Promise<T>,
  policy: { maxAttempts: number; backoffMs: number },
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return { result: await operation(attempt), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < policy.maxAttempts) await wait(policy.backoffMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
};

export interface AutomationHandler {
  readonly type: AutomationJobType;
  run(signal: AbortSignal, scheduledAt: Date): Promise<unknown>;
}

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  create(input: unknown) {
    const job = automationJobSchema.parse(input);
    return this.prisma.automationJob.create({
      data: {
        id: job.id,
        name: job.name,
        type: job.type,
        cron: job.cron,
        timezone: job.timezone,
        enabled: job.enabled,
        retryPolicy: job.retry,
        lockTtlMs: job.lockTtlMs,
        nextRunAt: nextCronOccurrence(job.cron, job.timezone),
      },
    });
  }

  list() {
    return this.prisma.automationJob.findMany({ orderBy: { name: 'asc' } });
  }

  async executeScheduled(jobId: string, handler: AutomationHandler, now = new Date()) {
    const job = await this.prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
    if (!job.enabled) return { skipped: true, reason: '任务已停用' } as const;

    const type = automationJobTypeSchema.parse(job.type);
    if (handler.type !== type) throw new Error(`Automation handler 类型不匹配: ${type}`);

    const nextRunAt = nextCronOccurrence(job.cron, job.timezone, now);
    if (isMarketAutomationJobType(type)) {
      const tradingDay = cnTradingCalendar.status(now);
      if (!tradingDay.open) {
        await this.prisma.automationJob.update({
          where: { id: jobId },
          data: { nextRunAt },
        });
        return {
          skipped: true,
          reason:
            tradingDay.reason === 'calendar-unavailable'
              ? '交易日历未覆盖，保守跳过市场任务'
              : '休市日跳过市场任务',
        } as const;
      }
    }

    try {
      const result = await this.execute(jobId, handler, now);
      if (result.skipped) return result;
      await this.prisma.automationJob.update({
        where: { id: jobId },
        data: { lastRunAt: now, nextRunAt },
      });
      return result;
    } catch (error) {
      await this.prisma.automationJob.update({
        where: { id: jobId },
        data: { lastRunAt: now, nextRunAt },
      });
      throw error;
    }
  }

  async execute(jobId: string, handler: AutomationHandler, scheduledAt = new Date()) {
    const job = await this.prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
    const type = automationJobTypeSchema.parse(job.type);
    if (handler.type !== type) throw new Error(`Automation handler 类型不匹配: ${type}`);

    const lockKey = redisKey('lock', `automation:${jobId}`);
    const token = crypto.randomUUID();
    const locked = await this.redis.client.set(lockKey, token, 'PX', job.lockTtlMs, 'NX');
    if (!locked) return { skipped: true, reason: '任务已有实例运行' } as const;

    const run = await this.prisma.automationRun.create({
      data: { jobId, status: 'running', traceId: crypto.randomUUID() },
    });
    try {
      const retry = automationJobSchema.shape.retry.parse(job.retryPolicy);
      const execution = await runWithRetry(async (attempt) => {
        if (attempt > 1)
          await this.prisma.automationRun.update({
            where: { id: run.id },
            data: { attempt },
          });
        return handler.run(AbortSignal.timeout(job.lockTtlMs), scheduledAt);
      }, retry);
      const output = execution.result;
      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'succeeded',
          attempt: execution.attempts,
          output: output as object,
          finishedAt: new Date(),
        },
      });
      return { skipped: false, output } as const;
    } catch (error) {
      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : '未知错误',
          finishedAt: new Date(),
        },
      });
      throw error;
    } finally {
      const current = await this.redis.client.get(lockKey);
      if (current === token) await this.redis.client.del(lockKey);
    }
  }

  history(jobId?: string) {
    return this.prisma.automationRun.findMany({
      ...(jobId ? { where: { jobId } } : {}),
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
  }
}
