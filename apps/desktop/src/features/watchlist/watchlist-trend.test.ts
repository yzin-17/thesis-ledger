import { expect, it } from 'vitest';
import type { MarketDisplayDetailResponse } from '@thesis-ledger/api-client';
import { watchlistTrend } from './watchlist-trend.js';
import { watchlistTrendGeometry } from './watchlist-trend-geometry.js';
it('日线保留最近20个交易日的真实开高低收，不改变原始数据', () => {
  const bars = Array.from({ length: 25 }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
    open: index + 1,
    high: index + 3,
    low: index + 0.5,
    close: index + 2,
  }));
  const original = structuredClone(bars);
  const result = watchlistTrend(
    {
      sections: { bars: { status: 'ready' } },
      barSeries: { provenance: { providerId: 'fixture' }, points: bars },
    } as unknown as MarketDisplayDetailResponse,
    false,
    false,
  );
  expect(result.label).toBe('日线 · 前复权');
  expect(result.candles).toHaveLength(20);
  expect(result.candles?.[0]).toEqual({
    at: bars[5]!.timestamp,
    open: 6,
    high: 8,
    low: 5.5,
    close: 7,
  });
  expect(result.cutoff).toBe(bars[24]!.timestamp);
  expect(bars).toEqual(original);
});
it('分钟图只取市场当地最近交易日；缺分钟断线，平盘不除零', () => {
  const detail = {
    symbol: 'SPY.US',
    sections: { bars: { status: 'ready' } },
    barSeries: {
      provenance: { providerId: 'fixture' },
      points: [
        { timestamp: '2026-11-05T20:59:00Z', close: 3 },
        { timestamp: '2026-11-06T14:31:00Z', close: 4 },
        { timestamp: '2026-11-06T14:32:00Z', close: 4 },
        { timestamp: '2026-11-06T14:35:00Z', close: 4 },
        { timestamp: '2026-11-06T14:36:00Z', close: 4 },
      ],
    },
  } as unknown as MarketDisplayDetailResponse;
  const result = watchlistTrend(detail, false, true);
  expect(result.points).toHaveLength(4);
  expect(result.cutoff).toBe('2026-11-06T14:36:00Z');
  expect(watchlistTrendGeometry(result.points, true).paths).toHaveLength(2);
  expect(watchlistTrendGeometry(result.points, true).paths.join()).not.toMatch(/NaN|Infinity/);
});
it('不可用不伪造曲线；净值按来源日期，缓存状态独立保留', () => {
  expect(
    watchlistTrend({ sections: {} } as MarketDisplayDetailResponse, false, true).points,
  ).toEqual([]);
  const result = watchlistTrend(
    {
      sections: {
        'fund-nav-history': {
          status: 'stale',
          data: [
            { unitNav: 1.02, navDate: '2026-11-04' },
            { unitNav: 1.03, navDate: '2026-11-05' },
          ],
        },
      },
    } as unknown as MarketDisplayDetailResponse,
    true,
    false,
  );
  expect(result.cutoff).toBe('2026-11-05');
  expect(result.label).toBe('近20期净值');
  expect(result.notice).toContain('缓存');
});
