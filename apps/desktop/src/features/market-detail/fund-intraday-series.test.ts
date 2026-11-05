import { describe, expect, it } from 'vitest';
import type { FundValuationToday } from '@thesis-ledger/api-client';
import { fundIntradaySegments } from './fund-intraday-series.js';

const point = (minute: number, value: number | null, anchor = '2026-11-03T00:00:00Z'): FundValuationToday['points'][number] => ({
  at: new Date(Date.parse('2026-11-04T06:00:00Z') + minute * 60_000).toISOString(),
  valuation: {
    version: 1, symbol: '000001.OF', marketState: 'open',
    quality: value === null ? 'unavailable' : 'partial', estimatedNav: value,
    changePercent: value === null ? null : (value - 1) * 100,
    estimatedAt: value === null ? null : new Date(Date.parse('2026-11-04T06:00:00Z') + minute * 60_000).toISOString(),
    oldestPriceAt: value === null ? null : '2026-11-04T06:00:00Z',
    anchor: { unitNav: 1, navDate: anchor }, disclosureCoverage: 0.8, pricedCoverage: value === null ? 0 : 0.8,
    reasons: [value === null ? 'prices_unavailable' : 'partial_coverage'], method: 'disclosed-holdings-qfq-v1',
  },
});

describe('基金今日曲线', () => {
  it('连续分钟连接；缺价、漏采分钟和基准净值变化时断开', () => {
    const result = fundIntradaySegments([
      point(0, 1), point(1, 1.01), point(2, null), point(3, 1.02), point(5, 1.03),
      point(6, 1.04, '2026-11-04T00:00:00Z'),
    ]);
    expect(result.map((segment) => segment.map((value) => value.value))).toEqual([[1, 1.01], [1.02], [1.03], [1.04]]);
    expect(result[0]?.[1]?.time).toBe(Date.parse('2026-11-04T06:01:00Z') / 1000);
  });
  it('空数据和全部缺价不生成数值，单点仍保留', () => {
    expect(fundIntradaySegments([])).toEqual([]);
    expect(fundIntradaySegments([point(0, null)])).toEqual([]);
    expect(fundIntradaySegments([point(0, 1)])).toHaveLength(1);
  });
});
