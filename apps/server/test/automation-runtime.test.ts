import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cnTradingCalendar } from '@thesis-ledger/domain';
import {
  automationJobTypes,
  automationJobTypeSchema,
  isMarketAutomationJobType,
  type AutomationJobType,
} from '@thesis-ledger/schemas';
import { AutomationScheduler } from '../src/automation/automation.scheduler.js';
import { AutomationRuntimeHandlers } from '../src/automation/automation-runtime.service.js';
import { AutomationController } from '../src/automation/automation.controller.js';
import { AutomationWorkflowRunner } from '../src/automation/workflow-runner.service.js';
import {
  AutomationService,
  nextCronOccurrence,
  type AutomationHandler,
} from '../src/automation/automation.service.js';

describe('Automation cron', () => {
  it('单值小时只匹配指定小时', () => {
    expect(
      nextCronOccurrence('0 9 * * *', 'Asia/Shanghai', new Date('2026-08-20T00:00:00Z')),
    ).toEqual(new Date('2026-08-20T01:00:00Z'));
    expect(
      nextCronOccurrence('0 9 * * *', 'Asia/Shanghai', new Date('2026-08-20T01:00:30Z')),
    ).toEqual(new Date('2026-08-21T01:00:00Z'));
  });

  it('支持 step、range 和 list', () => {
    expect(
      nextCronOccurrence('*/5 * * * *', 'Asia/Shanghai', new Date('2026-08-20T01:01:00Z')),
    ).toEqual(new Date('2026-08-20T01:05:00Z'));
    expect(
      nextCronOccurrence('0,30 9-10 * * *', 'Asia/Shanghai', new Date('2026-08-20T01:00:00Z')),
    ).toEqual(new Date('2026-08-20T01:30:00Z'));
  });

  it('timezone 会随 DST 改变 UTC 执行时刻', () => {
    expect(
      nextCronOccurrence('0 9 * * *', 'America/New_York', new Date('2026-01-15T00:00:00Z')),
    ).toEqual(new Date('2026-01-15T14:00:00Z'));
    expect(
      nextCronOccurrence('0 9 * * *', 'America/New_York', new Date('2026-07-15T00:00:00Z')),
    ).toEqual(new Date('2026-07-15T13:00:00Z'));
  });
});

describe('Automation job types', () => {
  it('所有 job type 都由 schemas 单一来源约束', () => {
    expect(automationJobTypes.map((type) => automationJobTypeSchema.parse(type))).toEqual([
      'market-sync',
      'risk-evaluation',
      'daily-digest',
      'snapshot',
      'backup',
      'provider-health',
      'cash-deposit-materialization',
    ]);
    expect(isMarketAutomationJobType('market-sync')).toBe(true);
    expect(isMarketAutomationJobType('risk-evaluation')).toBe(true);
    expect(isMarketAutomationJobType('daily-digest')).toBe(true);
    expect(isMarketAutomationJobType('snapshot')).toBe(true);
    expect(isMarketAutomationJobType('backup')).toBe(false);
    expect(isMarketAutomationJobType('provider-health')).toBe(false);
    expect(isMarketAutomationJobType('cash-deposit-materialization')).toBe(false);
  });
});

describe('Automation runtime handlers', () => {
  it('定期现金入账 handler 使用调度时刻补齐到期实例', async () => {
    const materializeDue = vi.fn(async () => ({ planCount: 1, results: [] }));
    const handlers = new AutomationRuntimeHandlers(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { materializeDue } as never,
    );
    const scheduledAt = new Date('2026-08-31T01:00:00.000Z');

    await expect(
      handlers.for('cash-deposit-materialization').run(new AbortController().signal, scheduledAt),
    ).resolves.toEqual({ planCount: 1, results: [] });
    expect(materializeDue).toHaveBeenCalledWith(scheduledAt);
  });
});

describe('A 股 TradingCalendar', () => {
  it('春节、国庆休市，普通工作日开市', () => {
    expect(cnTradingCalendar.status('2026-02-20T12:00:00+08:00')).toMatchObject({
      open: false,
      reason: 'exchange-holiday',
    });
    expect(cnTradingCalendar.status('2026-10-05T12:00:00+08:00')).toMatchObject({
      open: false,
      reason: 'exchange-holiday',
    });
    expect(cnTradingCalendar.status('2026-08-20T12:00:00+08:00')).toMatchObject({
      open: true,
      reason: 'open',
    });
  });

  it('未覆盖年份保守跳过而不是猜测开市', () => {
    expect(cnTradingCalendar.status('2027-03-01T12:00:00+08:00')).toMatchObject({
      open: false,
      reason: 'calendar-unavailable',
    });
  });
});

const job = (type: AutomationJobType = 'provider-health') => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'test',
  type,
  cron: '0 * * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  retryPolicy: { maxAttempts: 1, backoffMs: 1 },
  lockTtlMs: 5_000,
  lastRunAt: null,
  nextRunAt: new Date('2026-08-20T12:00:00Z'),
});

const notificationsFixture = () => ({ enqueue: vi.fn(async () => []) });

const redisFixture = () => {
  let token: string | null = null;
  return {
    client: {
      set: vi.fn(async (_key: string, nextToken: string) => {
        if (token !== null) return null;
        token = nextToken;
        return 'OK';
      }),
      get: vi.fn(async () => token),
      del: vi.fn(async () => {
        token = null;
        return 1;
      }),
    },
  };
};

describe('AutomationService scheduled execution', () => {
  it('Redis claim 保证现金补期 job 并发只执行一次并维护运行时间', async () => {
    const stored = job('cash-deposit-materialization');
    const prisma = {
      automationJob: {
        findUniqueOrThrow: vi.fn(async () => stored),
        update: vi.fn(async ({ data }: { data: object }) => ({ ...stored, ...data })),
      },
      automationRun: {
        create: vi.fn(async () => ({ id: 'run-1' })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
    };
    const redis = redisFixture();
    let release: ((value: unknown) => void) | undefined;
    const handler: AutomationHandler = {
      type: 'cash-deposit-materialization',
      run: vi.fn(
        async () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    };
    const service = new AutomationService(prisma as never, redis as never, notificationsFixture() as never);
    const now = new Date('2026-08-20T12:05:00Z');

    const first = service.executeScheduled(stored.id, handler, now);
    await vi.waitFor(() => expect(handler.run).toHaveBeenCalledOnce());
    await expect(service.executeScheduled(stored.id, handler, now)).resolves.toMatchObject({
      skipped: true,
      reason: '任务已有实例运行',
    });
    release?.({ ok: true });
    await expect(first).resolves.toMatchObject({ skipped: false });

    expect(handler.run).toHaveBeenCalledOnce();
    expect(prisma.automationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stored.id },
        data: expect.objectContaining({ lastRunAt: now, nextRunAt: expect.any(Date) }),
      }),
    );
  });

  it('A 股休市日不执行 market handler 但推进 nextRunAt', async () => {
    const stored = { ...job('market-sync'), cron: '0 9 * * *' };
    const prisma = {
      automationJob: {
        findUniqueOrThrow: vi.fn(async () => stored),
        update: vi.fn(async ({ data }: { data: object }) => ({ ...stored, ...data })),
      },
    };
    const handler: AutomationHandler = { type: 'market-sync', run: vi.fn() };
    const service = new AutomationService(prisma as never, redisFixture() as never, notificationsFixture() as never);
    const now = new Date('2026-02-20T01:00:00Z');

    await expect(service.executeScheduled(stored.id, handler, now)).resolves.toMatchObject({
      skipped: true,
      reason: '休市日跳过市场任务',
    });
    expect(handler.run).not.toHaveBeenCalled();
    expect(prisma.automationJob.update).toHaveBeenCalledWith({
      where: { id: stored.id },
      data: { nextRunAt: new Date('2026-02-21T01:00:00Z') },
    });
  });
});

describe('AutomationService update and delete', () => {
  const serviceFor = (prisma: object) =>
    new AutomationService(prisma as never, redisFixture() as never, notificationsFixture() as never);

  it('update 仅传 cron 时按新 cron 重算 nextRunAt', async () => {
    const stored = job();
    const prisma = {
      automationJob: {
        findUnique: vi.fn(async () => stored),
        update: vi.fn(async ({ data }: { data: object }) => ({ ...stored, ...data })),
      },
    };
    const service = serviceFor(prisma);

    await expect(service.update(stored.id, { cron: '0 9 * * 1-5' })).resolves.toMatchObject({
      cron: '0 9 * * 1-5',
    });
    expect(prisma.automationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stored.id },
        data: expect.objectContaining({ cron: '0 9 * * 1-5', nextRunAt: expect.any(Date) }),
      }),
    );
  });

  it('update 提供未变化的 cron 时不触碰 nextRunAt', async () => {
    const stored = job();
    const prisma = {
      automationJob: {
        findUnique: vi.fn(async () => stored),
        update: vi.fn(async ({ data }: { data: object }) => ({ ...stored, ...data })),
      },
    };
    const service = serviceFor(prisma);

    await expect(
      service.update(stored.id, { cron: stored.cron, name: '改名' }),
    ).resolves.toMatchObject({ name: '改名' });
    expect(prisma.automationJob.update).toHaveBeenCalledWith({
      where: { id: stored.id },
      data: { name: '改名', cron: stored.cron },
    });
  });

  it('非法 cron 返回 400 而不落库', async () => {
    const stored = job();
    const prisma = {
      automationJob: {
        findUnique: vi.fn(async () => stored),
        update: vi.fn(),
      },
    };
    const service = serviceFor(prisma);

    await expect(service.update(stored.id, { cron: 'not a cron' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.automationJob.update).not.toHaveBeenCalled();
  });

  it('update/delete 对未知任务返回 404', async () => {
    const prisma = {
      automationJob: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(),
        delete: vi.fn(),
      },
      automationRun: { findFirst: vi.fn() },
    };
    const service = serviceFor(prisma);

    await expect(service.update('missing', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.automationJob.update).not.toHaveBeenCalled();
    expect(prisma.automationJob.delete).not.toHaveBeenCalled();
  });

  it('delete 有运行历史的任务返回 409 且不删除', async () => {
    const stored = job();
    const prisma = {
      automationJob: {
        findUnique: vi.fn(async () => stored),
        delete: vi.fn(),
      },
      automationRun: { findFirst: vi.fn(async () => ({ id: 'run-1', jobId: stored.id })) },
    };
    const service = serviceFor(prisma);

    await expect(service.delete(stored.id)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.automationJob.delete).not.toHaveBeenCalled();
  });

  it('delete 无运行历史的任务物理删除', async () => {
    const stored = job();
    const prisma = {
      automationJob: {
        findUnique: vi.fn(async () => stored),
        delete: vi.fn(async () => stored),
      },
      automationRun: { findFirst: vi.fn(async () => null) },
    };
    const service = serviceFor(prisma);

    await expect(service.delete(stored.id)).resolves.toBe(stored);
    expect(prisma.automationJob.delete).toHaveBeenCalledWith({ where: { id: stored.id } });
  });

  it('delete 在先查后删窗口内遇到外键冲突同样返回 409', async () => {
    const stored = job();
    const prisma = {
      automationJob: {
        findUnique: vi.fn(async () => stored),
        delete: vi.fn(() => {
          throw new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
            code: 'P2003',
            clientVersion: 'test',
          });
        }),
      },
      automationRun: { findFirst: vi.fn(async () => null) },
    };
    const service = serviceFor(prisma);

    await expect(service.delete(stored.id)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AutomationService manual execution (run-now)', () => {
  const runPrisma = (stored: object) => ({
    automationJob: { findUniqueOrThrow: vi.fn(async () => stored) },
    automationRun: {
      create: vi.fn(async () => ({ id: 'run-1' })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => ({
        id: where.id,
        ...data,
      })),
    },
  });

  it('停用任务可手动执行并写入成功的运行记录', async () => {
    const stored = { ...job(), enabled: false };
    const prisma = runPrisma(stored);
    const handler: AutomationHandler = {
      type: 'provider-health',
      run: vi.fn(async () => ({ ok: true })),
    };
    const service = new AutomationService(prisma as never, redisFixture() as never, notificationsFixture() as never);

    await expect(service.execute(stored.id, handler)).resolves.toMatchObject({
      skipped: false,
      output: { ok: true },
    });
    expect(handler.run).toHaveBeenCalledOnce();
    expect(prisma.automationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    );
  });

  it('手动执行不受交易日检查限制', async () => {
    const stored = job('snapshot');
    const prisma = runPrisma(stored);
    const handler: AutomationHandler = { type: 'snapshot', run: vi.fn(async () => ({ ok: true })) };
    const service = new AutomationService(prisma as never, redisFixture() as never, notificationsFixture() as never);

    // 2026-02-20 为春节休市日
    await expect(
      service.execute(stored.id, handler, new Date('2026-02-20T01:00:00Z')),
    ).resolves.toMatchObject({ skipped: false });
    expect(handler.run).toHaveBeenCalledOnce();
  });

  it('调度路径仍跳过停用任务', async () => {
    const stored = { ...job(), enabled: false };
    const prisma = { automationJob: { findUniqueOrThrow: vi.fn(async () => stored) } };
    const handler: AutomationHandler = { type: 'provider-health', run: vi.fn() };
    const service = new AutomationService(prisma as never, redisFixture() as never, notificationsFixture() as never);

    await expect(service.executeScheduled(stored.id, handler)).resolves.toMatchObject({
      skipped: true,
      reason: '任务已停用',
    });
    expect(handler.run).not.toHaveBeenCalled();
  });
});

describe('AutomationController run-now', () => {
  it('未知任务返回 404', async () => {
    const prisma = { automationJob: { findUnique: vi.fn(async () => null) } };
    const controller = new AutomationController(
      {} as never,
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(controller.run('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('执行失败时响应携带原始错误 message', async () => {
    const stored = job();
    const prisma = { automationJob: { findUnique: vi.fn(async () => stored) } };
    const handler: AutomationHandler = { type: 'provider-health', run: vi.fn() };
    const automations = {
      execute: vi.fn(async () => {
        throw new Error('行情接口超时');
      }),
    };
    const handlers = { for: vi.fn(() => handler) };
    const controller = new AutomationController(
      automations as never,
      prisma as never,
      {} as never,
      handlers as never,
    );

    const error = await controller.run(stored.id).catch((caught) => caught);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as InternalServerErrorException).getResponse()).toMatchObject({
      message: '行情接口超时',
    });
  });
});

describe('AutomationService failure notification', () => {
  const failingHandler = (): AutomationHandler => ({
    type: 'provider-health',
    run: vi.fn(async () => {
      throw new Error('行情接口超时');
    }),
  });

  const prismaFor = (stored: object, run: object | null) => ({
    automationJob: {
      findUniqueOrThrow: vi.fn(async () => stored),
      update: vi.fn(async ({ data }: { data: object }) => data),
    },
    automationRun: {
      findFirst: vi.fn(async () => run),
      create: vi.fn(async () => ({ id: 'run-9', traceId: 'trace-9' })),
      update: vi.fn(async () => ({})),
    },
  });

  it('调度执行失败按任务粒度入队失败通知，原始错误照常抛出', async () => {
    const stored = job();
    const prisma = prismaFor(stored, { id: 'run-9', traceId: 'trace-9' });
    const notifications = notificationsFixture();
    const service = new AutomationService(
      prisma as never,
      redisFixture() as never,
      notifications as never,
    );

    await expect(service.executeScheduled(stored.id, failingHandler())).rejects.toThrow(
      '行情接口超时',
    );
    expect(notifications.enqueue).toHaveBeenCalledTimes(1);
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'automation-run',
        id: 'run-9',
        dedupKey: `automation-failure:${stored.id}`,
      }),
      expect.objectContaining({
        severity: 'error',
        body: expect.stringContaining(stored.name),
      }),
      expect.objectContaining({ cooldownMinutes: 30, maxAttempts: 3 }),
    );
  });

  it('手动执行失败不产生失败通知', async () => {
    const stored = job();
    const prisma = prismaFor(stored, { id: 'run-9', traceId: 'trace-9' });
    const notifications = notificationsFixture();
    const service = new AutomationService(
      prisma as never,
      redisFixture() as never,
      notifications as never,
    );

    await expect(service.execute(stored.id, failingHandler())).rejects.toThrow('行情接口超时');
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('失败通知入队异常不影响原始错误抛出', async () => {
    const stored = job();
    const prisma = prismaFor(stored, { id: 'run-9', traceId: 'trace-9' });
    const notifications = {
      enqueue: vi.fn(async () => {
        throw new Error('通知服务不可用');
      }),
    };
    const service = new AutomationService(
      prisma as never,
      redisFixture() as never,
      notifications as never,
    );

    await expect(service.executeScheduled(stored.id, failingHandler())).rejects.toThrow(
      '行情接口超时',
    );
  });

  it('任务无运行记录时失败通知回退以任务为主语', async () => {
    const stored = job();
    const prisma = prismaFor(stored, null);
    const notifications = notificationsFixture();
    const service = new AutomationService(
      prisma as never,
      redisFixture() as never,
      notifications as never,
    );

    await expect(service.executeScheduled(stored.id, failingHandler())).rejects.toThrow(
      '行情接口超时',
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ id: stored.id, dedupKey: `automation-failure:${stored.id}` }),
      expect.objectContaining({ traceId: stored.id }),
      expect.anything(),
    );
  });
});

describe('AutomationWorkflowRunner closeSnapshots', () => {
  it('估值快照按账户自身的数据模式拍摄，未知账户跳过', async () => {
    const capturedAt = '2026-09-06T08:00:00.000Z';
    const prisma = {
      account: {
        findMany: vi.fn(async () => [
          { id: 'acc-actual', mode: 'actual' },
          { id: 'acc-shadow', mode: 'shadow' },
        ]),
      },
    };
    const performance = { capture: vi.fn(async (id: string) => ({ accountId: id })) };
    const runner = new AutomationWorkflowRunner(
      {} as never,
      performance as never,
      {} as never,
      prisma as never,
    );

    const result = await runner.closeSnapshots({
      accountIds: ['acc-actual', 'acc-shadow', 'acc-missing'],
      capturedAt,
    });

    expect(performance.capture).toHaveBeenCalledTimes(2);
    expect(performance.capture).toHaveBeenCalledWith(
      'acc-actual',
      new Date(capturedAt),
      'actual',
    );
    expect(performance.capture).toHaveBeenCalledWith(
      'acc-shadow',
      new Date(capturedAt),
      'shadow',
    );
    expect(result.snapshots).toHaveLength(2);
    expect(result.capturedAt).toBe(capturedAt);
  });
});

describe('AutomationScheduler', () => {
  it('启动/轮询会认领 enabled 且已到期的 missed schedule', async () => {
    const stored = job();
    const prisma = {
      automationJob: {
        findMany: vi.fn(async () => [stored]),
      },
    };
    const automations = {
      executeScheduled: vi.fn(async () => ({ skipped: false, output: { ok: true } })),
    };
    const handler: AutomationHandler = {
      type: 'provider-health',
      run: vi.fn(async () => ({ ok: true })),
    };
    const handlers = { for: vi.fn(() => handler) };
    const scheduler = new AutomationScheduler(
      prisma as never,
      automations as never,
      handlers as never,
    );
    const now = new Date('2026-08-20T12:10:00Z');

    await expect(scheduler.runDue(now)).resolves.toMatchObject({
      skipped: false,
      jobs: [{ jobId: stored.id, status: 'succeeded' }],
    });
    expect(prisma.automationJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enabled: true, nextRunAt: { lte: now } },
      }),
    );
    expect(handlers.for).toHaveBeenCalledWith('provider-health');
    expect(automations.executeScheduled).toHaveBeenCalledWith(stored.id, handler, now);
  });
});
