import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { marketRouteCapabilityV3Schema } from '../src/market-route-v3.js';
import { statusQuerySupportV1Schema } from '../src/market-status-query-support-v1.js';
import { marketRouteCatalogV3Schema } from '../src/market-route-catalog-v3.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/market-status-capabilities-v1.shared.json', import.meta.url), 'utf8'));
for (const support of fixtures.querySupport) it(`接受共享来源参数资格 ${support.capability}/${JSON.stringify(support)}`, () => {
  expect(statusQuerySupportV1Schema.parse(support)).toEqual(support);
});
it.each([
  { capability: 'RISK_WARNING', detailKinds: ['coarseST'], riskCategories: ['delisting'] },
  { capability: 'RISK_WARNING', detailKinds: ['riskCategories'], riskCategories: [] },
  { capability: 'DAILY_PRICE_RULE', representations: ['rule', 'rule'] },
  { capability: 'SECURITY_BASIC_DATES', fields: ['ipoDate', 'ipoDate'] },
  { capability: 'LISTING_PHASE', phases: ['unknown'] },
  { capability: 'DAILY_TRADING_STATUS', granularity: 'day', maximumWindowDays: true },
])('拒绝来源参数资格歧义 %j', (support) => {
  expect(statusQuerySupportV1Schema.safeParse(support).success).toBe(false);
});
it('目录资格属于精确能力，旧目录保持原序列化', () => {
  const entry = { key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'SECURITY_BASIC_DATES' },
    target: { providerId: 'fixture', upstreamSource: 'fixture' }, state: 'ready' };
  expect(marketRouteCapabilityV3Schema.parse(entry)).toEqual(entry);
  expect(marketRouteCapabilityV3Schema.safeParse({ ...entry, querySupport: fixtures.querySupport[0] }).success).toBe(false);
  expect(marketRouteCapabilityV3Schema.safeParse({ ...entry, querySupport: fixtures.querySupport[4] }).success).toBe(true);
  const catalog = { contractVersion: 3, consumer: 'thesis-ledger', catalogRevision: 1,
    generatedAt: '2026-10-10T15:00:00Z', integrity: 'complete', entries: [entry] };
  expect(marketRouteCatalogV3Schema.parse(catalog)).toEqual(catalog);
  expect(marketRouteCatalogV3Schema.safeParse({ ...catalog, entries: [{ ...entry, querySupport: fixtures.querySupport[0] }] }).success).toBe(false);
  expect(marketRouteCatalogV3Schema.safeParse({ ...catalog, entries: [{ ...entry, querySupport: fixtures.querySupport[4] }] }).success).toBe(true);
});
