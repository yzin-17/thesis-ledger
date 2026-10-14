import { expect, it } from 'vitest';
import { marketRouteCatalogReadClientV3Schema } from '../src/market-client-projections.js';

const entry = { key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'RISK_WARNING' },
  target: { providerId: 'state', upstreamSource: 'state' }, state: 'ready',
  querySupport: { capability: 'RISK_WARNING', detailKinds: ['coarseST'], riskCategories: [] } };
const complete = { contractVersion: 3, consumer: 'thesis-ledger', status: 'complete',
  catalogRevision: 1, generatedAt: '2026-10-11T00:00:00Z', reason: null, entries: [entry] };
it('精确候选及能力专有参数范围保留，条目额外字段/错绑拒绝', () => {
  expect(marketRouteCatalogReadClientV3Schema.parse(complete).entries).toEqual([entry]);
  for (const bad of [{ ...entry, arbitrarySdk: 'method' },
    { ...entry, querySupport: { capability: 'SECURITY_BASIC_DATES', fields: ['ipoDate'] } }])
    expect(marketRouteCatalogReadClientV3Schema.safeParse({ ...complete, entries: [bad] }).success).toBe(false);
});
it.each(['partial', 'unavailable'])('%s 不发布候选并须有匹配原因', (status) => {
  const reason = status === 'partial' ? 'catalog_partial' : 'control_timeout';
  expect(marketRouteCatalogReadClientV3Schema.safeParse({ ...complete, status, entries: [], reason }).success).toBe(true);
  expect(marketRouteCatalogReadClientV3Schema.safeParse({ ...complete, status, reason }).success).toBe(false);
  expect(marketRouteCatalogReadClientV3Schema.safeParse({ ...complete, status, entries: [], reason: null }).success).toBe(false);
});
it('身份、修订和完整目录原因分别校验', () => {
  for (const patch of [{ consumer: 'other' }, { catalogRevision: 0 }, { catalogRevision: 1.5 },
    { generatedAt: 123 }, { reason: 'unknown' }, { reason: 'control_timeout' }])
    expect(marketRouteCatalogReadClientV3Schema.safeParse({ ...complete, ...patch }).success).toBe(false);
});
