import { describe, expect, it } from 'vitest';
import { marketCivilInstant } from '../src/market-civil-clock.js';
import {
  aggregateMarketMinutes,
  marketMinuteBuckets,
  type MarketMinuteInputPoint,
} from '../src/market-minute-aggregation.js';
import type { MarketPeriodCalendarFact } from '../src/market-period-types.js';

const fixture = (market: 'HK' | 'US', date = '2026-10-08', shortened = false) => {
  const timezone = market === 'HK' ? 'Asia/Hong_Kong' : 'America/New_York';
  const ranges =
    market === 'HK'
      ? [
          [570, 720],
          [780, 960],
        ]
      : [[570, shortened ? 780 : 960]];
  const at = (minute: number) => marketCivilInstant(date, minute, timezone);
  const asOf = at(1100);
  const calendar: MarketPeriodCalendarFact = {
    market,
    timezone,
    revision: 'controlled-calendar',
    availableAt: '2025-01-01T00:00:00Z',
    coverageStart: date,
    coverageEnd: date,
    sessions: ranges.map(([start, end]) => ({
      tradingDate: date,
      startAt: at(start!),
      endAt: at(end!),
    })),
  };
  const make = (timestamp: string, price: number): MarketMinuteInputPoint => ({
    timestamp,
    availableAt: asOf,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price + 0.5,
    volume: 100,
    amount: 200,
    completionStatus: 'complete',
  });
  const points: MarketMinuteInputPoint[] = market === 'HK' ? [make(at(570), 10)] : [];
  for (const [start, end] of ranges)
    for (let minute = start! + 1; minute <= end!; minute++)
      points.push(make(at(minute), 20 + points.length));
  return { calendar, points, evaluationAsOf: asOf, includeOpeningBoundary: market === 'HK', at };
};

describe('Session分钟聚合', () => {
  it('港股开盘边界纳入首桶，午休独立，量额守恒且边界点不冒充连续分钟', () => {
    const f = fixture('HK');
    expect(f.points).toHaveLength(331);
    const result = aggregateMarketMinutes({ ...f, timeframe: '5m' });
    expect(result).toHaveLength(66);
    expect(result[0]).toMatchObject({
      timestamp: f.at(570),
      bucketEndAt: f.at(575),
      expectedMinutes: 5,
      observedMinutes: 5,
      openingBoundaryPoints: 1,
      open: 10,
      close: f.points[5]!.close,
      volume: 600,
      completionStatus: 'complete',
    });
    expect(result.reduce((total, point) => total + point.volume!, 0)).toBe(33100);
    expect(result[29]!.bucketEndAt).toBe(f.at(720));
    expect(result[30]!.timestamp).toBe(f.at(780));
    const hourly = aggregateMarketMinutes({ ...f, timeframe: '60m' });
    expect(hourly).toHaveLength(6);
    expect(hourly[2]).toMatchObject({
      timestamp: f.at(690),
      bucketEndAt: f.at(720),
      expectedMinutes: 30,
    });
  });

  it.each(['5m', '15m', '30m', '60m'] as const)(
    '美股%s涵盖全部390分钟，半桶也可在Session收盘后完整',
    (timeframe) => {
      const f = fixture('US');
      const result = aggregateMarketMinutes({ ...f, timeframe });
      expect(result.reduce((total, point) => total + point.observedMinutes, 0)).toBe(390);
      expect(result.every((point) => point.completionStatus === 'complete')).toBe(true);
      expect(result.at(-1)!.bucketEndAt).toBe(f.at(960));
    },
  );

  it('早收市与夏令时来自Session事实，不固定UTC偏移', () => {
    const f = fixture('US', '2026-11-27', true);
    const result = aggregateMarketMinutes({ ...f, timeframe: '60m' });
    expect(result).toHaveLength(4);
    expect(result.at(-1)!.expectedMinutes).toBe(30);
    expect(result.at(-1)!.bucketEndAt).toBe('2026-11-27T18:00:00.000Z');
    expect(marketCivilInstant('2026-07-08', 570, 'America/New_York')).toBe(
      '2026-07-08T13:30:00.000Z',
    );
    expect(marketCivilInstant('2026-11-04', 570, 'America/New_York')).toBe(
      '2026-11-04T14:30:00.000Z',
    );
    expect(() => marketCivilInstant('2026-03-08', 150, 'America/New_York')).toThrow('无法映射');
  });

  it('当前分钟末端可以尚未到达，桶不标完整，不生成未来空桶', () => {
    const f = fixture('US', '2026-11-04');
    const asOf = '2026-11-04T14:32:30.000Z';
    const points = f.points
      .slice(0, 3)
      .map((point) => ({ ...point, availableAt: asOf, completionStatus: 'incomplete' as const }));
    const result = aggregateMarketMinutes({ ...f, timeframe: '5m', evaluationAsOf: asOf, points });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      timestamp: f.at(570),
      bucketEndAt: f.at(575),
      observedEndAt: f.at(573),
      observedMinutes: 3,
      expectedMinutes: 5,
      completionStatus: 'incomplete',
    });
  });

  it('历史截止点限定预期分钟，观察时钟和历史可见性不混为一体', () => {
    const f = fixture('US');
    const result = aggregateMarketMinutes({
      ...f,
      timeframe: '5m',
      cutoffAt: f.at(575),
      points: f.points.slice(0, 5),
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.completionStatus).toBe('complete');
    expect(result[0]!.availableAt).toBe(f.evaluationAsOf);
    expect(() => aggregateMarketMinutes({ ...f, timeframe: '5m', cutoffAt: f.at(575) })).toThrow(
      'minute_future',
    );
  });

  it('缺失、重复和Session外分钟分别失败，未知量额保持null', () => {
    const f = fixture('HK');
    expect(() =>
      aggregateMarketMinutes({ ...f, timeframe: '5m', points: f.points.filter((_, i) => i !== 7) }),
    ).toThrow('minute_coverage_incomplete');
    expect(() =>
      aggregateMarketMinutes({ ...f, timeframe: '5m', points: [...f.points, f.points[0]!] }),
    ).toThrow('minute_duplicate');
    expect(() =>
      aggregateMarketMinutes({
        ...f,
        timeframe: '5m',
        points: [...f.points, { ...f.points[0]!, timestamp: f.at(750) }],
      }),
    ).toThrow('minute_session_mismatch');
    const points = f.points.map((point, i) => (i === 3 ? { ...point, amount: null } : point));
    expect(aggregateMarketMinutes({ ...f, timeframe: '5m', points })[0]!.amount).toBeNull();
  });

  it('日历时区、发布时点与原始点预算在聚合前检查', () => {
    const f = fixture('US');
    expect(() =>
      aggregateMarketMinutes({
        ...f,
        timeframe: '5m',
        calendar: { ...f.calendar, timezone: 'Asia/Shanghai' },
      }),
    ).toThrow('minute_calendar_invalid');
    expect(() =>
      aggregateMarketMinutes({
        ...f,
        timeframe: '5m',
        calendar: { ...f.calendar, availableAt: '2099-01-01T00:00:00Z' },
      }),
    ).toThrow('minute_future');
    const sessions = Array.from({ length: 200 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
      return {
        tradingDate: day,
        startAt: marketCivilInstant(day, 570, 'America/New_York'),
        endAt: marketCivilInstant(day, 960, 'America/New_York'),
      };
    });
    expect(() =>
      marketMinuteBuckets({
        ...f,
        timeframe: '5m',
        calendar: {
          ...f.calendar,
          coverageStart: sessions[0]!.tradingDate,
          coverageEnd: sessions.at(-1)!.tradingDate,
          sessions,
        },
      }),
    ).toThrow('minute_budget_exceeded');
  });
});
