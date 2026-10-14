import { expect, it } from 'vitest';
import { securityStaticInfoResponseSchema, securityStaticInfoRequestSchema } from '../src/index.js';

export const staticInfoFixture = {
  contractVersion: 3, consumer: 'thesis-ledger', requestId: 'static-test', symbol: '00700.HK', assetType: 'STOCK',
  market: 'HK', name: '腾讯控股', securityId: '9007199254740993', sharesPerLot: '100', listingDate: '2004-06-16',
  delisted: false, exchange: 'HK_MAIN', provider: 'futu', historicalChanges: 'unverified',
  observedAt: '2026-10-09T01:00:00Z', fetchedAt: '2026-10-09T01:01:00Z', policyRevision: 1,
  routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
};

it('保存超出安全整数范围的字符串 ID 和未知字段', () => {
  expect(securityStaticInfoResponseSchema.parse(staticInfoFixture).securityId).toBe('9007199254740993');
  expect(securityStaticInfoResponseSchema.safeParse({ ...staticInfoFixture, name: null, securityId: null,
    sharesPerLot: null, listingDate: null, delisted: null, exchange: null }).success).toBe(true);
});
it.each([
  { market: 'US' }, { securityId: Number('9007199254740993') }, { delisted: 'false' }, { listingDate: '2004-02-30' },
  { sharesPerLot: '0' }, { observedAt: '2026-10-10T00:00:00Z' },
  { routeTarget: { providerId: 'futu', upstreamSource: 'yfinance', routeIndex: 0 } },
])('拒绝不一致资料 %j', change => {
  expect(securityStaticInfoResponseSchema.safeParse({ ...staticInfoFixture, ...change }).success).toBe(false);
});
it('禁止历史参数和不支持的证券类型', () => {
  const request = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'r', symbol: 'SPY.US', assetType: 'ETF' };
  expect(securityStaticInfoRequestSchema.safeParse(request).success).toBe(true);
  expect(securityStaticInfoRequestSchema.safeParse({ ...request, asOf: '2020-01-01' }).success).toBe(false);
  expect(securityStaticInfoRequestSchema.safeParse({ ...request, assetType: 'OPTION' }).success).toBe(false);
});
