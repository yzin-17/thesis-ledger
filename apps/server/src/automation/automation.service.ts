import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from 'croner';
import { Prisma } from '@prisma/client';
import { cnTradingCalendar } from '@thesis-ledger/domain';
import {
  automationJobSchema,
  automationJobTypeSchema,
  automationJobUpdateSchema,
  isMarketAutomationJobType,
  type AutomationJobType,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService } from '../platform/redis.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import {
  AutomationExecutionStore,
  type AutomationRecoveryPolicy,
  type PendingAutomationExecution,
} from './automation-execution-store.js';
import {
  automationNotificationLogger,
  enqueueAutomationFailureNotification,
} from './automation-notification.js';

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
  scheduledGate?(
    scheduledAt: Date,
  ): Promise<{ allowed: true } | { allowed: false; reason: string }>;
  run(signal: AbortSignal, scheduledAt: Date, trigger?: 'manual' | 'scheduled'): Promise<unknown>;
}

export const DEFAULT_AUTOMATION_HISTORY_PAGE_SIZE = 20;
export const MAX_AUTOMATION_HISTORY_PAGE_SIZE = 100;
const LEGACY_INTRADAY_VALUATION_CRON = '* * * * 1-5';
export const INTRADAY_VALUATION_CRON = '* * * * *';

const replaySafeScheduledTypes = new Set<AutomationJobType>([
  'market-sync',
  'cash-deposit-materialization',
  'fund-investment-materialization',
]);

export const automationRecoveryPolicy = (
  type: AutomationJobType,
  trigger: 'manual' | 'scheduled',
): AutomationRecoveryPolicy =>
  trigger === 'scheduled' && replaySafeScheduledTypes.has(type) ? 'replay-safe' : 'unknown-outcome';

export const managedValuationJobs = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    systemKey: 'valuation-intraday-sample',
    name: '盘中估值采样',
    type: 'valuation-intraday-sample',
    cron: INTRADAY_VALUATION_CRON,
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    systemKey: 'snapshot-close-estimate',
    name: '盘后估值预估',
    type: 'snapshot-close-estimate',
    cron: '0 16 * * 1-5',
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    systemKey: 'snapshot-official-reconcile',
    name: '正式净值校准',
    type: 'snapshot-official-reconcile',
    cron: '30 6 * * *',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  systemKey: string;
  name: string;
  type: AutomationJobType;
  cron: string;
}>;

@Injectable()
export class AutomationService {
  private readonly executionStore: AutomationExecutionStore;

  constructor(
    private readonly prisma: PrismaService,
    redis: RedisService,
    private readonly notifications: NotificationService,
  ) {
    // Redis 仍由 AutomationModule 保持兼容注入，但不再参与执行所有权或 lease 正确性。
    void redis;
    this.executionStore = new AutomationExecutionStore(prisma);
  }

  async ensureManagedValuationJobs() {
    for (const definition of managedValuationJobs) {
      const provisioned = await this.prisma.automationJob.upsert({
        where: { systemKey: definition.systemKey },
        create: {
          ...definition,
          timezone: 'Asia/Shanghai',
          enabled: true,
          retryPolicy: { maxAttempts: 3, backoffMs: 1000 },
          lockTtlMs: 300_000,
          nextRunAt: nextCronOccurrence(definition.cron, 'Asia/Shanghai'),
          managed: true,
        },
        update: { managed: true },
      });
      if (
        definition.systemKey === 'valuation-intraday-sample' &&
        provisioned.cron === LEGACY_INTRADAY_VALUATION_CRON &&
        provisioned.timezone === 'Asia/Shanghai'
      ) {
        await this.prisma.automationJob.update({
          where: { id: provisioned.id },
          data: {
            cron: INTRADAY_VALUATION_CRON,
            nextRunAt: nextCronOccurrence(INTRADAY_VALUATION_CRON, provisioned.timezone),
          },
        });
      }
    }
  }

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

  async update(id: string, input: unknown) {
    const patch = automationJobUpdateSchema.parse(input);
    const job = await this.prisma.automationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('任务不存在');
    if (job.managed && patch.name !== undefined)
      throw new BadRequestException('系统估值任务名称和类型不可修改');

    const cronChanged = patch.cron !== undefined && patch.cron !== job.cron;
    const timezoneChanged = patch.timezone !== undefined && patch.timezone !== job.timezone;
    let nextRunAt: Date | undefined;
    if (cronChanged || timezoneChanged) {
      try {
        nextRunAt = nextCronOccurrence(patch.cron ?? job.cron, patch.timezone ?? job.timezone);
      } catch {
        throw new BadRequestException('cron 表达式无效');
      }
    }

    return this.prisma.automationJob.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.cron !== undefined ? { cron: patch.cron } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });
  }

  async delete(id: string) {
    const job = await this.prisma.automationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('任务不存在');
    if (job.managed) throw new ConflictException('系统估值任务不能删除，可改用停用');
    const history = await this.prisma.automationRun.findFirst({ where: { jobId: id } });
    if (history) throw new ConflictException('已有运行历史，请改用停用');
    try {
      return await this.prisma.automationJob.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
        throw new ConflictException('已有运行历史，请改用停用');
      throw error;
    }
  }

  async executeScheduled(jobId: string, handler: AutomationHandler, now = new Date()) {
    const job = await this.prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
    if (!job.enabled) return { skipped: true, reason: '任务已停用' } as const;

    const type = automationJobTypeSchema.parse(job.type);
    if (handler.type !== type) throw new Error(`Automation handler 类型不匹配: ${type}`);
    if (!job.nextRunAt || job.nextRunAt > now)
      return { skipped: true, reason: '尚未到调度时间' } as const;

    const scheduledAt = job.nextRunAt;
    // 不逐条补跑停机期间错过的 cron tick；catch-up 由 materializeDue 等业务 handler 自己负责。
    const nextRunAt = nextCronOccurrence(job.cron, job.timezone, now);
    const gate = await this.scheduledGate(type, handler, scheduledAt);
    if (!gate.allowed) {
      await this.executionStore.advanceSkippedOccurrence(jobId, scheduledAt, nextRunAt);
      return { skipped: true, reason: gate.reason } as const;
    }

    const reserved = await this.executionStore.reserveScheduledOccurrence({
      jobId,
      scheduledAt,
      nextRunAt,
      recoveryPolicy: automationRecoveryPolicy(type, 'scheduled'),
    });
    if (!reserved) return { skipped: true, reason: '调度计划已变化' } as const;

    try {
      const result = await this.executeReserved(
        job,
        handler,
        { runId: reserved.runId, jobId, trigger: 'scheduled', scheduledAt },
        scheduledAt,
      );
      if (!result.skipped) {
        await this.prisma.automationJob.update({
          where: { id: jobId },
          data: { lastRunAt: scheduledAt },
        });
      }
      return result;
    } catch (error) {
      await this.prisma.automationJob.update({
        where: { id: jobId },
        data: { lastRunAt: scheduledAt },
      });
      await this.notifySchedulingFailure(job, error);
      throw error;
    }
  }

  /** 仅调度路径经过本方法；手动 run-now 直调 execute，不产生失败通知。 */
  private async notifySchedulingFailure(job: { id: string; name: string }, error: unknown) {
    try {
      const run = await this.prisma.automationRun.findFirst({
        where: { jobId: job.id },
        orderBy: { startedAt: 'desc' },
      });
      await enqueueAutomationFailureNotification(this.notifications, {
        jobId: job.id,
        jobName: job.name,
        runId: run?.id ?? job.id,
        traceId: run?.traceId ?? job.id,
        error,
      });
    } catch (notificationError) {
      automationNotificationLogger.warn({
        operation: 'automation.failure_notification_failed',
        jobId: job.id,
        reason: notificationError instanceof Error ? notificationError.message : 'unknown',
      });
    }
  }

  async execute(
    jobId: string,
    handler: AutomationHandler,
    scheduledAt = new Date(),
    trigger: 'manual' | 'scheduled' = 'manual',
  ) {
    const job = await this.prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
    const type = automationJobTypeSchema.parse(job.type);
    if (handler.type !== type) throw new Error(`Automation handler 类型不匹配: ${type}`);
    if (trigger === 'scheduled') return this.executeScheduled(jobId, handler, scheduledAt);

    const run = await this.executionStore.createClaimedManualRun(jobId, job.lockTtlMs);
    return this.executeReserved(
      job,
      handler,
      { runId: run.runId, jobId, trigger: 'manual', scheduledAt: null },
      scheduledAt,
      run.ownerAttempt,
    );
  }

  recoverPendingRuns(now = new Date()) {
    return this.executionStore.recoverAndListQueued(now);
  }

  async resumePendingRun(run: PendingAutomationExecution, handler: AutomationHandler, now = new Date()) {
    const job = await this.prisma.automationJob.findUnique({ where: { id: run.jobId } });
    if (!job || !job.enabled) return { skipped: true, reason: '任务不存在或已停用' } as const;
    const type = automationJobTypeSchema.parse(job.type);
    if (handler.type !== type) throw new Error(`Automation handler 类型不匹配: ${type}`);
    const effectiveAt = run.scheduledAt ?? now;
    try {
      const result = await this.executeReserved(job, handler, run, effectiveAt);
      if (run.trigger === 'scheduled' && !result.skipped) {
        await this.prisma.automationJob.update({
          where: { id: job.id },
          data: { lastRunAt: effectiveAt },
        });
      }
      return result;
    } catch (error) {
      if (run.trigger === 'scheduled') {
        await this.prisma.automationJob.update({
          where: { id: job.id },
          data: { lastRunAt: effectiveAt },
        });
        await this.notifySchedulingFailure(job, error);
      }
      throw error;
    }
  }

  async history(jobId?: string, page?: number, pageSize?: number) {
    const requestedPage = Number.isInteger(page) && page && page > 0 ? page : 1;
    const requestedPageSize =
      Number.isInteger(pageSize) && pageSize && pageSize > 0
        ? Math.min(pageSize, MAX_AUTOMATION_HISTORY_PAGE_SIZE)
        : DEFAULT_AUTOMATION_HISTORY_PAGE_SIZE;
    const where = jobId ? { jobId } : {};
    const total = await this.prisma.automationRun.count({ where });
    const totalPages = Math.ceil(total / requestedPageSize);
    const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
    const items = await this.prisma.automationRun.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: (currentPage - 1) * requestedPageSize,
      take: requestedPageSize,
    });
    return {
      items,
      page: currentPage,
      pageSize: requestedPageSize,
      total,
      totalPages,
    };
  }

  private async scheduledGate(type: AutomationJobType, handler: AutomationHandler, scheduledAt: Date) {
    if (handler.scheduledGate) return handler.scheduledGate(scheduledAt);
    if (!isMarketAutomationJobType(type)) return { allowed: true } as const;
    const tradingDay = cnTradingCalendar.status(scheduledAt);
    if (tradingDay.open) return { allowed: true } as const;
    return {
      allowed: false,
      reason:
        tradingDay.reason === 'calendar-unavailable'
          ? '交易日历未覆盖，保守跳过市场任务'
          : '休市日跳过市场任务',
    } as const;
  }

  private async executeReserved(
    job: { id: string; type: string; retryPolicy: Prisma.JsonValue; lockTtlMs: number },
    handler: AutomationHandler,
    run: PendingAutomationExecution,
    effectiveAt: Date,
    claimedOwnerAttempt?: number,
  ) {
    const ownerAttempt =
      claimedOwnerAttempt ?? (await this.executionStore.claim(run.runId, job.lockTtlMs));
    if (ownerAttempt === null) return { skipped: true, reason: '任务已有实例运行' } as const;

    const abortController = new AbortController();
    let leaseLost = false;
    const heartbeatEveryMs = Math.max(250, Math.floor(job.lockTtlMs / 3));
    const heartbeat = setInterval(() => {
      void this.executionStore
        .renewLease(run.runId, ownerAttempt, job.lockTtlMs)
        .then((renewed) => {
          if (renewed) return;
          leaseLost = true;
          abortController.abort(new Error('Automation durable lease 已丢失'));
        })
        .catch(() => {
          leaseLost = true;
          abortController.abort(new Error('Automation durable lease 续租失败'));
        });
    }, heartbeatEveryMs);
    heartbeat.unref?.();

    try {
      const retry = automationJobSchema.shape.retry.parse(job.retryPolicy);
      const execution = await runWithRetry(async (attempt) => {
        const owned = await this.executionStore.setHandlerAttempt(run.runId, ownerAttempt, attempt);
        if (!owned || leaseLost) throw new Error('Automation 执行所有权已丢失');
        return handler.run(abortController.signal, effectiveAt, run.trigger === 'manual' ? 'manual' : 'scheduled');
      }, retry);
      if (leaseLost) throw new Error('Automation 执行所有权已丢失');
      const completed = await this.executionStore.complete(
        run.runId,
        ownerAttempt,
        execution.result,
        execution.attempts,
      );
      if (!completed) throw new Error('Automation 执行所有权已丢失，拒绝旧 owner 提交结果');
      return { skipped: false, output: execution.result } as const;
    } catch (error) {
      // leaseLost 时旧 owner 已无法证明自己仍拥有执行权；保留 running 让 reconciler
      // 按 replay-safe / unknown-outcome 处理，不能把不确定副作用错误压成普通 failed。
      if (!leaseLost)
        await this.executionStore.fail(run.runId, ownerAttempt, error).catch(() => false);
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}
