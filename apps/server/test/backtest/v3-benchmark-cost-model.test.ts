import { describe, expect, it } from 'vitest';
import { benchmarkExecutionModelCostVersionV3 } from '@thesis-ledger/schemas';
import {
  calculateBacktestV3BenchmarkReturn,
  resolveBacktestV3BenchmarkCost,
} from '../../src/backtest/backtest-v3-benchmark-cost.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const inputs = async () => {
  const { input } = await completeSnapshotFixture();
  const { runConfig, strategy } = input;
  const model = runConfig.executionModel!;
  const first = model.segments[0]!;
  if (first.execution.mode !== 'exchange' || !first.fees) throw new Error('需要交易所费用');
  const fee = (side: 'buy' | 'sell' | 'both', rate: string) => ({
    treatment: 'charged' as const,
    side,
    rate,
    basis: 'turnover' as const,
    currency: 'CNY' as const,
    minimum: { kind: 'none' as const },
  });
  first.fees = {
    ...first.fees,
    commission: { ...fee('both', '0.0003'), minimum: { kind: 'amount', amount: '5' } },
    stampDuty: fee('sell', '0.001'),
    transferFee: fee('both', '0'),
    handlingFee: { treatment: 'includedInCommission', reason: '佣金含经手费' },
    regulatoryFee: { treatment: 'includedInCommission', reason: '佣金含监管费' },
  };
  first.range = { start: '2026-05-18', end: '2026-05-19' };
  const last = structuredClone(first);
  last.id = 'after-change';
  last.range = { start: '2026-05-20', end: '2026-05-20' };
  last.fees.stampDuty = fee('sell', '0.0005');
  model.segments = [first, last];
  runConfig.initialCash = { CNY: '100' };
  strategy.cost.slippageRate = '0';
  return {
    first,
    last,
    model,
    input: {
      runConfig,
      strategy,
      firstClose: '10',
      firstOccurredAt: '2026-05-18T07:00:00.000Z',
      lastClose: '12',
      lastOccurredAt: '2026-05-20T07:00:00.000Z',
      costVersion: benchmarkExecutionModelCostVersionV3,
    },
  };
};

describe('冻结执行模型基准成本解析', () => {
  it.each(['minimum', 'proportional', 'zero'] as const)(
    '保持改动前实际构建产物的历史成本身份与金额：%s',
    async (kind) => {
      const { input, model } = await inputs();
      if (kind !== 'minimum') {
        for (const segment of model.segments) {
          if (!segment.fees) throw new Error('费用缺失');
          segment.fees.commission.minimum = { kind: 'none' };
          segment.fees.commission.rate = kind === 'zero' ? '0' : '0.0003';
          segment.fees.stampDuty = {
            ...segment.fees.commission,
            rate: kind === 'zero' ? '0' : '0.0002',
          };
        }
      }
      const result = resolveBacktestV3BenchmarkCost({ ...input, costVersion: undefined });
      if (kind === 'minimum') {
        expect(result.assumption).toEqual({
          kind: 'unsupported',
          version: 'execution-model-v1:cn-600519-research-2024q1:1:76f319a0c0db03c0',
          fingerprint: '4de42a4eb2281418',
        });
        expect(result.result).toEqual({
          status: 'unavailable',
          reason: 'BENCHMARK_COST_MODEL_UNSUPPORTED',
        });
      } else if (kind === 'proportional') {
        expect(result.assumption).toEqual({
          kind: 'proportional',
          version: 'execution-model-v2:cn-600519-research-2024q1:1:f77e66f69cfcb97c',
          commissionRate: '0.0005',
          slippageRate: '0',
        });
        expect(result.result).toMatchObject({
          status: 'available',
          value: '0.1988',
          quantity: '9.995',
          buyFees: '0.05',
          sellFees: '0.06',
          finalCash: '119.88',
        });
      } else {
        expect(result.assumption).toEqual({
          kind: 'zero-cost',
          version:
            'v3-explicit-zero-cost:execution-model-v2:cn-600519-research-2024q1:1:e35bc88c5d2b02c6',
        });
        expect(result.result).toMatchObject({
          status: 'available',
          value: '0.2',
          quantity: '10',
          buyFees: '0',
          sellFees: '0',
          finalCash: '120',
        });
      }
      expect(result.identityAssumption).toEqual(result.assumption);
    },
  );
  it('独立核对最低佣金、卖侧税与历史变化，含规费项目不重复扣收', async () => {
    const { input } = await inputs();
    const result = resolveBacktestV3BenchmarkCost(input);
    expect(result.assumption).toMatchObject({
      kind: 'execution-model',
      version: 'execution-model-cost-v1',
    });
    expect(result.result).toEqual({
      status: 'available',
      value: '0.0894',
      quantity: '9.5',
      initialCash: '100',
      buyGross: '95',
      buyFees: '5',
      buyDebit: '100',
      residualCash: '0',
      sellGross: '114',
      sellFees: '5.06',
      finalCash: '108.94',
    });
    const beforeChange = resolveBacktestV3BenchmarkCost({
      ...input,
      lastOccurredAt: '2026-05-19T07:00:00.000Z',
    });
    expect(beforeChange.result).toMatchObject({ sellFees: '5.11', finalCash: '108.89' });
  });

  it('同费则与滑点的身份不依赖初始现金、实际价格或成交金额', async () => {
    const { input } = await inputs();
    const first = resolveBacktestV3BenchmarkCost(input);
    const differentCapital = resolveBacktestV3BenchmarkCost({
      ...input,
      runConfig: { ...input.runConfig, initialCash: { CNY: '200' } },
      firstClose: '11',
    });
    expect(differentCapital.assumption).toEqual(first.assumption);
    expect(differentCapital.result).not.toEqual(first.result);
  });

  it('完整分段身份覆盖中间规则，不能只绑定基准首末成交费段', async () => {
    const { input, model, first } = await inputs();
    first.range.end = '2026-05-18';
    const middle = structuredClone(first);
    middle.id = 'middle';
    middle.range = { start: '2026-05-19', end: '2026-05-19' };
    model.segments.splice(1, 0, middle);
    const before = resolveBacktestV3BenchmarkCost(input);
    middle.fees.commission.minimum = { kind: 'amount', amount: '6' };
    const after = resolveBacktestV3BenchmarkCost(input);
    expect(after.result).toEqual(before.result);
    expect(after.assumption).not.toEqual(before.assumption);
  });

  it.each(['side', 'included', 'rounding', 'slippage'] as const)(
    '完整成本身份随计算设置变化：%s',
    async (change) => {
      const { input, first } = await inputs();
      const before = resolveBacktestV3BenchmarkCost(input);
      if (change === 'side' && first.fees.stampDuty.treatment === 'charged')
        first.fees.stampDuty.side = 'both';
      else if (change === 'included')
        first.fees.handlingFee = { ...first.fees.commission, minimum: { kind: 'none' } };
      else if (change === 'slippage') input.strategy.cost.slippageRate = '0.001';
      else if (change === 'rounding')
        first.fees.rounding = {
          mode: 'halfUp',
          decimalPlaces: 3,
        } as unknown as typeof first.fees.rounding;
      expect(resolveBacktestV3BenchmarkCost(input).assumption).not.toEqual(before.assumption);
    },
  );

  it('现金不足支付最低费时局部不可用，不产生负现金或零费用结果', async () => {
    const { input } = await inputs();
    expect(
      resolveBacktestV3BenchmarkCost({
        ...input,
        runConfig: { ...input.runConfig, initialCash: { CNY: '4' } },
      }).result,
    ).toEqual({ status: 'unavailable', reason: 'INSUFFICIENT_CASH' });
    expect(
      resolveBacktestV3BenchmarkCost({
        ...input,
        runConfig: { ...input.runConfig, initialCash: { CNY: '0' } },
      }).result,
    ).toEqual({ status: 'unavailable', reason: 'ZERO_INITIAL_BENCHMARK' });
  });

  it('保留日期覆盖、单币种与真实收费设置保护', async () => {
    const { input, first, last } = await inputs();
    expect(
      resolveBacktestV3BenchmarkCost({ ...input, lastOccurredAt: '2026-05-21T07:00:00.000Z' })
        .result,
    ).toEqual({ status: 'unavailable', reason: 'BENCHMARK_COST_ASSUMPTION_UNAVAILABLE' });
    expect(
      resolveBacktestV3BenchmarkCost({
        ...input,
        runConfig: { ...input.runConfig, initialCash: { CNY: '100', USD: '1' } },
      }).result,
    ).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_MULTICURRENCY_INITIAL_CASH_UNSUPPORTED',
    });
    expect(
      calculateBacktestV3BenchmarkReturn({
        initialCash: '100',
        firstClose: '10',
        lastClose: '12',
        slippageRate: '0',
        currency: 'CNY',
        buyFees: { ...first.fees, currency: 'HKD' },
        sellFees: last.fees,
      }),
    ).toEqual({ status: 'unavailable', reason: 'INVALID_BENCHMARK_COST_ASSUMPTION' });
  });

  it('缺版本时保留旧最低费拒绝，未知版本不回退成旧模型', async () => {
    const { input } = await inputs();
    const legacy = resolveBacktestV3BenchmarkCost({ ...input, costVersion: undefined });
    expect(legacy.assumption.kind).toBe('unsupported');
    expect(legacy.result).toEqual({
      status: 'unavailable',
      reason: 'BENCHMARK_COST_MODEL_UNSUPPORTED',
    });
    expect(
      resolveBacktestV3BenchmarkCost({
        ...input,
        costVersion: 'unknown' as typeof input.costVersion,
      }).result,
    ).toEqual({ status: 'unavailable', reason: 'BENCHMARK_COST_VERSION_UNSUPPORTED' });
  });
});
