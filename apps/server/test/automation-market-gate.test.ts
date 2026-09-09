import { describe, expect, it, vi } from 'vitest';
import {
  cnTradingCalendar,
  hkTradingCalendar,
  openTradingMarketsAt,
  tradingMarketForAssetMarket,
  usTradingCalendar,
} from '@thesis-ledger/domain';
import {
  AutomationService,
  INTRADAY_VALUATION_CRON,
  managedValuationJobs,
  type AutomationHandler,
} from '../src/automation/automation.service.js';
import { AutomationRuntimeHandlers } from '../src/automation/automation-runtime.service.js';

const job = {
  id: '00000000-0000-4000-8000-000000000011',
  name: '盘中估值采样',
  type: 'valuation-intraday-sample',
  cron: INTRADAY_VALUATION_CRON,
  timezone: 'Asia/Shanghai',
  enabled: true,
  retryPolicy: { maxAttempts: 1, backoffMs: 1 },
  lockTtlMs: 5_000,
  lastRunAt: null,
  nextRunAt: new Date('2026-09-08T17:04:00.000Z'),
} as const;

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

describe('多市场盘中门禁', () => {
  it('盘中任务每日触发并只迁移仍使用旧默认计划的受管任务', async () => {
    const update = vi.fn(async ({ data }: { data: object }) => data);
    const upsert = vi.fn(
      async ({ create }: { create: { systemKey: string; cron: string; timezone: string } }) =>
        create.systemKey === 'valuation-intraday-sample'
          ? { ...create, id: job.id, cron: '* * * * 1-5' }
          : { ...create, id: `job-${create.systemKey}` },
    );
    const service = new AutomationService(
      { automationJob: { upsert, update } } as never,
      {} as never,
      {} as never,
    );

    await service.ensureManagedValuationJobs();

    expect(managedValuationJobs[0]?.cron).toBe('* * * * *');
    expect(update).toHaveBeenCalledWith({
      where: { id: job.id },
      data: { cron: '* * * * *', nextRunAt: expect.any(Date) },
    });
  });

  it('A 股、港股按各自午休和收盘边界判断常规交易时段', () => {
    expect(cnTradingCalendar.isTradingSession('2026-09-09T01:30:00.000Z')).toBe(true);
    expect(cnTradingCalendar.isTradingSession('2026-09-09T03:30:00.000Z')).toBe(false);
    expect(cnTradingCalendar.isTradingSession('2026-09-09T05:00:00.000Z')).toBe(true);
    expect(cnTradingCalendar.isTradingSession('2026-09-09T07:00:00.000Z')).toBe(false);

    expect(hkTradingCalendar.isTradingSession('2026-09-09T01:30:00.000Z')).toBe(true);
    expect(hkTradingCalendar.isTradingSession('2026-09-09T04:00:00.000Z')).toBe(false);
    expect(hkTradingCalendar.isTradingSession('2026-09-09T05:00:00.000Z')).toBe(true);
    expect(hkTradingCalendar.isTradingSession('2026-09-09T08:00:00.000Z')).toBe(false);
  });

  it('港股半日市午后关闭，美股按纽约夏令时、节假日和提前收市判断', () => {
    expect(hkTradingCalendar.isTradingSession('2026-12-24T03:59:59.000Z')).toBe(true);
    expect(hkTradingCalendar.isTradingSession('2026-12-24T04:00:00.000Z')).toBe(false);

    expect(usTradingCalendar.isTradingSession('2026-09-08T13:30:00.000Z')).toBe(true);
    expect(usTradingCalendar.isTradingSession('2026-01-15T14:30:00.000Z')).toBe(true);
    expect(usTradingCalendar.isTradingSession('2026-11-26T15:00:00.000Z')).toBe(false);
    expect(usTradingCalendar.isTradingSession('2026-11-27T17:59:59.000Z')).toBe(true);
    expect(usTradingCalendar.isTradingSession('2026-11-27T18:00:00.000Z')).toBe(false);
  });

  it('资产市场映射到交易市场并返回当前开放市场', () => {
    expect(['CN', 'SH', 'SZ', 'BJ', 'OF'].map(tradingMarketForAssetMarket)).toEqual([
      'CN',
      'CN',
      'CN',
      'CN',
      'CN',
    ]);
    expect(tradingMarketForAssetMarket('HK')).toBe('HK');
    expect(tradingMarketForAssetMarket('US')).toBe('US');
    expect(tradingMarketForAssetMarket('CASH')).toBeNull();
    expect(openTradingMarketsAt('2026-09-08T17:04:00.000Z')).toEqual(['US']);
  });

  it('scheduled gate 在创建运行历史前跳过，手动执行仍绕过门禁', async () => {
    const create = vi.fn(async () => ({ id: 'run-1' }));
    const prisma = {
      automationJob: {
        findUniqueOrThrow: vi.fn(async () => job),
        update: vi.fn(async ({ data }: { data: object }) => ({ ...job, ...data })),
      },
      automationRun: {
        create,
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
    };
    const handler: AutomationHandler = {
      type: 'valuation-intraday-sample',
      scheduledGate: vi.fn(async () => ({ allowed: false, reason: '当前开放市场没有实际持仓' })),
      run: vi.fn(async () => ({ sampled: 1 })),
    };
    const service = new AutomationService(
      prisma as never,
      redisFixture() as never,
      { enqueue: vi.fn(async () => []) } as never,
    );
    const now = new Date('2026-09-08T17:04:06.000Z');

    await expect(service.executeScheduled(job.id, handler, now)).resolves.toEqual({
      skipped: true,
      reason: '当前开放市场没有实际持仓',
    });
    expect(handler.run).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    await expect(service.execute(job.id, handler, now)).resolves.toMatchObject({
      skipped: false,
      output: { sampled: 1 },
    });
    expect(handler.scheduledGate).toHaveBeenCalledOnce();
    expect(handler.run).toHaveBeenCalledWith(expect.any(AbortSignal), now, 'manual');
  });

  it('估值 handler 仅在自动调度时启用账户级市场过滤', async () => {
    const scheduledSamplingGate = vi.fn(async () => ({ allowed: true as const, markets: ['US'] }));
    const sample = vi.fn(async () => ({ sampled: 1 }));
    const handlers = new AutomationRuntimeHandlers(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { scheduledSamplingGate, sample } as never,
    );
    const handler = handlers.for('valuation-intraday-sample');
    const now = new Date('2026-09-08T17:04:06.000Z');

    await expect(handler.scheduledGate?.(now)).resolves.toMatchObject({ allowed: true });
    await handler.run(new AbortController().signal, now, 'scheduled');
    await handler.run(new AbortController().signal, now, 'manual');

    expect(scheduledSamplingGate).toHaveBeenCalledWith(now, 'actual');
    expect(sample).toHaveBeenNthCalledWith(1, now, 'actual', 'CNY', { marketGate: true });
    expect(sample).toHaveBeenNthCalledWith(2, now, 'actual', 'CNY', { marketGate: false });
  });
});
