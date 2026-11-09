import { describe, expect, it } from 'vitest';
import { arenaPointSchema } from '@thesis-ledger/schemas';
import type { MarketChartBar } from '../market-detail/market-chart-types.js';
import { arenaChartWindow, placeArenaPricePoints } from './arena-price-points.js';
const point = (day: string, symbol = '600036.SH') => arenaPointSchema.parse({
  id: '00000000-0000-4000-8000-000000000001', arenaId: '00000000-0000-4000-8000-000000000002',
  roundId: '00000000-0000-4000-8000-000000000003', entrantId: '00000000-0000-4000-8000-000000000004',
  model: '验证模型', symbol, day, executedAt: day + 'T07:00:00Z', side: 'buy', price: '10.123456789', quantity: '100.000001',
});
const bar = (day: string, timeframe: NonNullable<MarketChartBar['timeframe']>): MarketChartBar => ({ symbol: '600036.SH', timestamp: day + 'T07:00:00Z',
  timeframe, open: 10, high: 11, low: 9, close: 10, volume: 100, amount: 1000 });
const offset = (day: string, days: number) => new Date(Date.parse(day) + days * 86400000).toISOString().slice(0, 10);
describe('模型模拟事实到行情桶的坐标映射', () => {
  it.each([
    ['1w', '2026-11-02', '2026-11-04', '2026-11-06'],
    ['1mo', '2026-10-01', '2026-10-15', '2026-10-30'],
    ['1y', '2025-01-02', '2025-06-18', '2025-12-31'],
    ['5d', '2026-10-30', '2026-11-02', '2026-11-05'],
  ] as const)('%s 读取完整桶并映射首日、中间日和末日，保留事实原值', (timeframe, start, middle, end) => {
    const bars = [{ ...bar(end, timeframe), bucketStartDate: start, bucketEndDate: end }];
    const points = [point(start), point(middle), point(end), point(offset(start, -1)), point(offset(end, 1)), point(middle, '510300.SH')];
    const before = structuredClone(points);
    expect(arenaChartWindow(bars)).toEqual({ symbol: '600036.SH', start, end });
    expect(placeArenaPricePoints(bars, points)).toEqual(points.slice(0, 3).map((item) => ({ ...item, key: end })));
    expect(points).toEqual(before);
  });
  it('日线只附着到确有行情的交易日，不把缺失日期挪到相邻 K 线', () => {
    const bars = [bar('2026-11-02', '1d'), bar('2026-11-04', '1d')];
    expect(placeArenaPricePoints(bars, [point('2026-11-02'), point('2026-11-03')])).toEqual([{ ...point('2026-11-02'), key: '2026-11-02' }]);
  });
  it('分钟及空行情不提供日级模型点位坐标', () => {
    expect(arenaChartWindow([])).toBeNull();
    expect(arenaChartWindow([bar('2026-11-02', '1m')])).toBeNull();
    expect(placeArenaPricePoints([bar('2026-11-02', '5m')], [point('2026-11-02')])).toEqual([]);
  });
});
