import { describe, expect, it, vi } from 'vitest';
import { MarketQuoteReader } from '../../src/market/market-quote-reader.js';
import { quoteControlFixture } from './quote-control-fixture.js';

function harness() {
  const quote = { version: 3, symbol: 'SPY.US', open: 10, high: 12, low: 9,
    price: 11, previousClose: 10, volume: 0, amount: null, stale: false,
    provider: 'futu', upstreamSource: 'futu', marketTime: null,
    fetchedAt: '2026-10-08T00:00:00Z', freshness: 'unknown' };
  const dsa = { marketCacheContextV3: vi.fn(quoteControlFixture), get: vi.fn(async (url: string) => ({ ...quote, price: url.includes('assetType=ETF') ? 12 : 11 })) };
  const cache = new Map<string, string>();
  const client = {
    get: async (key: string) => cache.get(key) ?? null,
    set: async () => 'OK', eval: async () => 1,
    multi: () => {
      const writes: Array<[string, string]> = [];
      const chain = { set: (key: string, value: string) => { writes.push([key, value]); return chain; },
        exec: async () => { for (const [key, value] of writes) cache.set(key, value); } };
      return chain;
    },
  };
  return { reader: new MarketQuoteReader(dsa as never, { client } as never), dsa, cache };
}

describe('报价资产身份传递和缓存边界', () => {
  it('显式 ETF 和 STOCK 不共享请求、缓存或并发结果', async () => {
    const { reader, dsa, cache } = harness();
    const [etf, stock] = await Promise.all([
      reader.getQuote('SPY.US', { assetType: 'ETF' }), reader.getQuote('SPY.US', { assetType: 'STOCK' }),
    ]);
    expect(etf.price).toBe(12); expect(stock.price).toBe(11);
    expect(dsa.get).toHaveBeenCalledWith('/api/v3/thesis-ledger/market/quote?symbol=SPY.US&assetType=ETF', 1);
    expect(dsa.get).toHaveBeenCalledWith('/api/v3/thesis-ledger/market/quote?symbol=SPY.US&assetType=STOCK', 1);
    expect([...cache.keys()].filter((key) => key.endsWith(':fresh'))).toHaveLength(2);
    expect((await reader.getQuote('SPY.US', { assetType: 'ETF' })).price).toBe(12);
    expect((await reader.getQuote('SPY.US', { assetType: 'STOCK' })).price).toBe(11);
    expect(dsa.get).toHaveBeenCalledTimes(2);
  });

  it('无参数旧请求保持 URL 兼容，并与显式类型结果隔离', async () => {
    const { reader, dsa } = harness();
    await reader.getQuote('SPY.US');
    await reader.getQuote('SPY.US', { assetType: 'ETF' });
    expect(dsa.get).toHaveBeenCalledWith('/api/v3/thesis-ledger/market/quote?symbol=SPY.US', 1);
    expect(dsa.get).toHaveBeenCalledTimes(2);
  });
});
