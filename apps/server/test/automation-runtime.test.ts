import { describe, expect, it, vi } from 'vitest';
import { cnTradingCalendar } from '@thesis-ledger/domain';
import {
  automationJobTypes,
  automationJobTypeSchema,
  isMarketAutomationJobType,
  type AutomationJobType,
} from '@thesis-ledger/schemas';
import { AutomationScheduler } from '../src/automation/automation.scheduler.js';
import { AutomationRuntimeHandlers } from '../src/automation/automation-runtime.service.js';
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
    const service = new AutomationService(prisma as never, redis as never);
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
    const service = new AutomationService(prisma as never, redisFixture() as never);
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
