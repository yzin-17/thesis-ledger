import { describe, expect, it, vi } from 'vitest';
import { nextCronOccurrence, runWithRetry } from '../../src/automation/automation.service.js';
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
    expect(dailyDigest({ date: '2025-01-03', events: [], risk, attention: [] })).toMatchObject({
      channels: ['feishu'],
    });
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
