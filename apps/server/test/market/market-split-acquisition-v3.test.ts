import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { marketEventExchangeV3Schema, type MarketEventRequestV3 } from '@thesis-ledger/schemas';
import {
  acquireMarketSplitAfterAcquisitionV3,
  consumeMarketSplitAcquisitionV3,
} from '../../src/market/market-split-acquisition-v3.js';

const original = readFileSync(new URL('../../../../docs/tasks/evidence/2026-10-02-m22-159516-split-mapping.json', import.meta.url), 'utf8');
const digest = 'b1a4f03f94faf27acf95d2bef9d508ec06eabec1280e04c921bb677154f5fe8e';

function fixture() {
  const key = { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'SPLIT_EVENT' } as const;
  const target = { providerId: 'akshare', upstreamSource: 'eastmoney' };
  const scope = {
    contractVersion: 3 as const, requestId: 'ed92afdb-5f4b-4d6c-8f95-d8acf8dc08cf', routeKey: key,
    symbol: '159516.SZ', start: '2026-03-30', end: '2026-07-10',
    desiredRevision: 112, effectivePolicyRevision: 112, catalogRevision: 4494082701661225,
    dataAsOf: '2026-10-12T10:57:44.604Z',
  };
  const effective = {
    contractVersion: 3, consumer: 'thesis-ledger', requestId: 'offline-policy', revision: 112,
    sourceDesiredRevision: 112, enabled: true, appliedAt: '2026-10-12T10:57:44.000Z',
    routes: [{ key, reason: null, targets: [{ ...target, routeIndex: 0, eligible: true, reason: null }] }],
  };
  const catalog = {
    contractVersion: 3, consumer: 'thesis-ledger', catalogRevision: scope.catalogRevision,
    generatedAt: '2026-10-12T10:57:44.000Z', integrity: 'complete',
    entries: [{ key, target, state: 'ready' }],
  };
  const read = vi.fn(async (request: MarketEventRequestV3) => ({
    ...request, fetchedAt: '2026-10-12T10:57:45.050Z', providerRevision: 'offline-clock-fixture',
    admission: {
      consumer: 'thesis-ledger', routeKey: key, target,
      status: 'admitted', admissionState: 'admitted', recordVersion: 1,
      evidenceRef: `sha256:${digest}`, evidenceSha256: digest, scopeSymbols: [scope.symbol],
      scopeDateFrom: scope.start, scopeDateTo: scope.end,
      adapterRevision: 'dsa-eastmoney-fund-split-mapped-v1', sourceRevision: 'eastmoney-fund-cf-pageinfo-json-v1',
      credentialRevision: 'not-required', validFrom: '2026-10-12T10:53:01.391764+00:00',
      validUntil: '2026-10-13T10:53:01.391764+00:00', recordedAt: '2026-10-12T10:53:01.403099+00:00',
      invalidatedAt: null, invalidationReason: null,
    },
    dateMappingEvidence: { ref: `sha256:${digest}`, sha256: digest, content: original },
    coverage: { complete: false, reason: 'historical_coverage_unverified' },
    facts: JSON.parse(original).mappings.map((mapping: { effectiveDate: string; recordDate: string }) => ({
      symbol: scope.symbol, market: 'CN', instrumentType: 'ETF', type: 'SPLIT', ratio: '2',
      effectiveDate: mapping.effectiveDate, recordDate: mapping.recordDate,
      occurredAt: `${mapping.effectiveDate}T00:00:00+08:00`, availableAt: '2026-10-12T10:57:45.004Z',
      provider: 'akshare', providerRevision: 'offline-clock-fixture',
    })),
  }));
  const now = vi.fn().mockReturnValueOnce(scope.dataAsOf).mockReturnValueOnce(scope.dataAsOf)
    .mockReturnValue('2026-10-12T10:57:45.100Z');
  const record = {
    consumer: 'thesis-ledger', routeKey: key, target, status: 'admitted', admissionState: 'admitted', recordVersion: 1,
    evidenceRef: `sha256:${digest}`, evidenceSha256: digest, scopeSymbols: [scope.symbol], scopeDateFrom: scope.start, scopeDateTo: scope.end,
    adapterRevision: 'dsa-eastmoney-fund-split-mapped-v1', sourceRevision: 'eastmoney-fund-cf-pageinfo-json-v1', credentialRevision: 'not-required',
    validFrom: '2026-10-12T10:53:01.391764+00:00', validUntil: '2026-10-13T10:53:01.391764+00:00',
    recordedAt: '2026-10-12T10:53:01.403099+00:00', invalidatedAt: null, invalidationReason: null,
  };
  const admissionRecords = [record];
  const readStateAfter = vi.fn(async () => structuredClone({ effective, catalog, admissions: admissionRecords }));
  return { mode: 'after-acquisition' as const, scope, effective, catalog, admissions: admissionRecords, read, readStateAfter, now, readTimeoutMs: 5_000 };
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('本地验证禁止网络'); })));
afterEach(() => vi.unstubAllGlobals());

describe('拆分实际完成截止的Server采集与消费', () => {
  it('原selector读取恰一次，原交换/观察/936字节保留，完成截止派生且离线可消费', async () => {
    const input = fixture();
    const saved = structuredClone(input.scope);
    const result = await acquireMarketSplitAfterAcquisitionV3(input);
    expect(result.status).toBe('observed');
    if (result.status !== 'observed') throw new Error('缺少采集');
    expect(input.read).toHaveBeenCalledOnce();
    expect(input.readStateAfter).toHaveBeenCalledOnce();
    expect(result.acquisition.intent.dataAsOf).toBe(saved.dataAsOf);
    expect(result.acquisition.exchange.request.dataAsOf).toBe('2026-10-12T10:57:49.604Z');
    expect(result.acquisition.exchange.response).toEqual(await input.read.mock.results[0]!.value);
    expect(result.request.dataAsOf).toBe('2026-10-12T10:57:45.100Z');
    expect(result.response.facts).toEqual(result.acquisition.exchange.response.facts);
    expect(result.response.dateMappingEvidence?.content).toBe(original);
    expect(createHash('sha256').update(original).digest('hex')).toBe(digest);
    expect(result.response.coverage.complete).toBe(false);
    expect(input.scope).toEqual(saved);
    expect(marketEventExchangeV3Schema.safeParse({ request: result.acquisition.intent, response: result.response }).success).toBe(false);
    const replay = consumeMarketSplitAcquisitionV3(JSON.parse(JSON.stringify(result.acquisition)));
    expect(replay).toEqual({ request: result.request, response: result.response });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['not-admitted', 'wrong-source', 'bad-mode', 'bad-budget', 'future-intent', 'expired-before-read'])('前置%s拒绝且零数据调用', async (failure) => {
    const input = fixture();
    if (failure === 'not-admitted') input.catalog.entries[0]!.state = 'not_admitted';
    else if (failure === 'wrong-source') {
      input.effective.routes[0]!.targets[0]!.providerId = 'rqdata';
      input.catalog.entries[0]!.target.providerId = 'rqdata';
    } else if (failure === 'bad-mode') Reflect.set(input, 'mode', 'requested-time');
    else if (failure === 'bad-budget') input.readTimeoutMs = 0;
    else if (failure === 'future-intent') input.scope.dataAsOf = '2027-01-01T00:00:00Z';
    else input.now.mockReset().mockReturnValueOnce(input.scope.dataAsOf).mockReturnValue('2026-10-12T10:57:49.604Z');
    expect((await acquireMarketSplitAfterAcquisitionV3(input)).status).toBe('unavailable');
    expect(input.read).not.toHaveBeenCalled();
    expect(input.readStateAfter).not.toHaveBeenCalled();
  });

  it('上游异常不重试、不换源，不执行后置控制', async () => {
    const input = fixture();
    input.read.mockRejectedValue(new Error('private-token-fixture'));
    expect(await acquireMarketSplitAfterAcquisitionV3(input)).toMatchObject({ status: 'unavailable', reason: 'upstream_failure' });
    expect(input.read).toHaveBeenCalledOnce();
    expect(input.readStateAfter).not.toHaveBeenCalled();
  });

  it('仅只读投影appliedAt变化不误拒绝，前后真实时刻与原交换保持', async () => {
    const input = fixture();
    const beforeAt = input.effective.appliedAt;
    const after = structuredClone({ effective: input.effective, catalog: input.catalog, admissions: input.admissions });
    after.effective.appliedAt = '2026-10-12T10:57:45.090Z';
    input.readStateAfter.mockResolvedValue(after);
    const result = await acquireMarketSplitAfterAcquisitionV3(input);
    expect(result.status).toBe('observed');
    if (result.status !== 'observed') throw new Error('缺少采集');
    expect(input.effective.appliedAt).toBe(beforeAt);
    expect(after.effective.appliedAt).toBe('2026-10-12T10:57:45.090Z');
    expect(result.acquisition.exchange.response).toEqual(await input.read.mock.results[0]!.value);
    expect(result.response.coverage.complete).toBe(false);
    expect(input.read).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('同修订内真实选源变化仍拒绝，不因appliedAt变化放宽控制围栏', async () => {
    const input = fixture();
    const after = structuredClone({ effective: input.effective, catalog: input.catalog, admissions: input.admissions });
    after.effective.appliedAt = '2026-10-12T10:57:45.090Z';
    after.effective.routes[0]!.targets[0]!.providerId = 'rqdata';
    after.effective.routes[0]!.targets[0]!.upstreamSource = 'rqdata';
    input.readStateAfter.mockResolvedValue(after);
    const result = await acquireMarketSplitAfterAcquisitionV3(input);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'control_changed' });
    if (result.status !== 'unavailable') throw new Error('缺少拒绝');
    expect(result.exchange?.response.dateMappingEvidence?.content).toBe(original);
    expect(input.read).toHaveBeenCalledOnce();
  });

  it('appliedAt仍须通过完整协议验证，非法时刻不能作为稳定控制接受', async () => {
    const input = fixture();
    const after = structuredClone({ effective: input.effective, catalog: input.catalog, admissions: input.admissions });
    after.effective.appliedAt = 'invalid-clock';
    input.readStateAfter.mockResolvedValue(after);
    expect(await acquireMarketSplitAfterAcquisitionV3(input)).toMatchObject({
      status: 'unavailable', reason: 'control_unverified',
    });
    expect(input.read).toHaveBeenCalledOnce();
  });

  it.each(['revision', 'catalog', 'eligibility', 'disabled', 'unverified'])('后置%s拒绝，保留获取交换但不消费', async (failure) => {
    const input = fixture();
    input.readStateAfter.mockImplementation(async () => {
      if (failure === 'unverified') throw new Error('private-token-fixture');
      if (failure === 'revision') input.effective.revision = 113;
      else if (failure === 'catalog') input.catalog.catalogRevision += 1;
      else if (failure === 'eligibility') {
        input.catalog.entries[0]!.state = 'not_admitted';
        input.admissions = [];
      }
      else {
        input.effective.enabled = false;
        input.effective.routes[0]!.targets[0]!.eligible = false;
        Reflect.set(input.effective.routes[0]!, 'reason', 'disabled');
        Reflect.set(input.effective.routes[0]!.targets[0]!, 'reason', 'disabled');
      }
      return { effective: input.effective, catalog: input.catalog, admissions: input.admissions };
    });
    const result = await acquireMarketSplitAfterAcquisitionV3(input);
    expect(result).toMatchObject({ status: 'unavailable', reason: failure === 'unverified' ? 'control_unverified' : 'control_changed' });
    if (result.status !== 'unavailable') throw new Error('缺少拒绝');
    expect(result.exchange?.response.dateMappingEvidence?.content).toBe(original);
    expect(input.read).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('private-token-fixture');
  });

  it.each(['2026-10-12T10:57:49.604Z', '2026-10-12T10:57:49.604000001Z'])('完成时刻%s到期限拒绝且不后移截止', async (complete) => {
    const input = fixture();
    input.now.mockReset().mockReturnValueOnce(input.scope.dataAsOf).mockReturnValueOnce(input.scope.dataAsOf).mockReturnValue(complete);
    const result = await acquireMarketSplitAfterAcquisitionV3(input);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'clock_expired' });
    if (result.status !== 'unavailable') throw new Error('缺少拒绝');
    expect(result.exchange?.request.dataAsOf).toBe('2026-10-12T10:57:49.604Z');
    expect(input.read).toHaveBeenCalledOnce();
  });

  it('读取端口篡改请求不能改变原意图', async () => {
    const input = fixture();
    const originalRead = input.read.getMockImplementation()!;
    input.read.mockImplementation(async (request) => {
      request.symbol = '510300.SH';
      return originalRead(request);
    });
    expect(await acquireMarketSplitAfterAcquisitionV3(input)).toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
    expect(input.scope.symbol).toBe('159516.SZ');
    expect(input.read).toHaveBeenCalledOnce();
  });

  it('离线消费拒绝原文字节篡改、观察时钟改写和伪完整覆盖', async () => {
    const result = await acquireMarketSplitAfterAcquisitionV3(fixture());
    if (result.status !== 'observed') throw new Error('缺少采集');
    for (const failure of ['content', 'clock', 'coverage']) {
      const value = structuredClone(result.acquisition);
      if (failure === 'content') value.exchange.response.dateMappingEvidence!.content += '\n';
      else if (failure === 'clock') value.exchange.response.facts[0]!.availableAt = '2026-10-12T10:57:44.603Z';
      else Reflect.set(value.exchange.response, 'coverage', { complete: true, admissionEvidenceRef: `sha256:${digest}` });
      expect(() => consumeMarketSplitAcquisitionV3(value)).toThrow('采集信封');
    }
  });

  it('同ready同旧目录号的记录替换也必须拒绝后置消费', async () => {
    const input = fixture();
    input.readStateAfter.mockImplementation(async () => {
      input.admissions[0]!.recordVersion = 2;
      return { effective: input.effective, catalog: input.catalog, admissions: input.admissions };
    });
    const result = await acquireMarketSplitAfterAcquisitionV3(input);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'control_changed' });
    expect(input.read).toHaveBeenCalledOnce();
  });

  it('缺少精确快照或作用域不符时不调用数据端口', async () => {
    for (const failure of ['missing', 'scope']) {
      const input = fixture();
      if (failure === 'missing') input.admissions = [];
      else input.admissions[0]!.scopeSymbols = ['510300.SH'];
      expect((await acquireMarketSplitAfterAcquisitionV3(input)).status).toBe('unavailable');
      expect(input.read).not.toHaveBeenCalled();
    }
  });
});
