import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestResultSchemaV3,
  backtestRunCreateSchemaV3,
  runConfigSchemaV3,
} from '../src/backtest-contract.js';
import {
  backtestSnapshotActualSourceV3Schema,
  backtestSnapshotManifestV3Schema,
} from '../src/backtest-data.js';
import { marketDataBarSeriesProvenanceV3Schema } from '../src/market-data-wire-v3.js';
import { optimizationModelContextV3Schema } from '../src/strategy-optimization.js';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/backtest-snapshot-v3.manifest.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const withoutField = <T extends object>(value: T, field: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
const priceProtocol = {
  protocolVersion: 'execution-price-v1',
  priceBasis: {
    adjustment: 'qfq',
    method: 'provider-native',
    methodVersion: 'hithink-etf-qfq-provider-defined-v1',
    basisScope: 'provider-defined',
    anchor: null,
    revision: {
      origin: 'local-observation',
      contentHash: 'c'.repeat(64),
    },
    observedAt: '2026-08-10T00:00:00.000Z',
    quantityBasis: 'normalized-units',
    volumeBasis: 'unknown',
    dividendMeaning: 'provider-defined',
    dividendEvidenceRef: null,
    conversionAvailable: false,
    conversionEvidenceRef: null,
    derivation: null,
  },
  accountingBasis: 'normalized-series',
  history: { basis: 'fixed-provider-snapshot' },
};

const normalizedExecutionModel = () => {
  const model = JSON.parse(
    readFileSync(
      new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
      'utf8',
    ),
  );
  model.id = 'normalized-159516-research';
  model.scope.symbol = '159516.SZ';
  model.scope.instrumentType = 'ETF';
  model.scope.range = { start: '2026-05-16', end: '2026-08-09' };
  model.segments[0].range = { start: '2026-05-16', end: '2026-08-09' };
  model.segments[0].assumptions.push('连续 Decimal 归一化数量及复权价格，按模拟成交额计费');
  model.segments[0].execution.price = {
    kind: 'noDailyLimit',
    reason: '归一化坐标不适用真实价格 tick 和涨跌幅限制',
  };
  model.segments[0].execution.normalizedExecution = {
    priceCoordinate: 'continuous-decimal',
    quantityUnits: 'continuous-normalized-decimal',
    lotSizeConstraint: 'not-applied',
    tickSizeConstraint: 'not-applied',
    dailyPriceLimit: 'not-applied',
    feeBasis: 'simulatedTurnover',
  };
  return model;
};

describe('Backtest V3 run and snapshot contracts', () => {
  it('accepts a new run only with the explicit V3 price and history protocol', () => {
    const config = {
      schemaVersion: '3',
      startDate: '2026-05-16',
      endDate: '2026-08-09',
      dataAsOf: '2026-08-10T00:00:00.000Z',
      baseCurrency: 'CNY',
      initialCash: { CNY: '10000' },
      valuationPolicy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      executionModel: normalizedExecutionModel(),
      executionPriceProtocol: priceProtocol,
    };

    expect(runConfigSchemaV3.parse(config)).toEqual(config);
    expect(
      backtestRunCreateSchemaV3.safeParse({
        contractVersion: 3,
        preparationStamp: JSON.parse(
          readFileSync(
            new URL('../fixtures/backtest-preparation-stamp-v3.json', import.meta.url),
            'utf8',
          ),
        ),
        strategyVersionId: 'd2719c01-f684-4cb6-94c6-61c77d4f9881',
        runConfig: config,
        idempotencyKey: 'new-run-v3',
      }).success,
    ).toBe(true);
    expect(
      backtestRunCreateSchemaV3.safeParse({
        contractVersion: 3,
        strategyVersionId: 'd2719c01-f684-4cb6-94c6-61c77d4f9881',
        runConfig: config,
        idempotencyKey: 'missing-preparation',
      }).success,
    ).toBe(false);
    expect(
      runConfigSchemaV3.safeParse({ ...config, executionPriceProtocol: undefined }).success,
    ).toBe(false);
    expect(
      backtestRunCreateSchemaV3.safeParse({
        contractVersion: 2,
        strategyVersionId: 'd2719c01-f684-4cb6-94c6-61c77d4f9881',
        runConfig: config,
        idempotencyKey: 'wrong-version',
      }).success,
    ).toBe(false);

    expect(
      runConfigSchemaV3.safeParse({
        startDate: '2024-01-02',
        endDate: '2024-01-03',
        dataAsOf: '2024-01-04T00:00:00.000Z',
        baseCurrency: 'CNY',
        initialCash: { CNY: '10000' },
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '15:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
      }).success,
    ).toBe(false);
  });

  it('freezes the protocol, comparable fingerprint, and actual upstream in a strict V3 manifest', () => {
    const parsed = backtestSnapshotManifestV3Schema.parse(fixture);
    const actualSourceFixture = (fixture.actualSources as Record<string, unknown>[])[0]!;
    const provenanceFixture = actualSourceFixture.provenance as Record<string, unknown>;
    expect(parsed.manifestVersion).toBe('snapshot-manifest-v3');
    expect(parsed.executionPriceProtocol.history).toEqual({ basis: 'fixed-provider-snapshot' });
    expect(parsed.actualSources[0]).toMatchObject({
      purpose: 'execution',
      symbol: '159516.SZ',
      provenance: {
        providerId: 'hithink',
        upstreamSource: 'hithink-financial-api',
        routeIndex: 0,
        effectivePolicyRevision: 1,
      },
    });
    expect(marketDataBarSeriesProvenanceV3Schema.parse(provenanceFixture)).toEqual(
      provenanceFixture,
    );
    expect(backtestSnapshotActualSourceV3Schema.parse(actualSourceFixture)).toEqual(
      actualSourceFixture,
    );
    expect(parsed.actualSources[0]?.provenance).not.toHaveProperty('providerRevision');
    for (const [field, value] of [
      ['providerRevision', 'v2-revision'],
      ['fetchedAt', '2026-08-10T00:00:00.000Z'],
      ['freshUntil', '2026-08-10T00:05:00.000Z'],
      ['servedFromCache', false],
      ['cacheStatus', 'miss'],
    ] as const) {
      expect(
        backtestSnapshotActualSourceV3Schema.safeParse({
          ...actualSourceFixture,
          provenance: { ...provenanceFixture, [field]: value },
        }).success,
      ).toBe(false);
    }
    expect(parsed.comparableDataFingerprint).toBe('d'.repeat(64));

    const missingFingerprint = withoutField(fixture, 'comparableDataFingerprint');
    expect(backtestSnapshotManifestV3Schema.safeParse(missingFingerprint).success).toBe(false);
    const missingSources = withoutField(fixture, 'actualSources');
    expect(backtestSnapshotManifestV3Schema.safeParse(missingSources).success).toBe(false);
    const missingProtocol = withoutField(fixture, 'executionPriceProtocol');
    expect(backtestSnapshotManifestV3Schema.safeParse(missingProtocol).success).toBe(false);
    expect(
      backtestSnapshotManifestV3Schema.safeParse({ ...fixture, futureField: true }).success,
    ).toBe(false);
  });

  it('publishes V3 result disclosure and rejects a result missing the frozen source or fingerprint', () => {
    const result = {
      source: 'BACKTEST',
      runId: 'run-v3-159516',
      strategyVersionId: 'strategy-version-1',
      snapshotId: 'snapshot-v3-1',
      engineVersion: 'thesis-ledger-v2',
      schemaVersion: '3',
      snapshotVersion: 'snapshot-manifest-v3',
      marketRuleVersion: 'market-rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'bar-aggregation-v1',
      contentHash: 'a'.repeat(64),
      resultChecksum: 'b'.repeat(64),
      completeness: 'complete',
      executionPriceProtocol: priceProtocol,
      executionModelDisclosure: { model: normalizedExecutionModel() },
      comparableDataFingerprint: 'd'.repeat(64),
      actualSources: fixture.actualSources,
      warnings: [],
      rejectedOrders: [],
      simulationFills: [],
      trades: [],
      equityCurve: [],
      metrics: { totalReturn: { status: 'available', value: '0.1' } },
    };

    expect(backtestResultSchemaV3.parse(result)).toMatchObject({
      schemaVersion: '3',
      snapshotVersion: 'snapshot-manifest-v3',
      comparableDataFingerprint: 'd'.repeat(64),
    });
    const missingActualSources = withoutField(result, 'actualSources');
    expect(backtestResultSchemaV3.safeParse(missingActualSources).success).toBe(false);
    const missingFingerprint = withoutField(result, 'comparableDataFingerprint');
    expect(backtestResultSchemaV3.safeParse(missingFingerprint).success).toBe(false);
  });

  it('rejects historical manifest versions at the current schema boundary', () => {
    for (const manifestVersion of ['snapshot-manifest-v1', 'snapshot-manifest-v2']) {
      expect(
        backtestSnapshotManifestV3Schema.safeParse({ ...fixture, manifestVersion }).success,
      ).toBe(false);
    }
  });
});

describe('sealed AI feedback contract', () => {
  const validWindow = {
    split: 'development',
    window: { start: '2024-01-02', end: '2024-01-10' },
    comparableDataFingerprint: 'f'.repeat(64),
    metrics: { totalReturn: { status: 'available', value: '0.12' } },
  };
  const validContext = {
    contractVersion: 3,
    modelKey: 'provider:model',
    round: 1,
    objective: { mode: 'return', minClosedTrades: 1 },
    authorizedParameters: [],
    strategy: {
      name: 'moving average',
      primaryTimeframe: '1d',
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    },
    visibleWindows: [validWindow],
    priorCandidates: [],
  };

  it('represents only bounded development and validation summaries', () => {
    expect(optimizationModelContextV3Schema.parse(validContext).visibleWindows).toHaveLength(1);
    expect(
      optimizationModelContextV3Schema.safeParse({
        ...validContext,
        visibleWindows: [...validContext.visibleWindows, { ...validWindow, split: 'test' }],
      }).success,
    ).toBe(false);
    expect(
      optimizationModelContextV3Schema.safeParse({ ...validContext, test: validWindow }).success,
    ).toBe(false);
    expect(
      optimizationModelContextV3Schema.safeParse({
        ...validContext,
        visibleWindows: [
          {
            ...validWindow,
            metrics: {
              ...validWindow.metrics,
              futureEventCount: { status: 'available', value: '4' },
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
