import { describe, expect, it, vi } from 'vitest';
import { StrategyOptimizationCandidateService } from '../../src/strategy-optimization/strategy-optimization-candidate.service.js';
import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import {
  applyOptimizationProposal,
  describeStrategyParameters,
} from '../../src/strategy-optimization/strategy-optimization-parameters.js';

const baseline = strategySchema.parse({
  schemaVersion: 'strategy-definition-v1',
  name: '参数优化基线',
  signalSources: [
    {
      priceCoordinate: 'run',
      id: 'close',
      asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      timeframe: '1d',
      series: ['close'],
    },
  ],
  executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
  primaryTimeframe: '1d',
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'close', field: 'close' },
    right: { type: 'constant', value: '1' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'percentOfEquity', percent: '0.5' },
  risk: [
    { type: 'fixedStop', percent: '0.08' },
    { type: 'fixedTakeProfit', percent: '0.2' },
  ],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0.0003', slippageRate: '0.001' },
}) as BacktestStrategy;

describe('strategy optimization parameters', () => {
  it('exposes stable parameter ids and authorized optimization ranges', () => {
    const descriptors = describeStrategyParameters(baseline);
    expect(descriptors.map((item) => item.parameterId)).toEqual(
      expect.arrayContaining([
        'risk.0.percent',
        'risk.1.percent',
        'sizing.percent',
        'cost.commissionRate',
        'cost.slippageRate',
      ]),
    );
    expect(descriptors.find((item) => item.parameterId === 'risk.0.percent')).toMatchObject({
      optimizationRange: { min: '0.01', max: '0.3', step: '0.005' },
    });
  });

  it('applies only explicitly authorized parameter changes and reparses V2 schema', () => {
    const descriptors = describeStrategyParameters(baseline);
    const candidate = applyOptimizationProposal(baseline, descriptors, ['risk.0.percent'], {
      changes: [{ parameterId: 'risk.0.percent', value: '0.1' }],
      reason: '提高止损阈值',
      evidenceRefs: [],
    });
    expect(candidate.risk[0]).toMatchObject({ type: 'fixedStop', percent: '0.1' });
    expect(candidate.risk[1]).toEqual(baseline.risk[1]);
  });

  it('rejects unauthorized, out-of-range and off-step values', () => {
    const descriptors = describeStrategyParameters(baseline);
    const proposal = (parameterId: string, value: string) => ({
      changes: [{ parameterId, value }],
      reason: 'test',
      evidenceRefs: [],
    });
    expect(() =>
      applyOptimizationProposal(
        baseline,
        descriptors,
        ['risk.0.percent'],
        proposal('risk.1.percent', '0.3'),
      ),
    ).toThrow(/参数未授权/);
    expect(() =>
      applyOptimizationProposal(
        baseline,
        descriptors,
        ['risk.0.percent'],
        proposal('risk.0.percent', '0.305'),
      ),
    ).toThrow(/超出授权范围/);
    expect(() =>
      applyOptimizationProposal(
        baseline,
        descriptors,
        ['risk.0.percent'],
        proposal('risk.0.percent', '0.012'),
      ),
    ).toThrow(/不符合授权步长/);
  });
});

describe('授权步长的精确边界', () => {
  const parameterId = 'risk.0.percent';
  const proposal = (value: string | number) => ({
    changes: [{ parameterId, value }],
    reason: '核对授权步长',
    evidenceRefs: [],
  });

  it.each(['0.1000000000000000001', '0.0999999999999999999', '0.0100000000000000000000001'])(
    '拒绝靠近授权点的非整步 %s',
    (value) => {
      expect(() =>
        applyOptimizationProposal(
          baseline,
          describeStrategyParameters(baseline),
          [parameterId],
          proposal(value),
        ),
      ).toThrow(/不符合授权步长/);
    },
  );

  it.each(['0.01', '0.3', '0.1000'])('合法整步 %s 保留原始文本和基线', (value) => {
    const before = structuredClone(baseline);
    const candidate = applyOptimizationProposal(
      baseline,
      describeStrategyParameters(baseline),
      [parameterId],
      proposal(value),
    );
    expect(candidate.risk[0]).toEqual({ type: 'fixedStop', percent: value });
    expect(candidate.risk[1]).toEqual(baseline.risk[1]);
    expect(baseline).toEqual(before);
  });

  it.each(['0', '-0.005'])('非正步长 %s 用业务错误拒绝', (step) => {
    const descriptors = describeStrategyParameters(baseline).map((descriptor) =>
      descriptor.parameterId === parameterId
        ? { ...descriptor, optimizationRange: { min: '0.01', max: '0.3', step } }
        : descriptor,
    );
    expect(() =>
      applyOptimizationProposal(baseline, descriptors, [parameterId], proposal('0.01')),
    ).toThrow(/不符合授权步长/);
  });

  it('整数周期继续校验类型并按整步提交', () => {
    const withPeriod = strategySchema.parse({
      ...baseline,
      risk: [...baseline.risk, { type: 'maxHoldingPeriod', periods: 10 }],
    }) as BacktestStrategy;
    const periodId = 'risk.2.periods';
    const change = (value: string | number) => ({
      ...proposal(value),
      changes: [{ parameterId: periodId, value }],
    });
    const descriptors = describeStrategyParameters(withPeriod);
    expect(
      applyOptimizationProposal(withPeriod, descriptors, [periodId], change(20)).risk[2],
    ).toEqual({ type: 'maxHoldingPeriod', periods: 20 });
    expect(() =>
      applyOptimizationProposal(withPeriod, descriptors, [periodId], change('20')),
    ).toThrow(/必须是整数/);
  });

  it('候选入口在存储和回测之前拒绝非整步提案', async () => {
    const storage = vi.fn(() => {
      throw new Error('不应访问候选存储');
    });
    const evaluateCandidateSplit = vi.fn();
    const service = new StrategyOptimizationCandidateService(
      { $queryRaw: storage, $executeRaw: storage } as never,
      {} as never,
      { evaluateCandidateSplit } as never,
    );
    await expect(
      service.createAndEvaluateCandidate(
        {
          id: 'step-experiment',
          sourceMode: 'existing',
          allowedParameterIds: [parameterId],
        } as never,
        { strategy: baseline } as never,
        describeStrategyParameters(baseline),
        'controlled-model',
        proposal('0.1000000000000000001'),
      ),
    ).rejects.toThrow(/不符合授权步长/);
    expect(storage).not.toHaveBeenCalled();
    expect(evaluateCandidateSplit).not.toHaveBeenCalled();
  });
});
