import { describe, expect, it } from 'vitest';
import { buildBacktestAnalytics, type BacktestAnalyticsInput } from '../src/index.js';

const comparisonIdentity = {
  priceProtocol: { version: 'execution-price-v1', adjustment: 'none' },
  returnProtocol: { version: 'total-return-v1', range: 'same-run-window' },
  historyProtocol: { basis: 'point-in-time' },
  costAssumption: { kind: 'zero-cost', version: 'benchmark-cost-v1' },
  source: { fingerprint: 'execution-source-a' },
  dividendAssumption: { treatment: 'explicit-cash' },
} as const;

const baseInput = (overrides: Partial<BacktestAnalyticsInput> = {}): BacktestAnalyticsInput => ({
  runId: 'run-1',
  strategyVersionId: 'strategy-version-1',
  snapshotId: 'snapshot-1',
  contentHash: 'content-hash-1',
  engineVersion: 'engine-v1',
  schemaVersion: '2',
  marketRuleVersion: 'rules-v1',
  calendarVersion: 'calendar-v1',
  aggregationVersion: 'aggregation-v1',
  baseCurrency: 'CNY',
  periodsPerYear: 252,
  equityCurve: [
    { occurredAt: '2025-01-01T00:00:00Z', value: { amount: '100', currency: 'CNY' } },
    { occurredAt: '2025-01-02T00:00:00Z', value: { amount: '120', currency: 'CNY' } },
    { occurredAt: '2025-01-03T00:00:00Z', value: { amount: '90', currency: 'CNY' } },
    { occurredAt: '2025-01-04T00:00:00Z', value: { amount: '135', currency: 'CNY' } },
  ],
  ...overrides,
});

describe('V2 backtest analytics', () => {
  it('builds Decimal equity/drawdown curves and core return risk metrics', () => {
    const result = buildBacktestAnalytics(baseInput());
    expect(result.completeness).toBe('partial');
    expect(result.equityCurve.map((point) => point.value.amount)).toEqual([
      '100',
      '120',
      '90',
      '135',
    ]);
    expect(result.drawdownCurve.map((point) => point.drawdown)).toEqual(['0', '0', '-0.25', '0']);
    expect(result.metrics).toMatchObject({
      totalReturn: { status: 'available', value: '0.35' },
      basicPeriodReturn: { status: 'available', value: '0.35' },
      maxDrawdown: { status: 'available', value: '-0.25' },
      volatility: { status: 'available' },
      sharpe: { status: 'available' },
    });
    expect(result.benchmark).toBeUndefined();
    expect(result.benchmarkCompatibility).toBeUndefined();
  });

  it('未冻结费用假设时拒绝计算执行标的基准收益', () => {
    const result = buildBacktestAnalytics(
      baseInput({
        executionInstrument: {
          symbol: '600519.SH',
          currency: 'CNY',
          prices: [
            { occurredAt: '2025-01-01T00:00:00Z', value: '10' },
            { occurredAt: '2025-01-02T00:00:00Z', value: '11' },
            { occurredAt: '2025-01-03T00:00:00Z', value: '12' },
            { occurredAt: '2025-01-04T00:00:00Z', value: '13' },
          ],
        },
      }),
    );
    expect(result.benchmark).toEqual({
      totalReturn: { status: 'unavailable', reason: 'BENCHMARK_COST_ASSUMPTION_UNAVAILABLE' },
    });
    expect(result.benchmarkCompatibility).toMatchObject({
      status: 'unverified',
      costAssumption: { kind: 'unavailable' },
    });
    expect(result.benchmark?.excessReturn).toBeUndefined();
  });

  it('calculates excess return only when the frozen benchmark identity matches', () => {
    const result = buildBacktestAnalytics(
      baseInput({
        executionInstrument: {
          symbol: '600519.SH',
          currency: 'CNY',
          prices: [
            { occurredAt: '2025-01-01T00:00:00Z', value: '10' },
            { occurredAt: '2025-01-02T00:00:00Z', value: '11' },
            { occurredAt: '2025-01-03T00:00:00Z', value: '12' },
            { occurredAt: '2025-01-04T00:00:00Z', value: '13' },
          ],
        },
        benchmarkComparison: { strategy: comparisonIdentity },
      }),
    );

    expect(result.benchmark).toEqual({
      totalReturn: { status: 'available', value: '0.3' },
      excessReturn: { status: 'available', value: '0.05' },
    });
    expect(result.benchmarkCompatibility).toMatchObject({
      status: 'compatible',
      costAssumption: { kind: 'zero-cost', version: 'benchmark-cost-v1' },
      strategyFingerprint: expect.any(String),
      benchmarkFingerprint: expect.any(String),
    });
    expect(result.benchmarkCompatibility?.strategyFingerprint).toBe(
      result.benchmarkCompatibility?.benchmarkFingerprint,
    );
  });

  it('keeps standalone benchmark return but refuses excess return across sources', () => {
    const result = buildBacktestAnalytics(
      baseInput({
        benchmark: {
          symbol: '600519.SH',
          currency: 'CNY',
          points: [
            { occurredAt: '2025-01-01T00:00:00Z', value: '10' },
            { occurredAt: '2025-01-02T00:00:00Z', value: '11' },
            { occurredAt: '2025-01-03T00:00:00Z', value: '12' },
            { occurredAt: '2025-01-04T00:00:00Z', value: '13' },
          ],
        },
        benchmarkComparison: {
          strategy: comparisonIdentity,
          benchmark: { ...comparisonIdentity, source: { fingerprint: 'benchmark-source-b' } },
        },
      }),
    );

    expect(result.benchmark).toEqual({
      totalReturn: { status: 'available', value: '0.3' },
      excessReturn: { status: 'unavailable', reason: 'BENCHMARK_COMPARISON_INCOMPATIBLE' },
    });
    expect(result.benchmarkCompatibility).toMatchObject({
      status: 'incompatible',
      differentFields: ['source'],
    });
  });

  it('does not assume zero costs when a new comparison omits frozen cost facts', () => {
    const result = buildBacktestAnalytics(
      baseInput({
        executionInstrument: {
          symbol: '600519.SH',
          currency: 'CNY',
          prices: [
            { occurredAt: '2025-01-01T00:00:00Z', value: '10' },
            { occurredAt: '2025-01-02T00:00:00Z', value: '11' },
            { occurredAt: '2025-01-03T00:00:00Z', value: '12' },
            { occurredAt: '2025-01-04T00:00:00Z', value: '13' },
          ],
        },
        benchmarkComparison: { strategy: { priceProtocol: comparisonIdentity.priceProtocol } },
      }),
    );

    expect(result.benchmark).toMatchObject({
      totalReturn: { status: 'unavailable', reason: 'BENCHMARK_COST_ASSUMPTION_UNAVAILABLE' },
      excessReturn: { status: 'unavailable', reason: 'BENCHMARK_COMPARISON_UNVERIFIED' },
    });
    expect(result.benchmarkCompatibility).toMatchObject({
      status: 'unverified',
      costAssumption: { kind: 'unavailable' },
      missingFields: [
        'returnProtocol',
        'historyProtocol',
        'costAssumption',
        'source',
        'dividendAssumption',
      ],
    });
  });

  it('leaves an explicit benchmark unverified when its identity is missing', () => {
    const result = buildBacktestAnalytics(
      baseInput({
        benchmark: {
          symbol: '600519.SH',
          currency: 'CNY',
          points: [
            { occurredAt: '2025-01-01T00:00:00Z', value: '10' },
            { occurredAt: '2025-01-02T00:00:00Z', value: '11' },
            { occurredAt: '2025-01-03T00:00:00Z', value: '12' },
            { occurredAt: '2025-01-04T00:00:00Z', value: '13' },
          ],
        },
        benchmarkComparison: { strategy: comparisonIdentity },
      }),
    );

    expect(result.benchmark).toMatchObject({
      totalReturn: { status: 'unavailable', reason: 'BENCHMARK_COST_ASSUMPTION_UNAVAILABLE' },
      excessReturn: { status: 'unavailable', reason: 'BENCHMARK_COMPARISON_UNVERIFIED' },
    });
    expect(result.benchmarkCompatibility).toMatchObject({
      status: 'unverified',
      missingFields: [
        'priceProtocol',
        'returnProtocol',
        'historyProtocol',
        'costAssumption',
        'source',
        'dividendAssumption',
      ],
      costAssumption: { kind: 'unavailable' },
    });
  });

  it('rejects fixed-cost benchmark models until their order sizing is modeled', () => {
    const fixedFeeIdentity = {
      ...comparisonIdentity,
      costAssumption: {
        kind: 'unsupported',
        version: 'fixed-minimum-fee-v1',
        fingerprint: 'frozen-fixed-fee-input',
      },
    } as const;
    const result = buildBacktestAnalytics(
      baseInput({
        executionInstrument: {
          symbol: '600519.SH',
          currency: 'CNY',
          prices: [
            { occurredAt: '2025-01-01T00:00:00Z', value: '10' },
            { occurredAt: '2025-01-02T00:00:00Z', value: '11' },
            { occurredAt: '2025-01-03T00:00:00Z', value: '12' },
            { occurredAt: '2025-01-04T00:00:00Z', value: '13' },
          ],
        },
        benchmarkComparison: { strategy: fixedFeeIdentity },
      }),
    );

    expect(result.benchmark).toMatchObject({
      totalReturn: { status: 'unavailable', reason: 'BENCHMARK_COST_MODEL_UNSUPPORTED' },
      excessReturn: { status: 'unavailable', reason: 'BENCHMARK_RETURN_UNAVAILABLE' },
    });
    expect(result.benchmarkCompatibility).toMatchObject({
      status: 'compatible',
      costAssumption: fixedFeeIdentity.costAssumption,
    });
  });

  it('全胜交易仅使 profit factor 为无穷，不降低数据完整性', () => {
    const result = buildBacktestAnalytics(
      baseInput({
        trades: [
          {
            source: 'BACKTEST',
            executionSymbol: '159516.SZ',
            openedAt: '2025-01-01T00:00:00Z',
            closedAt: '2025-01-02T00:00:00Z',
            entryQuantity: '100',
            exitQuantity: '100',
            entryValue: { amount: '100', currency: 'CNY' },
            exitValue: { amount: '120', currency: 'CNY' },
            realizedPnl: { amount: '20', currency: 'CNY' },
            charges: [],
            returnRate: '0.2',
            closeReason: 'signal',
            fillIds: ['buy-1', 'sell-1'],
          },
        ],
      }),
    );

    expect(result.metrics.profitFactor).toEqual({
      status: 'unavailable',
      reason: 'NO_LOSING_TRADES',
    });
    expect(result.completeness).toBe('complete');
  });

  it('returns unavailable benchmark with warning when foreign FX is missing', () => {
    const result = buildBacktestAnalytics(
      baseInput({
        executionInstrument: {
          symbol: '0700.HK',
          currency: 'HKD',
          prices: [
            { occurredAt: '2025-01-01T00:00:00Z', value: '10' },
            { occurredAt: '2025-01-02T00:00:00Z', value: '11' },
          ],
        },
      }),
    );
    expect(result.benchmark).toMatchObject({
      totalReturn: { status: 'unavailable', reason: 'FX_UNAVAILABLE' },
    });
    expect(result.warnings).toEqual([
      'FX_UNAVAILABLE:0700.HK:2025-01-01T00:00:00Z',
      'FX_UNAVAILABLE:0700.HK:2025-01-02T00:00:00Z',
      'FX_UNAVAILABLE:0700.HK:2025-01-03T00:00:00Z',
      'FX_UNAVAILABLE:0700.HK:2025-01-04T00:00:00Z',
      'BENCHMARK_UNAVAILABLE',
    ]);
  });

  it('rejects more than one benchmark and reports insufficient samples', () => {
    const onePoint = baseInput({
      equityCurve: [
        { occurredAt: '2025-01-01T00:00:00Z', value: { amount: '100', currency: 'CNY' } },
      ],
      benchmark: [
        { symbol: 'A', currency: 'CNY', points: [] },
        { symbol: 'B', currency: 'CNY', points: [] },
      ],
    });
    const result = buildBacktestAnalytics(onePoint);
    expect(result.completeness).toBe('partial');
    expect(result.metrics.totalReturn).toMatchObject({ status: 'unavailable' });
    expect(result.benchmark).toEqual({
      totalReturn: { status: 'unavailable', reason: 'MAX_ONE_BENCHMARK' },
    });
    expect(result.warnings).toContain('MULTIPLE_BENCHMARKS');
  });

  it('changes checksum when reproducibility metadata changes and is stable otherwise', () => {
    const first = buildBacktestAnalytics(baseInput());
    const second = buildBacktestAnalytics(baseInput());
    const changed = buildBacktestAnalytics(baseInput({ calendarVersion: 'calendar-v2' }));
    expect(first.resultChecksum).toBe(second.resultChecksum);
    expect(first.resultChecksum).not.toBe(changed.resultChecksum);
  });
});
