import { describe, expect, it } from 'vitest';
import type { UTCTimestamp } from 'lightweight-charts';
import { chartVisibleRange, formatChartBarDate, formatChartBarTime } from './market-chart-time.js';
import type { MarketChartBar } from './market-chart-types.js';

const bar = (
  symbol: string,
  timestamp: string,
  timeframe: MarketChartBar['timeframe'] = '60m',
): MarketChartBar => ({
  symbol,
  timestamp,
  timeframe,
  open: 10,
  high: 11,
  low: 9,
  close: 10,
  volume: null,
  amount: null,
});

describe('行情视口时间键', () => {
  it('将初次布局与窗口缩放返回的秒时间戳转换为分钟点使用的 ISO 键', () => {
    const from = (Date.parse('2026-11-06T14:31:00+08:00') / 1000) as UTCTimestamp;
    const to = (Date.parse('2026-11-06T16:00:00+08:00') / 1000) as UTCTimestamp;
    expect(chartVisibleRange({ from, to })).toEqual({
      from: '2026-11-06T06:31:00.000Z',
      to: '2026-11-06T08:00:00.000Z',
    });
  });
  it('保留日线日期键并兼容 BusinessDay，空视口不产生假日期', () => {
    expect(
      chartVisibleRange({ from: '2026-11-05', to: { year: 2026, month: 11, day: 6 } }),
    ).toEqual({
      from: '2026-11-05',
      to: '2026-11-06',
    });
    expect(chartVisibleRange(null)).toBeNull();
    expect(chartVisibleRange({ from: Number.NaN as UTCTimestamp, to: '2026-11-06' })).toBeNull();
  });
});

describe('行情市场日期', () => {
  it.each([
    ['00700.HK', '2026-11-06T16:00:00+08:00', '香港时间'],
    ['AAPL.US', '2026-11-06T16:00:00-05:00', '美东时间'],
    ['510300.SH', '2026-11-06T15:00:00+08:00', '北京时间'],
  ])('按 %s 的市场显示日期和时间，不按设备时区跨日', (symbol, timestamp, label) => {
    const value = bar(symbol, timestamp);
    expect(formatChartBarDate(value)).toBe('2026/11/6');
    expect(formatChartBarTime(value)).toContain('2026/11/06');
    expect(formatChartBarTime(value)).toContain(label);
  });
  it('日线保持来源交易日，包括带偏移的时间，不向前或向后挪一天', () => {
    const value = bar('AAPL.US', '2026-11-06T23:00:00-05:00', '1d');
    expect(formatChartBarDate(value)).toBe('2026/11/6');
    expect(formatChartBarTime(value)).toBe('2026/11/6');
  });
});
