import { describe, expect, it } from 'vitest';
import { planBacktestEventRequestsV3 } from '../../src/backtest/backtest-event-requests-v3.js';
import type { BacktestEventDependency } from '../../src/backtest/backtest-dependency-plan.js';

const identity = {
  symbol: '510300.SH', market: 'CN' as const, assetType: 'ETF' as const,
  desiredRevision: 2, effectivePolicyRevision: 2, catalogRevision: 3,
  dataAsOf: '2026-09-27T00:00:00Z',
};
const dependency = (eventTypes: BacktestEventDependency['eventTypes'], startDate = '2025-01-01'): BacktestEventDependency => ({
  instrument: 'CN:ETF:510300.SH', purpose: 'strategy-signal',
  effectiveDateWindow: { startDate, endDate: '2025-12-31' }, eventTypes,
  requiredFields: [], completeCoverageRequired: true, visibilityRequired: true,
});

describe('事件依赖请求规划', () => {
  it('raw 记账分别请求现金和拆分，并固定共同版本与截点', () => {
    const raw = { ...dependency(['CASH_DIVIDEND', 'SPLIT', 'REVERSE_SPLIT']), purpose: 'raw-accounting' as const };
    const requests = planBacktestEventRequestsV3(identity, [raw], (capability) => `r-${capability}`);
    expect(requests.map((request) => request.routeKey.capability)).toEqual(['CASH_DISTRIBUTION', 'SPLIT_EVENT']);
    for (const request of requests) expect(request).toMatchObject({
      symbol: identity.symbol, desiredRevision: 2, effectivePolicyRevision: 2,
      catalogRevision: 3, dataAsOf: identity.dataAsOf, start: '2025-01-01', end: '2025-12-31',
    });
    expect(new Set(requests.map((request) => request.requestId)).size).toBe(2);
  });

  it('现金信号不请求拆分，独立窗口不相互扩张', () => {
    const requests = planBacktestEventRequestsV3(identity, [
      dependency(['CASH_DIVIDEND'], '2025-03-01'), dependency(['SPLIT'], '2025-06-01'),
      dependency(['CASH_DIVIDEND'], '2025-02-01'),
    ], (capability) => capability);
    expect(requests.map(({ start }) => start)).toEqual(['2025-02-01', '2025-06-01']);
    expect(planBacktestEventRequestsV3(identity, [dependency(['CASH_DIVIDEND'])], (value) => value)).toHaveLength(1);
  });

  it('空依赖不产生请求', () => {
    expect(planBacktestEventRequestsV3(identity, [], (value) => value)).toEqual([]);
  });
});
