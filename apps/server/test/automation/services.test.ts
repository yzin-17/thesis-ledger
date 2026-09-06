import { describe, expect, it, vi } from 'vitest';
import { nextCronOccurrence, runWithRetry } from '../../src/automation/automation.service.js';
import { AutomationRuntimeHandlers } from '../../src/automation/automation-runtime.service.js';
import {
  dailyDigest,
  dailyRiskSummary,
  dataHealthAlert,
  intradayRiskScan,
  isTradingDay,
  openingScan,
  preMarketPositionEvents,
  weeklyStrategyReview,
} from '../../src/automation/workflows.service.js';

describe('Automation 工作流', () => {
  it('交易日感知、持仓事件过滤和批量风险扫描可复用手动逻辑', () => {
    expect(isTradingDay('2025-01-04T00:00:00Z')).toBe(false);
    expect(isTradingDay('2025-01-03T00:00:00Z')).toBe(true);
    expect(
      preMarketPositionEvents(
        [{ symbol: '600519.SH', quantity: 100 }],
        [
          { symbol: '600519.SH', kind: 'announcement' },
          { symbol: '000001.SZ', kind: 'news' },
        ],
      ),
    ).toHaveLength(1);
    const batches: number[] = [];
    expect(
      intradayRiskScan({
        contexts: [1, 2, 3, 4, 5],
        batchSize: 2,
        scan: (batch) => {
          batches.push(batch.length);
          return batch;
        },
      }),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(batches).toEqual([2, 2, 1]);
  });
  it('日报、开盘扫描和健康告警保留数据限制', () => {
    const risk = dailyRiskSummary([{ severity: 'warning', triggered: true, status: 'active' }]);
    expect(dailyDigest({ date: '2025-01-03', events: [], risk, attention: [] })).not.toHaveProperty(
      'channels',
    );
    expect(
      openingScan({
        asOf: '2025-01-03T01:30:00Z',
        quotes: [{ symbol: 'A', price: 11, previousClose: 10 }],
      }),
    ).toMatchObject({ limitations: ['no_l2_data'] });
    expect(
      dataHealthAlert({ providerStates: [{ provider: 'dsa', state: 'down' }], qualityIssues: [] })
        .alert,
    ).toBe(true);
    expect(
      weeklyStrategyReview({
        start: '2025-01-01',
        end: '2025-01-05',
        strategySignals: [],
        backtestChanges: [],
        executionLinks: [],
      }),
    ).toMatchObject({ recommendationTarget: 'research/decision-log' });
  });
});

describe('自动化基础', () => {
  it('按 Asia/Shanghai 时区计算下次 cron 时间', () =>
    expect(
      nextCronOccurrence(
        '30 9 * * *',
        'Asia/Shanghai',
        new Date('2025-01-01T01:29:30Z'),
      ).toISOString(),
    ).toBe('2025-01-01T01:30:00.000Z'));
  it('支持常用的 step 与 range/step cron 表达式', () => {
    expect(
      nextCronOccurrence('*/5 * * * *', 'Asia/Shanghai', new Date('2025-01-01T01:29:30Z')),
    ).toEqual(new Date('2025-01-01T01:30:00Z'));
    expect(
      nextCronOccurrence('30-40/5 * * * *', 'Asia/Shanghai', new Date('2025-01-01T01:29:30Z')),
    ).toEqual(new Date('2025-01-01T01:30:00Z'));
  });
  it('两次失败后按 backoff 重试成功', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('one'))
      .mockRejectedValueOnce(new Error('two'))
      .mockResolvedValue('ok');
    const waits: number[] = [];
    await expect(
      runWithRetry(operation, { maxAttempts: 3, backoffMs: 10 }, async (milliseconds) => {
        waits.push(milliseconds);
      }),
    ).resolves.toEqual({ result: 'ok', attempts: 3 });
    expect(waits).toEqual([10, 20]);
  });
});

describe('风险后台评估', () => {
  const makePosition = (id: string, symbol: string) => ({
    id,
    symbol,
    accountId: 'account-1',
    quantity: 100,
    costPrice: 10,
    updatedAt: new Date('2026-09-05T00:00:00Z'),
    asset: { assetType: 'stock' },
  });

  const makeRuntime = (
    positionsByMode: Record<string, unknown[]>,
    riskScan: ReturnType<typeof vi.fn>,
  ) =>
    new AutomationRuntimeHandlers(
      {
        position: {
          findMany: vi.fn(async (args: { where: { account: { mode: string } } }) =>
            positionsByMode[args.where.account.mode],
          ),
        },
        riskEvent: { findMany: vi.fn(async () => []) },
      } as never,
      { riskScan } as never,
      { getQuote: vi.fn(async () => ({ price: 9 })) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

  it('后台风险评估同批覆盖实际与模拟组合，上下文按模式标记', async () => {
    const riskScan = vi.fn(async (contexts: Array<{ mode: string }>) => ({
      traceId: 'trace-1',
      scanId: 'scan-1',
      results: contexts.map((context) => ({ ruleId: 'rule-1', eventId: `event-${context.mode}` })),
    }));
    const runtime = makeRuntime(
      {
        actual: [makePosition('position-actual', '600519.SH')],
        shadow: [makePosition('position-shadow', '510300.SH')],
      },
      riskScan,
    );
    const result = (await runtime
      .for('risk-evaluation')
      .run(new AbortController().signal, new Date('2026-09-05T02:00:00Z'))) as {
      contextCount: number;
      shadow: { contextCount: number; eventCount: number };
    };

    expect(riskScan).toHaveBeenCalledTimes(2);
    const actualContexts = riskScan.mock.calls[0]?.[0] as Array<{ mode: string }>;
    const shadowContexts = riskScan.mock.calls[1]?.[0] as Array<{ mode: string }>;
    expect(actualContexts[0]?.mode).toBe('actual');
    expect(shadowContexts[0]?.mode).toBe('shadow');
    expect(result.contextCount).toBe(1);
    expect(result.shadow).toMatchObject({ contextCount: 1, eventCount: 1 });
  });

  it('模拟扫描失败只记录错误，不影响实际模式的监控结果', async () => {
    const riskScan = vi
      .fn()
      .mockResolvedValueOnce({ traceId: 'trace-1', scanId: 'scan-1', results: [] })
      .mockRejectedValueOnce(new Error('shadow scan failed'));
    const runtime = makeRuntime(
      {
        actual: [makePosition('position-actual', '600519.SH')],
        shadow: [makePosition('position-shadow', '510300.SH')],
      },
      riskScan,
    );
    const result = (await runtime
      .for('risk-evaluation')
      .run(new AbortController().signal, new Date('2026-09-05T02:00:00Z'))) as {
      contextCount: number;
      results: unknown[];
      shadow: { error: string };
    };

    expect(result.contextCount).toBe(1);
    expect(result.results).toEqual([]);
    expect(result.shadow).toEqual({ error: 'shadow scan failed' });
  });

  it('日报只统计实际模式事件，模拟事件不进入通知', async () => {
    const riskEventFindMany = vi.fn(async () => []);
    const runtime = makeRuntime({}, vi.fn()) as unknown as {
      prisma: { riskEvent: { findMany: ReturnType<typeof vi.fn> } };
    };
    runtime.prisma.riskEvent.findMany = riskEventFindMany;
    await (
      runtime as unknown as {
        for: (type: string) => { run: (signal: AbortSignal, at: Date) => Promise<unknown> };
      }
    )
      .for('daily-digest')
      .run(new AbortController().signal, new Date('2026-09-05T02:00:00Z'));
    expect(riskEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ mode: 'actual' }),
      }),
    );
  });
});
