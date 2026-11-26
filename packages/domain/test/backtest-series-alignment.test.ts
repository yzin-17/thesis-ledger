import { expect, it } from 'vitest';
import { alignSeriesAt, type BacktestSeries } from '../src/backtest-series.js';

const point = (minute: number, visible: number, value = String(minute)) => ({
  occurredAt: new Date(Date.UTC(2026, 6, 1, 1, minute)).toISOString(),
  availableAt: new Date(Date.UTC(2026, 6, 1, 1, visible)).toISOString(),
  value,
});
it('冻结对齐保留事件顺序、同刻观察次序和可见性；可变输入不缓存旧顺序', () => {
  const points = [point(33, 35), point(31, 31), point(32, 34), point(31, 32, '同刻较晚观察')];
  const series: BacktestSeries = {
    sourceId: 's',
    symbol: 'AAPL.US',
    market: 'US',
    assetType: 'stock',
    field: 'close',
    timeframe: '1m',
    adjusted: false,
    points,
  };
  const times = [30, 31, 32, 33, 34, 35].map((m) => point(m, m).occurredAt);
  const baseline = times.map((at) =>
    [...points]
      .sort(
        (a, b) =>
          Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
          Date.parse(a.availableAt) - Date.parse(b.availableAt),
      )
      .filter((p) => p.occurredAt <= at && p.availableAt <= at)
      .at(-1),
  );
  expect(alignSeriesAt(series, times).map((p) => p.point)).toEqual(baseline);
  points.push(point(34, 34, '新增'));
  expect(alignSeriesAt(series, times).at(-1)?.point?.value).toBe('新增');
  points.forEach(Object.freeze);
  Object.freeze(points);
  expect(alignSeriesAt(series, times)).toEqual(alignSeriesAt(series, times));
  expect(alignSeriesAt(series, times)[2]?.point?.value).toBe('同刻较晚观察');
});
