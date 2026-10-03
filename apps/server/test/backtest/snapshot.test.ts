import { describe, expect, it } from 'vitest';

import {
  runConfigSchemaV3,
  strategySchema,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import {
  buildCurrentSnapshotBase,
  canonicalizeManifest,
  deriveSnapshotDependencyClosure,
} from '../../src/backtest/backtest-snapshot.js';

function contracts(): { strategy: BacktestStrategy; runConfig: RunConfigV3 } {
  const strategy = strategySchema.parse({
    schemaVersion: '2',
    name: 'snapshot test',
    signalSources: [
      {
        id: 'cn-close',
        asset: { symbol: '000001', market: 'CN', assetType: 'stock' },
        timeframe: '1d',
        series: ['close'],
      },
      {
        id: 'us-close',
        asset: { symbol: 'AAPL', market: 'US', assetType: 'stock' },
        timeframe: '1d',
        series: ['close'],
      },
    ],
    executionInstrument: { symbol: '000001', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
    entry: {
      type: 'compare',
      operator: 'gt',
      left: {
        type: 'indicator',
        name: 'MA',
        input: { type: 'series', sourceId: 'cn-close', field: 'close' },
        params: { period: 5 },
      },
      right: { type: 'constant', value: '0' },
    },
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'fixedQuantity', quantity: '1' },
    risk: [],
    execution: {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    },
    cost: { commissionRate: '0', slippageRate: '0' },
    benchmark: { symbol: '000300', market: 'CN', assetType: 'etf' },
  }) as BacktestStrategy;
  const runConfig = runConfigSchemaV3.parse({
    schemaVersion: '3',
    executionPriceProtocol: {
      protocolVersion: 'execution-price-v1',
      priceBasis: {
        adjustment: 'none',
        method: 'provider-native',
        methodVersion: 'provider-reported-v1',
        basisScope: 'provider-defined',
        anchor: null,
        revision: {
          origin: 'local-observation',
          contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        observedAt: '2024-01-01T00:00:00.000Z',
        quantityBasis: 'actual-units',
        volumeBasis: 'original',
        dividendMeaning: 'explicit-cash',
        dividendEvidenceRef: null,
        conversionAvailable: false,
        conversionEvidenceRef: null,
        derivation: null,
      },
      accountingBasis: 'raw-events',
      history: {
        basis: 'point-in-time',
        reconstructionEvidenceRef: 'original-bar-availability-v1',
      },
    },
    startDate: '2026-01-01',
    endDate: '2026-02-01',
    dataAsOf: '2026-02-02T00:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
  });
  return { strategy, runConfig };
}

describe('Run-owned DataSnapshot', () => {
  it('canonicalizes manifests, closes dependencies, and includes warmup range', () => {
    const { strategy, runConfig } = contracts();
    expect(canonicalizeManifest({ b: 2, a: 1 })).toBe(canonicalizeManifest({ a: 1, b: 2 }));
    const closure = deriveSnapshotDependencyClosure(strategy, runConfig);
    expect(closure.signalSources).toEqual(['cn-close', 'us-close']);
    expect(closure.requiredFx).toEqual(['USD/CNY']);
    expect(closure.lookbackPeriods).toBe(5);
    const base = buildCurrentSnapshotBase(strategy, runConfig);
    expect(base.dateRange.warmupStartDate < runConfig.startDate).toBe(true);
    expect(base.warmup.rangePolicyVersion).toBe('calendar-aware-conservative-v1');
  });
});
