import { describe, expect, it } from 'vitest';
import type { MarketChartBar } from './market-chart-types.js';
import {
  auxiliaryLatestValueOptions,
  rangeCoverage,
  rangeMonths,
  visibleBarsForRange,
} from './MarketPriceLightweightChart.js';

const bar = (timestamp: string): MarketChartBar => ({
  symbol: '600519.SH',
  timeframe: '1d',
  timestamp,
  open: 10,
  high: 11,
  low: 9,
  close: 10,
  volume: 100,
  amount: 1000,
  provider: 'fixture',
  fetchedAt: timestamp,
  freshness: 'delayed',
  servedFromCache: false,
  completionStatus: 'complete',
  availableAt: timestamp,
});

describe('MarketPriceLightweightChart range helpers', () => {
  it('只把已支持的交易日范围映射为月份，0 表示全部已加载数据', () => {
    expect(rangeMonths(30)).toBe(1);
    expect(rangeMonths(90)).toBe(3);
    expect(rangeMonths(180)).toBe(6);
    expect(rangeMonths(365)).toBe(12);
    expect(rangeMonths(0)).toBeNull();
  });

  it('全部范围不会被误裁剪为 12 个月', () => {
    const bars = [bar('2024-01-02T00:00:00.000Z'), bar('2026-08-21T00:00:00.000Z')];
    expect(visibleBarsForRange(bars, 0)).toHaveLength(2);
  });

  it('报告持久化范围是否被当前已加载日线覆盖', () => {
    const bars = [bar('2026-04-01T00:00:00.000Z'), bar('2026-08-21T00:00:00.000Z')];
    expect(rangeCoverage(bars, 180)).toMatchObject({
      available: false,
      earliest: '2026-04-01',
      latest: '2026-08-21',
      months: 6,
    });
    expect(
      rangeCoverage([bar('2026-05-21T00:00:00.000Z'), bar('2026-08-21T00:00:00.000Z')], 90),
    ).toMatchObject({ available: true, months: 3 });
  });

  it('辅助序列不在价格轴输出无名称的末值或价格线', () => {
    expect(auxiliaryLatestValueOptions).toEqual({
      lastValueVisible: false,
      priceLineVisible: false,
    });
  });
});
