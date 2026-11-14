import { expect, it } from 'vitest';
import {
  correlateMarketCacheContextV3, marketCacheContextRequestV3Schema,
} from '../src/market-cache-context-v3.js';

const request = {
  contractVersion: 3, consumer: 'thesis-ledger', requestId: 'bar-control',
  purpose: 'interactive-chart', capability: 'MINUTE_BAR', symbol: 'AAPL.US',
  routeKey: { kind: 'bar', market: 'US', assetType: 'STOCK', capability: 'MINUTE_BAR', timeframe: '1m', adjustment: 'none' },
  routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
  start: '2026-11-11', end: '2026-11-11',
} as const;
const response = { ...request, generation: 'a'.repeat(64), policyRevision: 1, ready: true, reason: null };

it('精确K线控制契约可复用现有入口且保留完整关联', () => {
  const parsed = marketCacheContextRequestV3Schema.parse(request);
  expect(correlateMarketCacheContextV3(parsed, response)).toEqual(response);
});

it.each([
  { capability: 'DAILY_BAR' }, { purpose: 'point-in-time' }, { symbol: 'aapl.us' },
  { start: '2026-11-12' }, { start: '2026-02-30' }, { tradabilityMode: 'assume-untradable-no-bar' },
  { routeKey: { ...request.routeKey, timeframe: '1d' } },
  { routeKey: { ...request.routeKey, market: 'HK' } },
  { routeTarget: { ...request.routeTarget, routeIndex: 2 } },
  { sdk_method: 'arbitrary' },
])('非法或越界的缓存控制请求被拒绝：%j', (change) => {
  expect(marketCacheContextRequestV3Schema.safeParse({ ...request, ...change }).success).toBe(false);
});

it.each([
  { requestId: 'other' }, { symbol: 'MSFT.US' }, { start: '2026-11-10' }, { end: '2026-11-12' },
  { routeKey: { ...request.routeKey, timeframe: '5m' } },
  { routeTarget: { ...request.routeTarget, providerId: 'yfinance' } },
  { routeTarget: { ...request.routeTarget, upstreamSource: 'other' } },
  { routeTarget: { ...request.routeTarget, routeIndex: 1 } },
  { ready: false }, { reason: 'disabled' },
])('缓存控制响应不能混用请求、来源和状态：%j', (change) => {
  const parsed = marketCacheContextRequestV3Schema.parse(request);
  expect(() => correlateMarketCacheContextV3(parsed, { ...response, ...change })).toThrow();
});
