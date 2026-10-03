import { describe, expect, it } from 'vitest';
import {
  backtestNavFrozenInputV3Schema,
  backtestNavRunConfigV3Schema,
  backtestNavSnapshotManifestV3Schema,
} from '../src/backtest-nav-freeze-v3.js';

const symbol = '161725.OF';
const hash = 'a'.repeat(64);

const model = () => ({
  schemaVersion: 'execution-model-v1',
  id: 'nav-model',
  version: '1',
  scope: {
    symbol,
    market: 'CN',
    instrumentType: 'NAV_FUND',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    range: { start: '2025-01-02', end: '2025-01-03' },
  },
  segments: [
    {
      id: 'nav-2025',
      range: { start: '2025-01-02', end: '2025-01-03' },
      source: {
        kind: 'researchPreset',
        description: '净值费用模型测试',
        references: ['evidence://fee-model'],
        revision: '1',
        configuredAt: '2025-01-01T00:00:00.000Z',
      },
      assumptions: ['申购与赎回费用按模型收取'],
      fees: null,
      execution: {
        mode: 'nav',
        calendarMarket: 'CN',
        cutoffLocalTime: '14:00',
        cutoffBoundary: 'atOrAfterNextTradingDay',
        navDate: 'acceptedApplicationTradingDate',
        navAvailability: 'providerAvailableAt',
        reserveCashAt: 'orderAccepted',
        subscriptionDebitAt: 'confirmation',
        confirmationAfterTradingDays: 1,
        sellableAfterConfirmationTradingDays: 1,
        redemptionReinvestableAfterConfirmationTradingDays: 2,
        subscriptionFee: {
          treatment: 'charged',
          side: 'buy',
          basis: 'subscriptionApplicationAmount',
          currency: 'CNY',
          rate: '0.01',
          minimum: { kind: 'none' },
          rounding: { mode: 'halfUp', decimalPlaces: 2 },
          collection: 'perApplication',
          collectedAt: 'confirmation',
        },
        redemptionFee: {
          treatment: 'charged',
          side: 'sell',
          basis: 'redemptionGrossProceeds',
          currency: 'CNY',
          rate: '0.01',
          minimum: { kind: 'none' },
          rounding: { mode: 'halfUp', decimalPlaces: 2 },
          collection: 'perApplication',
          collectedAt: 'confirmation',
        },
      },
    },
  ],
});

const config = () => ({
  schemaVersion: '3',
  startDate: '2025-01-02',
  endDate: '2025-01-03',
  dataAsOf: '2025-01-04T00:00:00.000Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '10000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '20:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
  executionModel: model(),
  navInput: { kind: 'nav', symbol },
  navVisibility: { mode: 'strict-publication' },
});

const fact = (valuationDate: string, occurredAt: string, availableAt: string) => ({
  symbol,
  valuationDate,
  nav: '1.25',
  status: 'supported',
  freshness: 'delayed',
  quality: 'complete',
  occurredAt,
  availableAt,
  publicationEvidence: {
    kind: 'source-publication-record',
    sourceRecordId: `eastmoney:${symbol}:${valuationDate}`,
    sourcePublishedAt: availableAt,
    rawRecordHash: hash,
    evidenceRef: `evidence://nav/${valuationDate}`,
  },
});

const manifest = () => ({
  manifestVersion: 'snapshot-manifest-v3',
  inputKind: 'nav',
  status: 'finalized',
  runId: 'run-1',
  strategyVersionId: 'strategy-1',
  strategyVersionHash: hash,
  runConfigChecksum: hash,
  dataAsOf: '2025-01-04T00:00:00.000Z',
  navInput: { kind: 'nav', symbol },
  navVisibility: { mode: 'strict-publication' },
  executionModel: {
    schemaVersion: 'execution-model-v1',
    id: 'nav-model',
    version: '1',
    contentHash: hash,
    artifactKey: 'execution/model.json',
  },
  source: {
    routeKey: {
      kind: 'data',
      market: 'CN',
      assetType: 'MUTUAL_FUND',
      capability: 'FUND_NAV_HISTORY',
    },
    target: { providerId: 'eastmoney', upstreamSource: 'eastmoney' },
    policyRevision: 1,
    adapterRevision: 'adapter-1',
    providerRevision: 'provider-1',
    sourceRevision: 'source-1',
    credentialRevision: 'credential-1',
    responseHash: hash,
    capturedAt: '2025-01-04T00:00:00.000Z',
  },
  calendar: {
    market: 'CN',
    timezone: 'Asia/Shanghai',
    version: 'calendar-1',
    contentHash: hash,
    evidenceRef: 'evidence://calendar/2025-01',
    availableAt: '2025-01-01T00:00:00.000Z',
    expectedValuationDates: ['2025-01-02', '2025-01-03'],
  },
  dateRange: {
    startDate: '2025-01-02',
    endDate: '2025-01-03',
    warmupStartDate: '2025-01-02',
  },
  facts: [
    fact('2025-01-02', '2025-01-02T07:00:00.000Z', '2025-01-02T11:00:00.000Z'),
    fact('2025-01-03', '2025-01-03T07:00:00.000Z', '2025-01-03T11:00:00.000Z'),
  ],
  coverage: { complete: true, startDate: '2025-01-02', endDate: '2025-01-03' },
  artifact: {
    key: 'execution/nav.parquet',
    format: 'parquet',
    compression: 'zstd',
    contentHash: hash,
    sizeBytes: 128,
  },
  comparableDataFingerprint: hash,
  contextArtifact: {
    key: 'metadata/nav-context-v3.parquet',
    format: 'parquet',
    compression: 'zstd',
    contentHash: hash,
    sizeBytes: 128,
  },
  contentHash: hash,
});

const research = () => {
  const runConfig = {
    ...config(),
    dataAsOf: '2025-01-08T00:00:00Z',
    navVisibility: {
      mode: 'research-assumption',
      boundary: 'after-disclosure-day-end',
      timezone: 'Asia/Shanghai',
      disclosureCalendarHash: hash,
      rule: {
        id: 'rule',
        version: '1',
        symbol,
        fundType: 'domestic',
        applicableRange: { startDate: '2025-01-02', endDate: '2025-01-03' },
        delayWorkdays: 1,
        basis: 'domestic-default',
        evidenceRef: 'fixture://rule',
        documentHash: hash,
        contentHash: hash,
        configuredAt: '2025-01-01T00:00:00Z',
      },
    },
  };
  const base = manifest();
  const value = {
    ...base,
    dataAsOf: runConfig.dataAsOf,
    navVisibility: runConfig.navVisibility,
    facts: base.facts.map((f, i) => {
      const disclosureDate = i === 0 ? '2025-01-03' : '2025-01-06';
      const assumedAvailableAt =
        i === 0 ? '2025-01-04T00:00:00+08:00' : '2025-01-07T00:00:00+08:00';
      return {
        ...f,
        availableAt: assumedAvailableAt,
        publicationEvidence: {
          kind: 'research-assumption',
          sourceRecordId: f.publicationEvidence.sourceRecordId,
          rawRecordHash: hash,
          evidenceRef: 'fixture://rule',
          ruleHash: hash,
          disclosureCalendarHash: hash,
          disclosureDate,
          assumedAvailableAt,
        },
      };
    }),
  };
  return { runConfig, manifest: value };
};

describe('当前 NAV 冻结输入合同', () => {
  it('接受显式研究合同及已核查 QDII 延迟，不要求伪造发布时间', () => {
    expect(backtestNavFrozenInputV3Schema.safeParse(research()).success).toBe(true);
    const input = research();
    input.runConfig.navVisibility.rule.fundType = 'qdii';
    input.runConfig.navVisibility.rule.basis = 'verified-fund-rule';
    input.runConfig.navVisibility.rule.delayWorkdays = 2;
    expect(backtestNavFrozenInputV3Schema.safeParse(input).success).toBe(true);
  });

  it.each([
    'missing-mode',
    'unverified-qdii',
    'domestic-delay',
    'source-time',
    'mixed-mode',
    'future-capture',
    'rule-hash',
    'calendar-hash',
  ])('拒绝研究证据错误 %s', (kind) => {
    const input = research();
    if (kind === 'missing-mode') Reflect.deleteProperty(input.runConfig, 'navVisibility');
    if (kind === 'unverified-qdii') input.runConfig.navVisibility.rule.fundType = 'qdii';
    if (kind === 'domestic-delay') input.runConfig.navVisibility.rule.delayWorkdays = 2;
    if (kind === 'source-time')
      Object.assign(input.manifest.facts[0]!.publicationEvidence, {
        sourcePublishedAt: '2025-01-03T00:00:00Z',
      });
    if (kind === 'mixed-mode')
      input.manifest.facts[0]!.publicationEvidence.kind = 'source-publication-record';
    if (kind === 'future-capture') input.manifest.source.capturedAt = '2025-01-08T00:00:00.000001Z';
    if (kind === 'rule-hash')
      input.manifest.facts[0]!.publicationEvidence.ruleHash = 'b'.repeat(64);
    if (kind === 'calendar-hash')
      input.manifest.facts[0]!.publicationEvidence.disclosureCalendarHash = 'b'.repeat(64);
    expect(backtestNavFrozenInputV3Schema.safeParse(input).success).toBe(false);
  });
  it('接受独立净值运行配置和有历史发布时间证据的完整窗口', () => {
    expect(backtestNavRunConfigV3Schema.safeParse(config()).success).toBe(true);
    expect(backtestNavSnapshotManifestV3Schema.safeParse(manifest()).success).toBe(true);
    expect(
      backtestNavFrozenInputV3Schema.safeParse({ runConfig: config(), manifest: manifest() })
        .success,
    ).toBe(true);
  });

  it('拒绝把 NAV 运行映射为场内价格协议或不匹配的费用模型', () => {
    expect(
      backtestNavRunConfigV3Schema.safeParse({ ...config(), executionPriceProtocol: {} }).success,
    ).toBe(false);
    const wrongModel = model();
    wrongModel.scope.symbol = '510300.SH';
    expect(
      backtestNavRunConfigV3Schema.safeParse({ ...config(), executionModel: wrongModel }).success,
    ).toBe(false);
  });

  it('拒绝缺日、缺来源发布时间、未来可见和 Bar 产物', () => {
    const base = manifest();
    expect(
      backtestNavSnapshotManifestV3Schema.safeParse({ ...base, facts: [base.facts[0]] }).success,
    ).toBe(false);
    const noEvidence = structuredClone(base);
    delete (noEvidence.facts[0] as Partial<(typeof noEvidence.facts)[0]>).publicationEvidence;
    expect(backtestNavSnapshotManifestV3Schema.safeParse(noEvidence).success).toBe(false);
    const future = structuredClone(base);
    future.facts[1]!.availableAt = '2025-01-05T00:00:00.000Z';
    expect(backtestNavSnapshotManifestV3Schema.safeParse(future).success).toBe(false);
    const wrongSymbol = structuredClone(base);
    wrongSymbol.facts[1]!.symbol = '161726.OF';
    expect(backtestNavSnapshotManifestV3Schema.safeParse(wrongSymbol).success).toBe(false);
    expect(
      backtestNavSnapshotManifestV3Schema.safeParse({
        ...base,
        artifact: { ...base.artifact, key: 'execution/bars.parquet' },
      }).success,
    ).toBe(false);
    expect(
      backtestNavSnapshotManifestV3Schema.safeParse({
        ...base,
        calendar: { ...base.calendar, availableAt: '2025-01-05T00:00:00.000Z' },
      }).success,
    ).toBe(false);
    expect(
      backtestNavSnapshotManifestV3Schema.safeParse({
        ...base,
        coverage: { ...base.coverage, complete: false },
      }).success,
    ).toBe(false);
  });

  it('拒绝运行配置与冻结净值身份或执行模型版本不一致', () => {
    const changed = manifest();
    changed.navInput.symbol = '161726.OF';
    expect(
      backtestNavFrozenInputV3Schema.safeParse({ runConfig: config(), manifest: changed }).success,
    ).toBe(false);
    const changedModel = manifest();
    changedModel.executionModel.version = '2';
    expect(
      backtestNavFrozenInputV3Schema.safeParse({ runConfig: config(), manifest: changedModel })
        .success,
    ).toBe(false);
  });

  it('拒绝未冻结上下文的前置格式，以及微秒级未来事实', () => {
    const noContext = manifest();
    Reflect.deleteProperty(noContext, 'contextArtifact');
    expect(backtestNavSnapshotManifestV3Schema.safeParse(noContext).success).toBe(false);
    const future = manifest();
    future.dataAsOf = '2025-01-04T00:00:00.000001Z';
    future.facts[1]!.availableAt = '2025-01-04T00:00:00.000002Z';
    expect(backtestNavSnapshotManifestV3Schema.safeParse(future).success).toBe(false);
  });
});
