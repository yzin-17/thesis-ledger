import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { marketEventExchangeV3Schema } from '../src/market-event-wire-v3.js';
import { marketSplitAcquisitionV3Schema } from '../src/market-split-acquisition-v3.js';
import { marketEventAdmissionCatalogV3Schema } from '../src/market-event-admission-catalog-v3.js';

const original = readFileSync(new URL('../../../docs/tasks/evidence/2026-10-02-m22-159516-split-mapping.json', import.meta.url), 'utf8');
const digest = 'b1a4f03f94faf27acf95d2bef9d508ec06eabec1280e04c921bb677154f5fe8e';

function fixture() {
  const intent = {
    contractVersion: 3 as const, requestId: 'ed92afdb-5f4b-4d6c-8f95-d8acf8dc08cf',
    routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'SPLIT_EVENT' } as const,
    routeTarget: { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 },
    symbol: '159516.SZ', start: '2026-03-30', end: '2026-07-10',
    desiredRevision: 112, effectivePolicyRevision: 112, catalogRevision: 4494082701661225,
    dataAsOf: '2026-10-12T10:57:44.604Z',
  };
  const clock = {
    mode: 'after-acquisition' as const, readTimeoutMs: 5_000,
    startedAt: intent.dataAsOf, readDeadlineAt: '2026-10-12T10:57:49.604Z',
    completedAt: '2026-10-12T10:57:45.100Z', finalDataAsOf: '2026-10-12T10:57:45.100Z',
  };
  const request = { ...intent, dataAsOf: clock.readDeadlineAt };
  const admission = {
    consumer: 'thesis-ledger', routeKey: intent.routeKey,
    target: { providerId: 'akshare', upstreamSource: 'eastmoney' },
    status: 'admitted', admissionState: 'admitted', recordVersion: 1,
    evidenceRef: `sha256:${digest}`, evidenceSha256: digest,
    scopeSymbols: [intent.symbol], scopeDateFrom: intent.start, scopeDateTo: intent.end,
    adapterRevision: 'dsa-eastmoney-fund-split-mapped-v1',
    sourceRevision: 'eastmoney-fund-cf-pageinfo-json-v1', credentialRevision: 'not-required',
    validFrom: '2026-10-12T10:53:01.391764+00:00', validUntil: '2026-10-13T10:53:01.391764+00:00',
    recordedAt: '2026-10-12T10:53:01.403099+00:00', invalidatedAt: null, invalidationReason: null,
  };
  const response = {
    ...request, providerRevision: 'offline-clock-fixture', fetchedAt: '2026-10-12T10:57:45.050Z',
    admission, dateMappingEvidence: { ref: `sha256:${digest}`, sha256: digest, content: original },
    coverage: { complete: false, reason: 'historical_coverage_unverified' },
    facts: JSON.parse(original).mappings.map((mapping: { effectiveDate: string; recordDate: string }) => ({
      symbol: intent.symbol, market: 'CN', instrumentType: 'ETF', type: 'SPLIT', ratio: '2',
      effectiveDate: mapping.effectiveDate, recordDate: mapping.recordDate,
      occurredAt: `${mapping.effectiveDate}T00:00:00+08:00`, availableAt: '2026-10-12T10:57:45.004Z',
      provider: 'akshare', providerRevision: 'offline-clock-fixture',
    })),
  };
  return { version: 'eastmoney-split-acquisition-v1', intent, clock, exchange: { request, response },
    admissionSnapshots: { before: structuredClone(admission), after: structuredClone(admission) } };
}

describe('原159516拆分采集信封合同', () => {
  it('保留原字节和晚于意图截止的真实字段，原deadline交换独立关联', () => {
    expect(Buffer.byteLength(original)).toBe(936);
    expect(createHash('sha256').update(original).digest('hex')).toBe(digest);
    const input = fixture();
    const result = marketSplitAcquisitionV3Schema.parse(input);
    expect(result.exchange).toEqual(input.exchange);
    expect(result.intent).toEqual(input.intent);
    expect(result.clock.finalDataAsOf).toBe(input.clock.completedAt);
    expect(result.exchange.response.coverage.complete).toBe(false);
    expect(marketEventExchangeV3Schema.safeParse({ request: input.intent, response: input.exchange.response }).success).toBe(false);
  });

  it.each(['deadline', 'intent', 'identity', 'final', 'budget', 'expired', 'before-admission', 'coverage', 'old-observation', 'late-fetched', 'nano-future', 'unknown-offset'])('拒绝%s变化', (mutation) => {
    const input = fixture();
    const { clock, exchange } = input;
    if (mutation === 'deadline') exchange.request.dataAsOf = input.intent.dataAsOf;
    else if (mutation === 'intent') input.intent.start = '2026-03-31';
    else if (mutation === 'identity') input.intent.routeTarget.providerId = 'rqdata';
    else if (mutation === 'final') clock.finalDataAsOf = clock.readDeadlineAt;
    else if (mutation === 'budget') clock.readTimeoutMs = 4_999;
    else if (mutation === 'expired') exchange.response.admission.validUntil = clock.completedAt;
    else if (mutation === 'before-admission') exchange.response.admission.recordedAt = '2026-10-12T10:57:44.605Z';
    else if (mutation === 'coverage') exchange.response.coverage.reason = 'complete';
    else if (mutation === 'old-observation') exchange.response.facts[0].availableAt = '2026-10-12T10:57:44.603Z';
    else if (mutation === 'late-fetched') exchange.response.fetchedAt = '2026-10-12T10:57:45.101Z';
    else if (mutation === 'nano-future') exchange.response.facts[0].availableAt = '2026-10-12T10:57:45.050000001Z';
    else clock.completedAt = '2026-10-12T10:57:45.100-00:00';
    expect(marketSplitAcquisitionV3Schema.safeParse(input).success).toBe(false);
  });

  it.each(['2026-10-12T10:57:49.604Z', '2026-10-12T10:57:49.604000001Z'])('完成时刻%s达到或越过期限仍拒绝', (completed) => {
    const input = fixture();
    input.clock.completedAt = completed;
    input.clock.finalDataAsOf = completed;
    expect(marketSplitAcquisitionV3Schema.safeParse(input).success).toBe(false);
  });

  it('期限内最后一纳秒有效，UTC偏移表示保留', () => {
    const input = fixture();
    input.clock.completedAt = '2026-10-12T18:57:49.603999999+08:00';
    input.clock.finalDataAsOf = input.clock.completedAt;
    expect(marketSplitAcquisitionV3Schema.parse(input).clock.completedAt).toBe(input.clock.completedAt);
  });

  it('显式目录视图关联精确快照，默认目录和重复/未就绪记录拒绝', () => {
    const data = fixture();
    const catalog = { contractVersion: 3, consumer: 'thesis-ledger', catalogRevision: data.intent.catalogRevision,
      generatedAt: data.clock.startedAt, integrity: 'complete', entries: [{ key: data.intent.routeKey,
        target: data.exchange.response.admission.target, state: 'ready' }] };
    const view = { protocolVersion: 'event-admission-catalog-v1', catalog, admissions: [data.exchange.response.admission] };
    expect(marketEventAdmissionCatalogV3Schema.safeParse(view).success).toBe(true);
    expect(marketEventAdmissionCatalogV3Schema.safeParse(catalog).success).toBe(false);
    expect(marketEventAdmissionCatalogV3Schema.safeParse({ ...view, admissions: [...view.admissions, ...view.admissions] }).success).toBe(false);
    catalog.entries[0]!.state = 'not_admitted';
    expect(marketEventAdmissionCatalogV3Schema.safeParse(view).success).toBe(false);
  });

  it('准入前后版本不符时即使原数据仍合法也拒绝信封', () => {
    const data = fixture();
    data.admissionSnapshots.after.recordVersion = 2;
    expect(marketSplitAcquisitionV3Schema.safeParse(data).success).toBe(false);
  });
});
