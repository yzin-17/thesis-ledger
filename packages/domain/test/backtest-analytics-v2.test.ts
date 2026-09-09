import { describe, expect, it } from 'vitest';
import { buildBacktestAnalytics, type BacktestAnalyticsInput } from '../src/index.js';

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
  });

  it('uses the execution instrument as the default buy-and-hold benchmark', () => {
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
    expect(result.benchmark).toEqual({ totalReturn: { status: 'available', value: '0.3' } });
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
