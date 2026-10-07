import { describe, expect, it } from 'vitest';
import {
  marketEventExchangeV3Schema,
  marketEventResponseV3Schema,
} from '../src/market-event-wire-v3.js';

const request = {
  contractVersion: 3,
  requestId: 'events-1',
  symbol: '510300.SH',
  routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
  routeTarget: { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 },
  desiredRevision: 2,
  effectivePolicyRevision: 2,
  catalogRevision: 3,
  start: '2025-06-01',
  end: '2025-06-30',
  dataAsOf: '2026-09-27T01:00:00Z',
};
const fact = {
  symbol: '510300.SH',
  market: 'CN',
  instrumentType: 'ETF',
  type: 'CASH_DIVIDEND',
  cashAmount: '0.088',
  currency: 'CNY',
  effectiveDate: '2025-06-18',
  recordDate: '2025-06-17',
  paymentDate: '2025-06-27',
  occurredAt: '2025-06-18T00:00:00+08:00',
  availableAt: '2026-09-27T00:00:00Z',
  provider: 'akshare',
  providerRevision: 'source-v1',
};
const response = {
  ...request,
  fetchedAt: '2026-09-27T00:00:00Z',
  providerRevision: 'source-v1',
  facts: [fact],
  coverage: { complete: false, reason: 'historical_coverage_unverified' },
};
const admission = {
  consumer: 'thesis-ledger', routeKey: request.routeKey,
  target: { providerId: 'akshare', upstreamSource: 'eastmoney' },
  status: 'admitted', admissionState: 'admitted', evidenceRef: 'review-1', evidenceSha256: 'a'.repeat(64),
  scopeSymbols: [request.symbol], scopeDateFrom: request.start, scopeDateTo: request.end,
  adapterRevision: 'adapter-1', sourceRevision: 'source-1', credentialRevision: 'not-required',
  validFrom: '2026-09-01T00:00:00Z', validUntil: '2026-10-01T00:00:00Z',
  recordVersion: 1, recordedAt: '2026-09-01T00:00:00Z', invalidatedAt: null, invalidationReason: null,
};

describe('事件 V3 精确传输', () => {
  it('完整覆盖绑定精确准入快照，按原读取时间离线复核', () => {
    expect(marketEventResponseV3Schema.safeParse({
      ...response, admission, coverage: { complete: true, admissionEvidenceRef: 'review-1' },
    }).success).toBe(true);
    expect(marketEventResponseV3Schema.safeParse({
      ...response, coverage: { complete: true, admissionEvidenceRef: 'review-1' },
    }).success).toBe(false);
    expect(marketEventResponseV3Schema.safeParse({
      ...response, admission, coverage: { complete: true, admissionEvidenceRef: 'other' },
    }).success).toBe(false);
  });

  it.each([
    { scopeSymbols: ['159516.SZ'] },
    { scopeDateFrom: '2025-06-02' },
    { scopeDateTo: '2025-06-29' },
    { target: { providerId: 'other', upstreamSource: 'eastmoney' } },
    { routeKey: { ...request.routeKey, capability: 'SPLIT_EVENT' } },
    { validUntil: response.fetchedAt },
    { validFrom: '2026-09-28T00:00:00Z' },
    { recordedAt: '2026-09-28T00:00:00Z' },
    { invalidatedAt: '2026-09-20T00:00:00Z' },
    { evidenceSha256: 'not-a-digest' },
    { admissionState: 'revoked' },
  ])('拒绝准入范围、来源、有效期或撤销错误 %#', (patch) => {
    expect(marketEventResponseV3Schema.safeParse({
      ...response, admission: { ...admission, ...patch },
      coverage: { complete: true, admissionEvidenceRef: 'review-1' },
    }).success).toBe(false);
  });

  it('允许明确不完整观测并保留独立源日期', () => {
    const result = marketEventExchangeV3Schema.parse({ request, response });
    expect(result.response.coverage.complete).toBe(false);
    expect(result.response.facts[0]?.paymentDate).toBe('2025-06-27');
    expect(result.response.facts[0]?.strategyVisibility).toBeUndefined();
  });

  it('完整覆盖必须显式绑定准入引用，空集不自动变完整', () => {
    expect(
      marketEventResponseV3Schema.safeParse({
        ...response,
        facts: [],
        coverage: { complete: true },
      }).success,
    ).toBe(false);
    expect(marketEventResponseV3Schema.parse({ ...response, facts: [] }).coverage.complete).toBe(
      false,
    );
  });

  it.each([
    { requestId: 'other' },
    { symbol: '159516.SZ', facts: [] },
    { start: '2025-06-02' },
    { desiredRevision: 4, effectivePolicyRevision: 4 },
    { catalogRevision: 4 },
    { routeTarget: { ...request.routeTarget, routeIndex: 1 } },
    { routeTarget: { ...request.routeTarget, upstreamSource: 'different' } },
    { routeKey: { ...request.routeKey, capability: 'SPLIT_EVENT' }, facts: [] },
  ])('拒绝串请求、来源、能力或版本 %#', (patch) => {
    expect(
      marketEventExchangeV3Schema.safeParse({ request, response: { ...response, ...patch } })
        .success,
    ).toBe(false);
  });

  it.each([
    { effectiveDate: undefined },
    { effectiveDate: '2025-07-01' },
    { symbol: '159516.SZ' },
    { provider: 'other' },
    { providerRevision: 'other' },
    { availableAt: '2026-09-28T00:00:00Z' },
  ])('拒绝事实范围与观测时点错误 %#', (patch) => {
    expect(
      marketEventResponseV3Schema.safeParse({ ...response, facts: [{ ...fact, ...patch }] })
        .success,
    ).toBe(false);
  });

  it('拒绝重复或冲突事件', () => {
    expect(
      marketEventResponseV3Schema.safeParse({ ...response, facts: [fact, fact] }).success,
    ).toBe(false);
  });
});
