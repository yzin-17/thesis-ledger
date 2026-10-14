import { expect, it } from 'vitest';
import { correlateMarketCacheContextV3, marketCacheContextRequestV3Schema } from '../src/market-cache-context-v3.js';

const request = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'cache-context',
  capability: 'REALTIME_QUOTE', symbol: '510300.SH', assetType: 'ETF' } as const;
const response = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'cache-context',
  capability: 'REALTIME_QUOTE', symbol: '510300.SH', routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'REALTIME_QUOTE' },
  policyRevision: 1, generation: 'a'.repeat(64), ready: true, reason: null };
it('控制投影响应绑定身份、能力和资产类型', () => {
  expect(correlateMarketCacheContextV3(request, response)).toEqual(response);
  expect(() => correlateMarketCacheContextV3(request, { ...response, requestId: 'other' })).toThrow();
  expect(() => correlateMarketCacheContextV3(request, { ...response, routeKey: { ...response.routeKey, assetType: 'STOCK' } })).toThrow();
});
it('非报价不接收报价参数或供应商任意字段', () => {
  expect(marketCacheContextRequestV3Schema.safeParse({ ...request, capability: 'FUND_NAV' }).success).toBe(false);
  expect(marketCacheContextRequestV3Schema.safeParse({ ...request, sdk_method: 'arbitrary' }).success).toBe(false);
});
it('不可用原因不能与可用状态冲突', () => {
  expect(() => correlateMarketCacheContextV3(request, { ...response, ready: false })).toThrow();
  expect(() => correlateMarketCacheContextV3(request, { ...response, reason: 'disabled' })).toThrow();
});
