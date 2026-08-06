import { Injectable } from '@nestjs/common';
import { automationJobSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { isTradingDay } from './workflows.service.js';

const cronFieldMatches = (field: string, value: number) =>
  field.split(',').some((part) => {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step <= 0) return false;
    if (range === '*') return value % step === 0;
    if (range?.includes('-')) {
      const [startText, endText] = range.split('-');
      const start = Number(startText);
      const end = Number(endText);
      return (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        value >= start &&
        value <= end &&
        (value - start) % step === 0
      );
    }
    const start = Number(range);
    return Number.isInteger(start) && value >= start && (value - start) % step === 0;
  });

export const nextCronOccurrence = (cron: string, timezone: string, after = new Date()) => {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('cron 必须包含 5 个字段');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    minute: 'numeric',
    hour: 'numeric',
    day: 'numeric',
    month: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const candidate = new Date(after.getTime() - (after.getTime() % 60_000) + 60_000);
  for (
    let minute = 0;
    minute < 527_040;
    minute += 1, candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)
  ) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(candidate)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    if (
      cronFieldMatches(fields[0]!, Number(parts.minute)) &&
      cronFieldMatches(fields[1]!, Number(parts.hour) % 24) &&
      cronFieldMatches(fields[2]!, Number(parts.day)) &&
      cronFieldMatches(fields[3]!, Number(parts.month)) &&
      cronFieldMatches(fields[4]!, weekdayMap[parts.weekday!] ?? -1)
    )
      return new Date(candidate);
  }
  throw new Error('一年内找不到下一次执行时间');
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
  readonly type: string;
  run(signal: AbortSignal): Promise<unknown>;
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
    const marketTask = ['bars-sync', 'portfolio-snapshot', 'risk-scan', 'daily-report'].includes(
      job.type,
    );
    if (marketTask && !isTradingDay(now)) return { skipped: true, reason: '休市日跳过市场任务' };
    if (!job.enabled) return { skipped: true, reason: '任务已停用' };
    return this.execute(jobId, handler);
  }
  async execute(jobId: string, handler: AutomationHandler) {
    const job = await this.prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
    const lockKey = redisKey('lock', `automation:${jobId}`);
    const token = crypto.randomUUID();
    const locked = await this.redis.client.set(lockKey, token, 'PX', job.lockTtlMs, 'NX');
    if (!locked) return { skipped: true, reason: '任务已有实例运行' };
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
        return handler.run(AbortSignal.timeout(job.lockTtlMs));
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
      return { skipped: false, output };
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
