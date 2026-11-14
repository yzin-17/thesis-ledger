import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketChartBarsRequestV3 } from '@thesis-ledger/schemas';
import { request, setup } from './market-chart-result-cache.fixture.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function identity(market: 'CN' | 'HK' | 'US', asset: 'STOCK' | 'ETF') {
  const symbols = { CN: { STOCK: '600519.SH', ETF: '510300.SH' }, HK: { STOCK: '00700.HK', ETF: '02800.HK' },
    US: { STOCK: 'AAPL.US', ETF: 'SPY.US' } };
  vi.setSystemTime(new Date(market === 'US' ? '2026-11-11T15:35:10Z' : '2026-11-11T02:35:10Z'));
  return { ...request, symbol: symbols[market][asset], routeKey: { ...request.routeKey, market, assetType: asset } };
}

describe('既有交互口径60秒短复用', () => {
  for (const market of ['CN', 'HK', 'US'] as const) for (const asset of ['STOCK', 'ETF'] as const) {
    it.each(['1m', '5m', '15m', '30m', '60m'] as const)(`${market} ${asset} %s保留周期、观察时点及刷新边界`, async timeframe => {
      const env = setup();
      const input: MarketChartBarsRequestV3 = { ...identity(market, asset),
        routeKey: { ...request.routeKey, market, assetType: asset, timeframe } };
      const first = await env.read(input);
      const hit = await env.read({ ...input, requestId: 'hit' });
      expect(hit.cached).toBe(true);
      expect(hit.response.sourcePriceBasis).toEqual(first.response.sourcePriceBasis);
      expect(env.sessions.read).toHaveBeenCalledWith(market);
      expect((await env.read(input, { refresh: true })).cached).toBe(false);
      expect(env.load).toHaveBeenCalledTimes(2);
    });
    it.each(['none', 'qfq', 'hfq'] as const)(`${market} ${asset}日线%s与纯历史窗口不启用长缓存`, async adjustment => {
      const env = setup();
      const base = identity(market, asset);
      const input: MarketChartBarsRequestV3 = { ...base, start: '2026-09-14', end: '2026-09-14',
        routeKey: { ...base.routeKey, capability: 'DAILY_BAR', timeframe: '1d', adjustment } };
      const first = await env.read(input);
      expect((await env.read({ ...input, requestId: 'daily-hit' })).cached).toBe(true);
      expect(first.response.sourcePriceBasis.adjustment).toBe(adjustment);
      expect(first.response.bars[0]?.completionStatus).toBe('unknown');
      await vi.advanceTimersByTimeAsync(60_000);
      expect((await env.read(input)).cached).toBe(false);
      expect(env.load).toHaveBeenCalledTimes(2);
    });
  }

  it('控制允许的其他来源复用成功值但保持精确上游与主备隔离', async () => {
    const env = setup();
    const input = { ...identity('US', 'STOCK'), routeTarget: { providerId: 'yfinance', upstreamSource: 'yfinance', routeIndex: 0 as const } };
    await env.read(input);
    expect((await env.read(input)).cached).toBe(true);
    await env.read({ ...input, routeTarget: { ...input.routeTarget, routeIndex: 1 } });
    expect(env.load).toHaveBeenCalledTimes(2);
  });
});
