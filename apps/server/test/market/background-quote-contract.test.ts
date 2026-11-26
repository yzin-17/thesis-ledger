import { expect, it, vi } from 'vitest';
import { readBackgroundQuote } from '../../src/market/market-background-quote-contract.js';
import type { BackgroundQuotePlan } from '@thesis-ledger/schemas';
import { MarketQuoteReader } from '../../src/market/market-quote-reader.js';
const plan = {
  contractVersion: 1,
  consumer: 'thesis-ledger',
  requestId: 'source-test',
  symbol: '510300.SH',
  assetType: 'ETF',
  generation: 'a'.repeat(64),
  policyRevision: 1,
  acquisition: 'public-snapshot',
  reason: null,
  target: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 1 },
  minIntervalSeconds: 600,
  sourceUpdateIntervalSeconds: null,
} as BackgroundQuotePlan;
it('rejects a mismatched symbol or asset before control, budget or data requests', async () => {
  const marketCacheContextV3 = vi.fn();
  const post = vi.fn();
  const reader = new MarketQuoteReader({ marketCacheContextV3, post } as never, {} as never);
  await expect(
    reader.getQuote('510500.SH', { assetType: 'ETF', background: plan }),
  ).rejects.toThrow('身份不匹配');
  await expect(
    reader.getQuote(plan.symbol, { assetType: 'STOCK', background: plan }),
  ).rejects.toThrow('身份不匹配');
  expect(marketCacheContextV3).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});
it('uses one Data POST pinned to generation; response target and provider must match', async () => {
  const post = vi.fn(async (_path, request) => ({
    ...plan,
    ...request,
    quote: { provider: 'tencent', price: 4 },
  }));
  expect(await readBackgroundQuote({ post } as never, plan)).toEqual({
    provider: 'tencent',
    price: 4,
  });
  expect(post.mock.calls[0]?.[0]).toBe('/api/v1/thesis-ledger/market/background-quote');
  expect(post.mock.calls[0]?.[1]).toMatchObject({ generation: plan.generation });
  post.mockImplementationOnce(async (_path, request) => ({
    ...plan,
    ...request,
    target: { ...plan.target!, routeIndex: 0 },
    quote: { provider: 'tencent', price: 4 },
  }));
  await expect(readBackgroundQuote({ post } as never, plan)).rejects.toThrow('控制已变化');
  post.mockImplementationOnce(async (_path, request) => ({
    ...plan,
    ...request,
    quote: { provider: 'hithink', price: 4 },
  }));
  await expect(readBackgroundQuote({ post } as never, plan)).rejects.toThrow('来源不匹配');
});
