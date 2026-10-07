import { describe, expect, it } from 'vitest';
import {
  calculateBuyAndHoldReturn,
  compareBacktestBenchmarkCompatibility,
  type BacktestBenchmarkCompatibilityIdentity,
} from '../src/backtest-benchmark-compatibility.js';

const identity = (
  overrides: Partial<BacktestBenchmarkCompatibilityIdentity> = {},
): BacktestBenchmarkCompatibilityIdentity => ({
  priceProtocol: { version: 'execution-price-v1', adjustment: 'qfq' },
  returnProtocol: { version: 'total-return-v1', window: ['2025-01-01', '2025-01-31'] },
  historyProtocol: { basis: 'fixed-provider-snapshot' },
  costAssumption: { kind: 'zero-cost', version: 'benchmark-cost-v1' },
  source: { fingerprint: 'market-input-a' },
  dividendAssumption: { treatment: 'provider-adjusted-no-cash-injection' },
  ...overrides,
});

describe('backtest benchmark compatibility', () => {
  it('treats equivalent facts with different object key order as compatible', () => {
    const strategy = identity({
      priceProtocol: { adjustment: 'qfq', version: 'execution-price-v1' },
    });
    const benchmark = identity({
      priceProtocol: { version: 'execution-price-v1', adjustment: 'qfq' },
    });

    const result = compareBacktestBenchmarkCompatibility(strategy, benchmark);

    expect(result.status).toBe('compatible');
    expect(result.strategyFingerprint).toBe(result.benchmarkFingerprint);
    expect(result.missingFields).toEqual([]);
    expect(result.differentFields).toEqual([]);
  });

  it('refuses different price, return, history, cost, source, and dividend facts', () => {
    const strategy = identity();
    const differentFacts: Partial<BacktestBenchmarkCompatibilityIdentity>[] = [
      { priceProtocol: { version: 'execution-price-v2' } },
      { returnProtocol: { version: 'total-return-v2' } },
      { historyProtocol: { basis: 'point-in-time' } },
      {
        costAssumption: {
          kind: 'proportional',
          version: 'cost-v1',
          commissionRate: '0.01',
          slippageRate: '0',
        },
      },
      { source: { fingerprint: 'market-input-b' } },
      { dividendAssumption: { treatment: 'explicit-cash' } },
    ];

    for (const override of differentFacts) {
      const result = compareBacktestBenchmarkCompatibility(strategy, identity(override));
      expect(result.status).toBe('incompatible');
      expect(result.differentFields).toHaveLength(1);
    }
  });

  it('leaves comparison unverified when any required frozen fact is missing', () => {
    const result = compareBacktestBenchmarkCompatibility(
      identity({ historyProtocol: undefined }),
      identity(),
    );

    expect(result.status).toBe('unverified');
    expect(result.missingFields).toEqual(['historyProtocol']);
    expect(result.strategyFingerprint).toBeUndefined();
  });
});

describe('buy-and-hold cost assumptions', () => {
  it('keeps the legacy zero-cost return and applies proportional entry and exit costs', () => {
    const zeroCost = calculateBuyAndHoldReturn('10', '12', {
      kind: 'zero-cost',
      version: 'legacy-v2-zero-cost',
    });
    const proportional = calculateBuyAndHoldReturn('10', '12', {
      kind: 'proportional',
      version: 'proportional-v1',
      commissionRate: '0.01',
      slippageRate: '0.02',
    });

    expect(zeroCost).toEqual({ status: 'available', value: '0.2' });
    expect(proportional.status).toBe('available');
    if (proportional.status === 'available') expect(Number(proportional.value)).toBeLessThan(0.2);
  });

  it('fails closed for unsupported, invalid, or non-positive initial assumptions', () => {
    expect(
      calculateBuyAndHoldReturn('10', '12', {
        kind: 'unsupported',
        version: 'flat-fees-v1',
        fingerprint: 'frozen-fee-model',
      }),
    ).toEqual({ status: 'unavailable', reason: 'BENCHMARK_COST_MODEL_UNSUPPORTED' });
    expect(
      calculateBuyAndHoldReturn('10', '12', {
        kind: 'proportional',
        version: 'proportional-v1',
        commissionRate: '1',
        slippageRate: '0',
      }),
    ).toEqual({ status: 'unavailable', reason: 'INVALID_BENCHMARK_COST_ASSUMPTION' });
    expect(
      calculateBuyAndHoldReturn('0', '12', { kind: 'zero-cost', version: 'zero-cost-v1' }),
    ).toEqual({ status: 'unavailable', reason: 'ZERO_INITIAL_BENCHMARK' });
  });
});
