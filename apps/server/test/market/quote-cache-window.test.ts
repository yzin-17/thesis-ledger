import { expect, it, vi } from 'vitest';
import {
  reserveQuoteWindow,
  observeQuoteTime,
  quoteRefreshFailure,
} from '../../src/market/market-quote-cache-policy.js';
import type { Quote } from '@thesis-ledger/schemas';
it('ETF 成功或失败均占用冷却窗口，重复刷新不触发第二次来源请求', async () => {
  const set = vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
  await reserveQuoteWindow({ set }, 'generation-key', 'ETF');
  await expect(reserveQuoteWindow({ set }, 'generation-key', 'ETF')).rejects.toMatchObject({
    sourceReason: 'request_budget_cooldown',
  });
  expect(set).toHaveBeenCalledWith('generation-key:request-window', 'reserved', 'PX', 600000, 'NX');
  await reserveQuoteWindow({ set }, 'stock', 'STOCK');
  expect(set).toHaveBeenCalledTimes(2);
});
it('缓存不会冻结新鲜度，失败分类不靠中文错误文字', () => {
  const q = { marketTime: '2026-11-06T07:00:00Z', stale: false, freshness: 'live' } as Quote;
  expect(observeQuoteTime(q, Date.parse('2026-11-06T07:11:00Z'))).toMatchObject({
    stale: true,
    freshness: 'stale',
  });
  expect(q.stale).toBe(false);
  expect(quoteRefreshFailure('request_budget_cooldown')).toBe('budget_cooldown');
  expect(quoteRefreshFailure('upstream_unavailable')).toBe('fetch_failed');
});
it('无旧值的请求失败后第二次读取也不会再次访问 DSA', async () => {
  const { MarketQuoteReader } = await import('../../src/market/market-quote-reader.js');
  const { quoteControlFixture } = await import('./quote-control-fixture.js');
  const values = new Map<string, string>();
  const client = {
    get: vi.fn(async (k: string) => values.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      if (values.has(k)) return null;
      values.set(k, v);
      return 'OK';
    }),
    eval: vi.fn(async (_s: string, _n: number, k: string) => {
      values.delete(k);
      return 1;
    }),
  };
  const dsa = {
    marketCacheContextV3: vi.fn(quoteControlFixture),
    get: vi.fn().mockRejectedValue(new Error('controlled timeout')),
  };
  const reader = new MarketQuoteReader(dsa as never, { client } as never);
  await expect(reader.getQuote('510300.SH', { assetType: 'ETF', refresh: true })).rejects.toThrow();
  await expect(reader.getQuote('510300.SH', { assetType: 'ETF', refresh: true })).rejects.toThrow();
  expect(dsa.get).toHaveBeenCalledTimes(1);
});

it('无缓存时仍返回独立冷却码，批量合同不丢失原因',async()=>{
 const {quoteBatchFailure}=await import('../../src/market/market-quote-batch.js');
 const {DsaError}=await import('../../src/integration/dsa/dsa.client.js');
 expect(quoteBatchFailure(new DsaError('controlled','unavailable',undefined,'request_budget_cooldown'))).toEqual({code:'request_budget_cooldown'});
});
