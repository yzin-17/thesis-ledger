import { expect, it } from 'vitest';
import { researchTradeActivity, researchAnalyticsV2 } from '../src/backtest-research-analytics.js';
import { convertSimulationMoneyAt } from '../src/simulation-valuation.js';
import { buildBacktestAnalytics } from '../src/backtest-result-analytics.js';

it.each(['1', '10'])('未平仓和部分卖出均计入全部成交，资金同比缩放%s倍', (scale) => {
  const n = Number(scale);
  expect(researchTradeActivity([
    { quantity: String(100 * n), price: '10' },
    { quantity: String(50 * n), price: '10' },
  ], String(1000 * n))).toEqual({
    tradedNotional: { status: 'available', value: String(1500 * n) },
    turnoverRate: { status: 'available', value: '1.5' },
  });
});

it('正初始资金、零实际成交返回零；无正分母时不伪造周转率', () => {
  expect(researchTradeActivity([], '1000').turnoverRate).toEqual({ status: 'available', value: '0' });
  expect(researchTradeActivity([], '0').turnoverRate).toMatchObject({ status: 'unavailable' });
  expect(() => researchTradeActivity([{ quantity: '-1', price: '10' }], '1000')).toThrow();
});

it('新指标直接使用初始资金，不使用首个收盘权益，也不改旧分析对象', () => {
  const old = buildBacktestAnalytics({ runId: 'run', strategyVersionId: 'version', snapshotId: 'snapshot',
    contentHash: 'hash', engineVersion: 'old', schemaVersion: '2', marketRuleVersion: 'rules',
    calendarVersion: 'calendar', aggregationVersion: 'bars', periodsPerYear: 252, baseCurrency: 'CNY',
    equityCurve: [
      { occurredAt: '2026-01-01T07:00:00Z', value: { amount: '1100', currency: 'CNY' } },
      { occurredAt: '2026-01-02T07:00:00Z', value: { amount: '1100', currency: 'CNY' } },
      { occurredAt: '2026-01-03T07:00:00Z', value: { amount: '1100', currency: 'CNY' } },
    ], trades: [],
  });
  const original = JSON.stringify(old);
  const next = researchAnalyticsV2(old, [{ quantity: '100', price: '10' }], '1000');
  expect(next.analyticsVersion).toBe('research-analytics-v2');
  expect(next.metrics.turnoverRate).toEqual({ status: 'available', value: '1' });
  expect(next.metrics.turnover).toBeUndefined();
  expect(next.metrics.sharpe).toMatchObject({ status: 'unavailable', reason: 'ZERO_VOLATILITY' });
  expect(JSON.stringify(old)).toBe(original);
});

it('成交金额复用冻结汇率的可见性、反向换算和失效规则', () => {
  const rate = { fromCurrency: 'USD', toCurrency: 'CNY', rate: '7',
    occurredAt: '2026-01-01T00:00:00Z', availableAt: '2026-01-01T01:00:00Z',
    provider: 'fixture', providerRevision: '1' } as const;
  const at = '2026-01-01T02:00:00Z';
  expect(convertSimulationMoneyAt('10', 'USD', 'CNY', [rate], at))
    .toEqual({ status: 'available', value: '70' });
  expect(convertSimulationMoneyAt('70', 'CNY', 'USD', [rate], at))
    .toEqual({ status: 'available', value: '10' });
  expect(convertSimulationMoneyAt('10', 'USD', 'CNY', [rate], rate.occurredAt))
    .toEqual({ status: 'unavailable', reason: 'FX_UNAVAILABLE' });
  expect(convertSimulationMoneyAt('10', 'USD', 'CNY', [{ ...rate, stale: true }], at))
    .toEqual({ status: 'unavailable', reason: 'FX_STALE' });
});
