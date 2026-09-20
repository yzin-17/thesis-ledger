import { describe, expect, it } from 'vitest';
import type { ChartPoint } from './market-chart-model.js';
import {
  barDatesAfter,
  hasLatestPointChanges,
  shouldRefreshOpeningQuery,
} from './market-chart-latest-window.js';

const point = (date: string) => ({ timestamp: `${date}T00:00:00.000Z` });

describe('barDatesAfter', () => {
  it('只把断点之后的日期算作更新', () => {
    expect(
      barDatesAfter([point('2026-09-15'), point('2026-09-16'), point('2026-09-17')], '2026-09-15'),
    ).toEqual(['2026-09-16', '2026-09-17']);
  });

  it('只剩重叠的探针日时视为没有更新', () => {
    expect(barDatesAfter([point('2026-09-15')], '2026-09-15')).toEqual([]);
    expect(barDatesAfter([], '2026-09-15')).toEqual([]);
  });

  it('去重并按日期升序返回，忽略时间戳里的时刻', () => {
    expect(
      barDatesAfter(
        [
          { timestamp: '2026-09-17T07:00:00.000Z' },
          { timestamp: '2026-09-16T00:00:00.000Z' },
          { timestamp: '2026-09-17T00:00:00.000Z' },
        ],
        '2026-09-15',
      ),
    ).toEqual(['2026-09-16', '2026-09-17']);
  });
});

const chartPoint = (
  date: string,
  close = 10,
  completionStatus: 'complete' | 'incomplete' = 'complete',
  indicatorValue = 1,
): ChartPoint => ({
  date,
  bar: {
    timestamp: `${date}T00:00:00.000Z`,
    open: 9,
    high: 11,
    low: 8,
    close,
    volume: 100,
    amount: 1_000,
    completionStatus,
    inputFingerprint: 'bar-input',
  },
  indicators: {
    MA: {
      timestamp: `${date}T00:00:00.000Z`,
      values: { ma5: indicatorValue },
      inputFingerprint: 'indicator-input',
    },
  },
  comparableIndicators: { MA: true },
  comparable: true,
});

describe('最新端更新判定', () => {
  it('每个详情会话仅首个无历史分页查询显式刷新', () => {
    expect(shouldRefreshOpeningQuery('600519.SH', undefined, null)).toBe(true);
    expect(shouldRefreshOpeningQuery('600519.SH', undefined, '600519.SH')).toBe(false);
    expect(shouldRefreshOpeningQuery('600519.SH', '2026-09-01', null)).toBe(false);
  });

  it('接受同日 OHLC、完成状态和指标值变化', () => {
    const current = [chartPoint('2026-09-17')];
    expect(hasLatestPointChanges(current, [chartPoint('2026-09-17')], '2026-09-17')).toBe(false);
    expect(hasLatestPointChanges(current, [chartPoint('2026-09-17', 11)], '2026-09-17')).toBe(true);
    expect(
      hasLatestPointChanges(current, [chartPoint('2026-09-17', 10, 'incomplete')], '2026-09-17'),
    ).toBe(true);
    expect(hasLatestPointChanges(current, [chartPoint('2026-09-17', 10, 'complete', 2)], '2026-09-17')).toBe(true);
  });
});
