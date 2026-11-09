import { describe, expect, it, vi } from 'vitest';
import { chartDateInterval, chartMarketDate, isChartDateRange, chartHistoryPointLimit } from './chart-date-range.js';

describe('行情日期区间', () => {
  it('按自然日期和日历月份计算快捷区间，月末不越界', () => {
    expect(chartDateInterval(1, '2026-11-06')).toEqual({ from: '2026-11-06', to: '2026-11-06' });
    expect(chartDateInterval(7, '2026-11-06')?.from).toBe('2026-10-31');
    expect(chartDateInterval(30, '2024-03-31')?.from).toBe('2024-02-29');
    expect(chartDateInterval(180, '2026-11-06')?.from).toBe('2026-05-06');
    expect(chartDateInterval(365, '2024-02-29')?.from).toBe('2023-02-28');
    expect(chartDateInterval(1095, '2026-11-06')?.from).toBe('2023-11-06');
  });
  it('校验日期及自定义首尾，并按市场归属跨 UTC 午夜的分钟', () => {
    expect(isChartDateRange({ from: '2026-02-29', to: '2026-03-01' })).toBe(false);
    expect(isChartDateRange({ from: '2026-11-06', to: '2026-11-05' })).toBe(false);
    expect(isChartDateRange({ from: '2026-11-06', to: '2026-11-06' })).toBe(true);
    expect(chartMarketDate('2026-07-14T00:30:00Z', 'SPY.US')).toBe('2026-07-13');
    expect(chartMarketDate('2026-07-14T00:30:00Z', '00700.HK')).toBe('2026-07-14');
  });
});

import { defaultPreference, preferenceKey, readPreference } from './market-chart-preferences.js';
import { visibleBarsForRange } from './market-chart-range.js';
import type { MarketChartBar } from './market-chart-types.js';

it('三年补读按周期估算且受三千根约束，普通翻页仍增加九十根', () => {
  expect(chartHistoryPointLimit(90, '2023-11-06', '2026-11-06T07:00:00Z', '1d')).toBeLessThan(1300);
  expect(chartHistoryPointLimit(90, '2023-11-06', '2026-11-06T07:00:00Z', '1m')).toBe(3000);
  expect(chartHistoryPointLimit(90, undefined, undefined, '1d')).toBe(180);
  expect(chartHistoryPointLimit(3000, '2000-01-01', '2026-11-06', '1d')).toBe(3000);
});

it('分钟图按美国市场日期包含同一交易日跨 UTC 午夜的点', () => {
  const bars = ['2026-07-13T19:00:00Z', '2026-07-14T00:30:00Z', '2026-07-14T14:00:00Z']
    .map((timestamp) => ({ timestamp, timeframe: '1m', symbol: 'SPY.US' } as MarketChartBar));
  expect(visibleBarsForRange(bars, { from: '2026-07-13', to: '2026-07-13' })).toEqual(bars.slice(0, 2));
  expect(visibleBarsForRange(bars, 1)).toEqual(bars.slice(2));
});

it('旧区间迁移到一月，合法自定义偏好恢复，非法日期回退', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => store.get(key) } });
  try {
    store.set(preferenceKey, JSON.stringify({ ...defaultPreference, visibleRange: 90 }));
    expect(readPreference().visibleRange).toBe(30);
    const custom = { from: '2024-02-29', to: '2025-03-01' };
    store.set(preferenceKey, JSON.stringify({ ...defaultPreference, visibleRange: custom }));
    expect(readPreference().visibleRange).toEqual(custom);
    store.set(preferenceKey, JSON.stringify({ visibleRange: { from: '2026-02-29', to: '2026-03-01' } }));
    expect(readPreference().visibleRange).toBe(30);
  } finally { vi.unstubAllGlobals(); }
});
