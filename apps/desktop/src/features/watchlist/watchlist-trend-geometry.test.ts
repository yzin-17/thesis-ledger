import { expect, it } from 'vitest';
import { watchlistTrendGeometry as projectGeometry } from './watchlist-trend-geometry.js';
import type { TrendPoint } from './watchlist-trend.js';

const sessions = (symbol: string) => {
  if (symbol.endsWith('.US')) return [{ tradingDate: '2026-11-06', startAt: '2026-11-06T14:30:00Z', endAt: '2026-11-06T21:00:00Z' }];
  const end = symbol.endsWith('.HK') ? '12:00' : '11:30';
  return [{ tradingDate: '2026-11-06', startAt: '2026-11-06T09:30:00+08:00', endAt: `2026-11-06T${end}:00+08:00` },
    { tradingDate: '2026-11-06', startAt: '2026-11-06T13:00:00+08:00', endAt: '2026-11-06T16:00:00+08:00' }];
};
const watchlistTrendGeometry = (points: TrendPoint[], minute: boolean, symbol: string) => projectGeometry(points, minute, sessions(symbol));

const point = (clock: string, value: number): TrendPoint => ({ at: `2026-11-06T${clock}:00+08:00`, value });
const coordinates = (path: string) => [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)]
  .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));

it.each([
  ['510300.SH', '11:29', '11:30'],
  ['159915.SZ', '11:29', '11:30'],
  ['920002.BJ', '11:29', '11:30'],
  ['02800.HK', '11:59', '12:00'],
])('%s 午休以窄间隔和分割线表示，原始行情与价格范围保持', (symbol, before, end) => {
  const points = [point(before, 4), point(end, 4.2), point('13:00', 4.05), point('13:01', 4.15)];
  const original = structuredClone(points);
  const result = watchlistTrendGeometry(points, true, symbol);
  expect(result.paths).toHaveLength(2);
  expect(result.dividers).toHaveLength(1);
  const morning = coordinates(result.paths[0]!), afternoon = coordinates(result.paths[1]!);
  const left = morning.at(-1)!.x, right = afternoon[0]!.x;
  expect(right - left).toBeGreaterThan(0);
  expect(right - left).toBeLessThan(5);
  expect(result.dividers[0]).toBeGreaterThan(left);
  expect(result.dividers[0]).toBeLessThan(right);
  expect(morning[0]!.y).toBe(40);
  expect(morning.at(-1)!.y).toBe(4);
  expect(points).toEqual(original);
});

it('缺失分钟保留真实间距和断线，不显示午休分割线', () => {
  const result = watchlistTrendGeometry([point('10:00', 4), point('10:01', 4.1), point('10:05', 4.2), point('10:06', 4.3)], true, '510300.SH');
  expect(result.dividers).toEqual([]);
  expect(result.paths).toHaveLength(2);
  const [left, right] = result.paths.map(coordinates);
  expect(right![0]!.x - left![1]!.x).toBeGreaterThan(3 * (left![1]!.x - left![0]!.x));
});

it('美股无午休，日线、只有单个时段或跨日数据不增加午休标记', () => {
  const points = [point('11:29', 4), point('11:30', 4.1), point('13:00', 4.05), point('13:01', 4.2)];
  expect(watchlistTrendGeometry(points, true, 'SPY.US').dividers).toEqual([]);
  expect(watchlistTrendGeometry(points, false, '510300.SH').dividers).toEqual([]);
  expect(watchlistTrendGeometry(points.slice(0, 2), true, '510300.SH').dividers).toEqual([]);
  expect(watchlistTrendGeometry(points.slice(2), true, '510300.SH').dividers).toEqual([]);
  expect(watchlistTrendGeometry([points[0]!, { ...points[2]!, at: '2026-11-07T13:00:00+08:00' }], true, '510300.SH').dividers).toEqual([]);
});

it('UTC 时间输入仍按市场午休；平盘、单点和空值集合保持有限坐标', () => {
  const points = ['11:29', '11:30', '13:00', '13:01'].map((clock) => {
    const value = point(clock, 4);
    return { ...value, at: new Date(value.at).toISOString() };
  });
  const result = watchlistTrendGeometry(points, true, '510300.SH');
  expect(result.dividers).toHaveLength(1);
  expect(result.paths.join()).not.toMatch(/NaN|Infinity/);
  expect(result.paths.flatMap(coordinates).every(({ y }) => y === 22)).toBe(true);
  expect(watchlistTrendGeometry([], true, '510300.SH')).toEqual({ paths: [], dividers: [] });
  expect(watchlistTrendGeometry(points.slice(0, 1), true, '510300.SH')).toEqual({ paths: [], dividers: [] });
});

it('缺少日历或半日市不存在下午时段时不猜测午休', () => {
  const points = [point('11:30', 4), point('13:00', 4.1)];
  expect(projectGeometry(points, true).dividers).toEqual([]);
  expect(projectGeometry(points, true, sessions('02800.HK').slice(0, 1)).dividers).toEqual([]);
});
