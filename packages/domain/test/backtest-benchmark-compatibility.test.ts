import { describe, expect, it } from 'vitest';
import {
  calculateBuyAndHoldReturn,
  compareBacktestBenchmarkCompatibility,
  deterministicResultChecksum,
  type BacktestBenchmarkCostAssumption,
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

describe('执行模型型基准成本身份', () => {
  const rules = {
    currency: 'CNY',
    collection: 'perFillPerCharge',
    rounding: { mode: 'halfUp', decimalPlaces: 2 },
    slippageRate: '0',
    segments: [
      {
        from: '2023-08-23',
        toExclusive: '2023-08-28',
        commission: { side: 'both', rate: '0.0003', minimum: '5' },
        stampDuty: { side: 'sell', rate: '0.001' },
        transferFee: { side: 'both', rate: '0.00001' },
        regulatoryFee: { treatment: 'includedInCommission' },
        handlingFee: { treatment: 'includedInCommission' },
      },
      {
        from: '2023-08-28',
        toExclusive: '2023-08-30',
        commission: { side: 'both', rate: '0.0003', minimum: '5' },
        stampDuty: { side: 'sell', rate: '0.0005' },
        transferFee: { side: 'both', rate: '0.00001' },
        regulatoryFee: { treatment: 'includedInCommission' },
        handlingFee: { treatment: 'includedInCommission' },
      },
    ],
  };
  const assumption = (frozenRules = rules): BacktestBenchmarkCostAssumption => ({
    kind: 'execution-model',
    version: 'frozen-execution-cost-v1',
    fingerprint: deterministicResultChecksum(frozenRules),
  });

  it('同费则允许策略与基准有不同成交和已付费用', () => {
    const strategy = { cost: assumption(rules), fills: 4, paidFees: '35.25' };
    const benchmark = { cost: assumption(structuredClone(rules)), fills: 2, paidFees: '110.00' };
    const report = compareBacktestBenchmarkCompatibility(
      identity({ costAssumption: strategy.cost }),
      identity({ costAssumption: benchmark.cost }),
    );
    expect(strategy.paidFees).not.toBe(benchmark.paidFees);
    expect(report).toMatchObject({ status: 'compatible', differentFields: [], missingFields: [] });
    expect(report.strategyFingerprint).toBe(report.benchmarkFingerprint);
  });

  it.each(['minimum', 'side', 'effectiveDate', 'includedFee', 'slippage', 'rounding'] as const)(
    '冻结费用设置变化必须产生不同成本身份：%s',
    (field) => {
      const changed = structuredClone(rules);
      const first = changed.segments[0]!;
      if (field === 'minimum') first.commission.minimum = '6';
      else if (field === 'side') first.stampDuty.side = 'both';
      else if (field === 'effectiveDate') first.toExclusive = '2023-08-27';
      else if (field === 'includedFee') first.handlingFee.treatment = 'charged';
      else if (field === 'slippage') changed.slippageRate = '0.001';
      else changed.rounding.decimalPlaces = 3;
      expect(
        compareBacktestBenchmarkCompatibility(
          identity({ costAssumption: assumption(rules) }),
          identity({ costAssumption: assumption(changed) }),
        ),
      ).toMatchObject({ status: 'incompatible', differentFields: ['costAssumption'] });
    },
  );

  it('同一指纹的不同计算版本不能声明兼容', () => {
    const cost = assumption();
    expect(
      compareBacktestBenchmarkCompatibility(
        identity({ costAssumption: cost }),
        identity({ costAssumption: { ...cost, version: 'frozen-execution-cost-v2' } }),
      ),
    ).toMatchObject({ status: 'incompatible', differentFields: ['costAssumption'] });
  });

  it('执行模型身份不等同于旧比例或不支持摘要，即使版本相同', () => {
    const cost = assumption();
    for (const oldCost of [
      {
        kind: 'unsupported',
        version: cost.version,
        fingerprint: deterministicResultChecksum(rules),
      },
      { kind: 'proportional', version: cost.version, commissionRate: '0.0003', slippageRate: '0' },
    ] satisfies BacktestBenchmarkCostAssumption[]) {
      expect(
        compareBacktestBenchmarkCompatibility(
          identity({ costAssumption: cost }),
          identity({ costAssumption: oldCost }),
        ),
      ).toMatchObject({ status: 'incompatible', differentFields: ['costAssumption'] });
    }
  });

  it('两点价格快捷算法要求真实执行模型，不能猜算最低额或卖侧税', () => {
    expect(calculateBuyAndHoldReturn('10', '12', assumption())).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_EXECUTION_MODEL_REQUIRED',
    });
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
