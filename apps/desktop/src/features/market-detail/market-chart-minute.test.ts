import { describe, expect, it } from 'vitest';
import { buildChartPoints, mergeChartPoints } from './market-chart-model.js';
import { chartCursorForKey, chartInteractionKey, chartPointKey, chartTimeData, formatChartBarTime, toChartTime } from './market-chart-time.js';
import { chartRangeLabel, initialChartTimeRange, visibleBarsForRange } from './market-chart-range.js';
import type { MarketChartBar, MarketChartIndicator } from './market-chart-types.js';

const bars: MarketChartBar[] = [0, 1, 2].map((index) => ({
  timestamp: `2026-05-18T09:3${index}:00+08:00`, open: 10, high: 12, low: 9, close: 11,
  volume: index === 0 ? 0 : null, amount: null, symbol: '00700.HK',
  timeframe: '1m', provider: 'futu', adjustment: 'none', inputFingerprint: 'shared-input',
}));

describe('分钟点位与图表时间', () => {
  it('键盘逐点移动保留同一天的不同分钟，首尾有界且未知键不改变读数', () => {
    const first = chartCursorForKey(bars, null, 'Home');
    expect(first).toBe('2026-05-18T01:30:00.000Z');
    expect(chartCursorForKey(bars, first!, 'ArrowRight')).toBe('2026-05-18T01:31:00.000Z');
    expect(chartCursorForKey(bars, first!, 'ArrowLeft')).toBe(first);
    const last = chartCursorForKey(bars, first!, 'End');
    expect(chartCursorForKey(bars, last!, 'ArrowRight')).toBe(last);
    expect(chartCursorForKey(bars, null, 'Tab')).toBeUndefined();
    expect(chartCursorForKey([], null, 'Home')).toBeUndefined();
  });
  it('同日分钟和指标分别关联，不压成一个日期，分页不会丢点', () => {
    const indicator = {
      name: 'MA', parameters: { period: 5 }, symbol: '00700.HK', timeframe: '1m', provider: 'futu',
      inputFingerprint: 'shared-input', engineVersion: 'dsa-indicator-v3',
      points: bars.map((bar, index) => ({ timestamp: bar.timestamp, values: { ma5: index + 1 }, inputFingerprint: 'shared-input' })),
      inputProvenance: { timeframe: '1m', provider: 'futu', adjustment: 'none',
        inputDateRange: { start: bars[0]!.timestamp, end: bars[2]!.timestamp }, inputFingerprint: 'shared-input' },
      calculationAnchor: { timestamp: bars[2]!.timestamp, inputFingerprint: 'shared-input' },
    } as MarketChartIndicator;
    const points = buildChartPoints(bars, [indicator]);
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.indicators.MA?.values.ma5)).toEqual([1, 2, 3]);
    expect(points.every((p) => p.comparableIndicators.MA)).toBe(true);
    expect(mergeChartPoints([points.slice(0, 2), points.slice(1)])).toHaveLength(3);
    expect(points[0]!.bar?.volume).toBe(0);
    expect(points[1]!.bar?.volume).toBeNull();
  });

  it('分钟交给图表库的是秒数，十字线返回同一个完整时间键', () => {
    const key = chartPointKey(bars[0]!.timestamp, '1m');
    const time = toChartTime(key);
    expect(typeof time).toBe('number');
    expect(time).toBe(Date.parse(bars[0]!.timestamp) / 1000);
    expect(chartInteractionKey(time)).toBe(key);
    expect(chartTimeData([{ time: key, value: 1 }])).toEqual([{ time, value: 1 }]);
    expect(toChartTime('2026-05-18')).toBe('2026-05-18');
    expect(chartInteractionKey({ year: 2026, month: 5, day: 18 })).toBe('2026-05-18');
  });

  it('窗口按分钟根数，时钟按香港/美东时区，不改变日线区间', () => {
    const points = buildChartPoints(bars, []);
    expect(visibleBarsForRange(bars, 2)).toEqual(bars.slice(-2));
    expect(initialChartTimeRange(points, 2)).toEqual({
      from: Date.parse(bars[1]!.timestamp) / 1000, to: Date.parse(bars[2]!.timestamp) / 1000,
    });
    expect(chartRangeLabel(90, '1m')).toBe('最近90根');
    expect(chartRangeLabel(90, '1d')).toBe('3月');
    expect(formatChartBarTime(bars[0]!)).toContain('09:30');
    expect(formatChartBarTime(bars[0]!)).toContain('香港时间');
    expect(formatChartBarTime({ ...bars[0]!, symbol: 'SPY.US', timestamp: '2026-07-13T13:30:00Z' })).toContain('09:30');
    expect(formatChartBarTime({ ...bars[0]!, symbol: 'SPY.US', timestamp: '2026-01-12T14:30:00Z' })).toContain('09:30');
  });
});
