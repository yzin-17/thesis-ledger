import { expect, it, vi } from 'vitest';
import { MarketQuoteReader } from '../../src/market/market-quote-reader.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';

const quote = { version: 3, symbol: '600519.SH', open: 10, high: 11, low: 9, price: 10,
  previousClose: 10, volume: 1, amount: 10, marketTime: '2026-09-14T01:00:00Z',
  fetchedAt: '2026-09-14T01:00:01Z', freshness: 'live', stale: false, provider: 'fixture' };
function harness() {
  const state = { generation: 'a'.repeat(64), ready: true };
  const cache = new Map<string, string>();
  const dsa = {
    marketCacheContextV3: vi.fn(async (request) => ({ ...request,
      routeKey: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'REALTIME_QUOTE' },
      policyRevision: 1, generation: state.generation, ready: state.ready, reason: state.ready ? null : 'disabled' })),
    get: vi.fn(async () => quote),
  };
  const client = { get: vi.fn(async (key: string) => cache.get(key) ?? null),
    set: vi.fn(async () => 'OK'), eval: vi.fn(async () => 1),
    multi: () => {
      const writes: [string, string][] = [];
      const chain = { set: (key: string, value: string) => { writes.push([key, value]); return chain; },
        exec: async () => { for (const [key, value] of writes) cache.set(key, value); } };
      return chain;
    } };
  return { state, dsa, cache, client, reader: new MarketQuoteReader(dsa as never, { client } as never) };
}

it('fresh命中仍检查控制，关闭后零数据请求且不返回旧缓存', async () => {
  const h = harness();
  await h.reader.getQuote('600519.SH');
  expect((await h.reader.getQuote('600519.SH')).servedFromCache).toBe(true);
  expect(h.dsa.get).toHaveBeenCalledTimes(1);
  h.state.ready = false;
  await expect(h.reader.getQuote('600519.SH')).rejects.toMatchObject({ code: 'control-rejected' });
  expect(h.dsa.get).toHaveBeenCalledTimes(1);
});
it('配置代次变更不能用旧fresh或last-valid掩盖数据失败', async () => {
  const h = harness();
  await h.reader.getQuote('600519.SH');
  h.state.generation = 'b'.repeat(64);
  h.dsa.get.mockRejectedValue(new DsaError('数据不可用', 'unavailable'));
  await expect(h.reader.getQuote('600519.SH')).rejects.toMatchObject({ code: 'unavailable' });
  expect(h.dsa.get).toHaveBeenCalledTimes(2);
});
it('来源晚到时拒绝结果，旧代次不写入任何缓存', async () => {
  const h = harness();
  h.dsa.get.mockImplementation(async () => { h.state.generation = 'b'.repeat(64); return quote; });
  await expect(h.reader.getQuote('600519.SH')).rejects.toMatchObject({ code: 'stale-revision' });
  expect(h.cache.size).toBe(0);
  expect(h.dsa.get).toHaveBeenCalledTimes(1);
});
it('控制读取失败不能直接读旧缓存或调用来源', async () => {
  const h = harness();
  h.cache.set('thesis-ledger:cache:v1:quote:3:600519.SH:fresh', JSON.stringify(quote));
  h.dsa.marketCacheContextV3.mockRejectedValue(new Error('控制不可用'));
  await expect(h.reader.getQuote('600519.SH')).rejects.toThrow('控制不可用');
  expect(h.client.get).not.toHaveBeenCalled();
  expect(h.dsa.get).not.toHaveBeenCalled();
});
