import { describe, expect, it, vi } from 'vitest';
import { MarketQuoteReader } from '../../src/market/market-quote-reader.js';
import { quoteControlFixture } from './quote-control-fixture.js';

const quote = {
  version: 3,
  symbol: '510300.SH',
  open: 4.1,
  high: 4.3,
  low: 4,
  price: 4.2,
  previousClose: 4.15,
  volume: null,
  amount: null,
  marketTime: '2026-09-30T08:14:43+00:00',
  fetchedAt: '2026-10-06T08:12:29+00:00',
  provider: 'hithink',
  upstreamSource: 'fund-market-snapshot',
  freshness: 'stale',
  stale: true,
  units: { priceCurrency: 'CNY', volume: 'unknown', turnoverCurrency: 'unknown' },
};

function harness(value: unknown = quote) {
  const cache = new Map<string, string>();
  const dsa = { marketCacheContextV3: vi.fn(quoteControlFixture), get: vi.fn().mockResolvedValue(value) };
  const client = {
    get: async (key: string) => cache.get(key) ?? null,
    set: async () => 'OK',
    eval: async () => 1,
    multi: () => {
      const writes: Array<[string, string]> = [];
      const chain = {
        set: (key: string, payload: string) => {
          writes.push([key, payload]);
          return chain;
        },
        exec: async () => {
          for (const [key, payload] of writes) cache.set(key, payload);
        },
      };
      return chain;
    },
  };
  return { reader: new MarketQuoteReader(dsa as never, { client } as never), cache, dsa };
}

describe('基础 Quote 量额降级的读取与缓存', () => {
  it('上游与缓存均保留量额 null、来源和原行情时间', async () => {
    const { reader, dsa } = harness();
    expect(await reader.getQuote('510300.SH')).toEqual({ ...quote, servedFromCache: false });
    expect(await reader.getQuote('510300.SH')).toEqual({ ...quote, servedFromCache: true });
    expect(dsa.get).toHaveBeenCalledTimes(1);
  });

  it('上游失败时 last-valid 保留缺失字段且仍标陈旧', async () => {
    const { reader, dsa, cache } = harness();
    await reader.getQuote('510300.SH');
    for (const key of cache.keys()) if (key.endsWith(':fresh')) cache.delete(key);
    dsa.get.mockRejectedValueOnce(new Error('upstream unavailable'));
    expect(await reader.getQuote('510300.SH', { refresh: true })).toEqual({
      ...quote,
      servedFromCache: true,
    });
  });

  it.each([{ symbol: '159516.SZ' }, { price: Number.NaN }, { high: 3 }])(
    '仍拒绝错误身份或价格 %s',
    async (invalid) => {
      const { reader, cache } = harness({ ...quote, ...invalid });
      await expect(reader.getQuote('510300.SH')).rejects.toMatchObject({ code: 'unavailable' });
      expect(cache.size).toBe(0);
    },
  );
});
