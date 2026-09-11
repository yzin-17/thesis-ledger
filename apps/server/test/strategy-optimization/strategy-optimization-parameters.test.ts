import { describe, expect, it } from 'vitest';
import { strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import {
  applyOptimizationProposal,
  describeStrategyParameters,
} from '../../src/strategy-optimization/strategy-optimization-parameters.js';

const baseline = strategySchemaV2.parse({
  schemaVersion: '2',
  name: '参数优化基线',
  signalSources: [
    {
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
}) as StrategySchemaV2;

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
    const candidate = applyOptimizationProposal(
      baseline,
      descriptors,
      ['risk.0.percent'],
      {
        changes: [{ parameterId: 'risk.0.percent', value: '0.1' }],
        reason: '提高止损阈值',
        evidenceRefs: [],
      },
    );
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
