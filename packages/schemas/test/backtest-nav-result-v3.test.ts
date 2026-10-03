import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestExecutionResultV3Schema,
  backtestNavResultV3Schema,
  backtestResultSchemaV3,
  backtestNavRunResponseV3Schema,
  backtestNavRunListV3Schema,
} from '../src/index.js';

const fixture = () => {
  const model = JSON.parse(
    readFileSync(
      new URL('../fixtures/backtest-execution-model.nav-fund.json', import.meta.url),
      'utf8',
    ),
  );
  model.scope.symbol = '110011.OF';
  return {
    source: 'BACKTEST',
    inputKind: 'nav',
    schemaVersion: '3',
    snapshotVersion: 'snapshot-manifest-v3',
    engineVersion: 'thesis-ledger-v3-nav-local-runner-v1',
    runId: 'nav-run',
    strategyVersionId: 'nav-strategy',
    snapshotId: 'a'.repeat(64),
    contentHash: 'a'.repeat(64),
    comparableDataFingerprint: 'b'.repeat(64),
    resultChecksum: '0'.repeat(16),
    dataAsOf: '2026-09-30T00:00:00Z',
    evaluatedAt: '2026-09-15T20:00:00+08:00',
    dateRange: { startDate: '2026-09-08', endDate: '2026-09-15' },
    executionSymbol: '110011.OF',
    calendarVersion: 'fixture-v1',
    executionModelDisclosure: { model, contentHash: 'c'.repeat(64) },
    navVisibility: { mode: 'strict-publication' },
    visibilityDisclosure: {
      classification: 'strict-publication',
      requiresSourcePitAdmission: true,
      assumptions: [],
    },
    navSource: {
      routeKey: {
        kind: 'data',
        market: 'CN',
        assetType: 'MUTUAL_FUND',
        capability: 'FUND_NAV_HISTORY',
      },
      target: { providerId: 'fixture', upstreamSource: 'fixture' },
      policyRevision: 1,
      adapterRevision: 'fixture-v1',
      providerRevision: 'fixture-v1',
      sourceRevision: 'fixture-v1',
      credentialRevision: null,
      responseHash: 'd'.repeat(64),
      capturedAt: '2026-09-29T00:00:00Z',
    },
    completeness: 'complete',
    warnings: [],
    diagnostics: [],
    requests: [],
    pendingRequestIds: [],
    cash: { currency: 'CNY', settled: '10000', unsettled: '0' },
    position: { quantity: '0', settledQuantity: '0', unsettledQuantity: '0', averageCost: '0' },
    simulationFills: [],
    trades: [],
    equityCurve: [
      { occurredAt: '2026-09-08T00:00:00+08:00', value: { amount: '10000', currency: 'CNY' } },
      { occurredAt: '2026-09-15T20:00:00+08:00', value: { amount: '10000', currency: 'CNY' } },
    ],
    drawdownCurve: [],
    metrics: {},
    benchmark: {},
  };
};

describe('NAV V3 公开结果合同', () => {
  it('NAV 列表只允许独立身份与任务状态，不暴露未经详情校验的经济结果', () => {
    const summary = {
      contractVersion: 3,
      inputKind: 'nav',
      id: '11111111-1111-4111-8111-111111111111',
      strategyVersionId: '22222222-2222-4222-8222-222222222222',
      symbol: '110011.OF',
      status: 'succeeded',
      stage: 'succeeded',
      progress: 100,
      periodStart: '2026-09-08T00:00:00Z',
      periodEnd: '2026-09-15T00:00:00Z',
      errorCode: null,
      errorSummary: null,
      createdAt: '2026-09-30T00:00:00Z',
      updatedAt: '2026-09-30T00:01:00Z',
    };
    expect(backtestNavRunListV3Schema.parse([summary])).toEqual([summary]);
    expect(backtestNavRunListV3Schema.safeParse([{ ...summary, result: fixture() }]).success).toBe(
      false,
    );
    expect(
      backtestNavRunListV3Schema.safeParse([{ ...summary, symbol: '159516.SZ' }]).success,
    ).toBe(false);
    expect(backtestNavRunListV3Schema.safeParse([{ ...summary, contractVersion: 2 }]).success).toBe(
      false,
    );
  });
  it('公开成功 Run 必须携带与数据库绑定的 NAV 结果、校验和与引擎', () => {
    const result = fixture();
    result.runId = '11111111-1111-4111-8111-111111111111';
    result.strategyVersionId = '22222222-2222-4222-8222-222222222222';
    const run = {
      contractVersion: 3,
      schemaVersion: '3',
      inputKind: 'nav',
      id: result.runId,
      strategyVersionId: result.strategyVersionId,
      preparationId: '33333333-3333-4333-8333-333333333333',
      preparationHash: 'a'.repeat(64),
      idempotencyKey: 'public-nav',
      status: 'succeeded',
      stage: 'succeeded',
      progress: 100,
      periodStart: '2026-09-08T00:00:00Z',
      periodEnd: '2026-09-15T00:00:00Z',
      dataAsOf: result.dataAsOf,
      runConfig: {
        schemaVersion: '3',
        startDate: '2026-09-08',
        endDate: '2026-09-15',
        dataAsOf: result.dataAsOf,
        baseCurrency: 'CNY',
        initialCash: { CNY: '10000' },
        executionModel: result.executionModelDisclosure.model,
        navInput: { kind: 'nav', symbol: result.executionSymbol },
        navVisibility: result.navVisibility,
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '20:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
      },
      executionAttempt: 1,
      snapshotId: result.snapshotId,
      snapshotManifest: null,
      errorCode: null,
      errorSummary: null,
      createdAt: '2026-09-30T00:00:00Z',
      updatedAt: '2026-09-30T00:01:00Z',
      startedAt: '2026-09-30T00:00:30Z',
      finishedAt: '2026-09-30T00:01:00Z',
      engineVersion: result.engineVersion,
      resultChecksum: result.resultChecksum,
      result,
    };
    expect(backtestNavRunResponseV3Schema.safeParse(run).success).toBe(true);
    expect(backtestNavRunResponseV3Schema.safeParse({ ...run, result: null }).success).toBe(false);
    expect(
      backtestNavRunResponseV3Schema.safeParse({ ...run, resultChecksum: 'f'.repeat(16) }).success,
    ).toBe(false);
    expect(
      backtestNavRunResponseV3Schema.safeParse({ ...run, engineVersion: 'exchange' }).success,
    ).toBe(false);
    expect(backtestNavRunResponseV3Schema.safeParse({ ...run, status: 'running' }).success).toBe(
      false,
    );
  });
  it('统一读取接受显式 NAV，原场内合同仍拒绝 NAV', () => {
    const value = fixture();
    expect(backtestExecutionResultV3Schema.parse(value).runId).toBe('nav-run');
    expect(backtestNavResultV3Schema.parse(value).inputKind).toBe('nav');
    expect(backtestResultSchemaV3.safeParse(value).success).toBe(false);
  });
  it.each(['protocol', 'bar', 'scope', 'hash', 'future', 'pit', 'pending'])(
    '非法净值结果拒绝：%s',
    (kind) => {
      const value = fixture();
      let candidate: unknown = value;
      if (kind === 'protocol') candidate = { ...value, executionPriceProtocol: {} };
      if (kind === 'bar')
        candidate = {
          ...value,
          navSource: {
            ...value.navSource,
            routeKey: { kind: 'bar', market: 'CN', assetType: 'ETF' },
          },
        };
      if (kind === 'scope') value.executionModelDisclosure.model.scope.symbol = '000001.OF';
      if (kind === 'hash') value.snapshotId = 'f'.repeat(64);
      if (kind === 'future') value.evaluatedAt = '2026-09-30T00:00:00.000001Z';
      if (kind === 'pit')
        candidate = {
          ...value,
          visibilityDisclosure: {
            classification: 'research-assumption',
            strictPit: true,
            assumptions: ['测试'],
          },
        };
      if (kind === 'pending') candidate = { ...value, pendingRequestIds: ['unknown'] };
      expect(backtestNavResultV3Schema.safeParse(candidate).success).toBe(false);
    },
  );
  it('拒绝期末之后的微秒权益，及缺经济结果的已确认申请', () => {
    const value = fixture();
    expect(
      backtestNavResultV3Schema.safeParse({
        ...value,
        equityCurve: [
          {
            occurredAt: '2026-09-15T12:00:00.000001Z',
            value: { amount: '10000', currency: 'CNY' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      backtestNavResultV3Schema.safeParse({
        ...value,
        requests: [
          {
            requestId: 'buy',
            requestType: 'subscribe',
            executionSymbol: '110011.OF',
            status: 'settled',
            fee: '0',
            requestAt: '2026-09-08T05:00:00Z',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
