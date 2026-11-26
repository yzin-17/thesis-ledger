import { expect, it } from 'vitest';
import { marketRouteAdmissionV3Schema, timedMarketRouteAdmissionV3Schema } from '../src/market-route-admission-v3.js';

const record = {
  consumer: 'thesis-ledger',
  routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'HISTORICAL_EXECUTION_CONTEXT' },
  target: { providerId: 'historical-execution-archive', upstreamSource: 'qualified-cn-execution' },
  status: 'admitted', admissionState: 'admitted', evidenceRef: 'sha256:' + 'a'.repeat(64),
  evidenceSha256: 'a'.repeat(64), scopeSymbols: ['588000.SH'],
  scopeDateFrom: '2026-11-10', scopeDateTo: '2026-11-10',
  adapterRevision: 'v4', sourceRevision: 'archive-v2:fixture', credentialRevision: 'not-required',
  validFrom: '2026-11-24T00:00:00Z', validUntil: null, recordVersion: 3,
  recordedAt: '2026-11-24T00:00:00Z', invalidatedAt: null, invalidationReason: null,
};

it('本地归档用空到期时间表达按版本有效，有限期消费者保持拒绝', () => {
  expect(marketRouteAdmissionV3Schema.parse(record).validUntil).toBeNull();
  expect(timedMarketRouteAdmissionV3Schema.safeParse(record).success).toBe(false);
  expect(timedMarketRouteAdmissionV3Schema.parse({ ...record, validUntil: '2026-11-25T00:00:00Z' }).validUntil)
    .toBe('2026-11-25T00:00:00Z');
});

it('空有效期不扩展到其他来源，证券与日期范围仍校验', () => {
  expect(marketRouteAdmissionV3Schema.safeParse({ ...record,
    target: { providerId: 'futu', upstreamSource: 'futu' } }).success).toBe(false);
  expect(marketRouteAdmissionV3Schema.safeParse({ ...record, scopeDateFrom: '2026-11-11' }).success).toBe(false);
  expect(marketRouteAdmissionV3Schema.safeParse({ ...record, scopeSymbols: ['588000.SH', '588000.SH'] }).success).toBe(false);
});
