import type { StrategyVersion } from '../src/features/strategy/strategy.types';

const tiny = '0.' + '0'.repeat(399) + '1';
export const strategySummarySamples = [
  { name: 'ordinary', ratio: '0.25', cost: '0.0003', expected: '25%', costExpected: '0.03%' },
  {
    name: 'rounding',
    ratio: '0.01000499999999999999999',
    cost: '0.01000499999999999999999',
    expected: '1%',
    costExpected: '1%',
  },
  { name: 'tiny', ratio: tiny, cost: tiny, expected: '1E-398%', costExpected: '1E-398%' },
  {
    name: 'target',
    ratio: '0.123456',
    cost: '0.123456',
    expected: '12.346%',
    costExpected: '12.346%',
    target: true,
  },
  { name: 'grouped', ratio: '0.25', cost: '10', expected: '25%', costExpected: '1,000%' },
  {
    name: 'huge',
    ratio: '0.25',
    cost: '1' + '0'.repeat(400),
    expected: '25%',
    costExpected: '1E402%',
  },
  { name: 'zero', ratio: '0.25', cost: '0', expected: '25%', costExpected: '0%' },
] as const;

export function strategySummaryVersion(
  ratio: string,
  cost = ratio,
  target = false,
): StrategyVersion {
  const source = { type: 'series', sourceId: 'daily', field: 'close' };
  return {
    id: 'ratio-version',
    version: 3,
    schemaVersion: 1,
    schema: {
      schemaVersion: 'strategy-definition-v1',
      name: '精度验收策略',
      description: '冻结说明：仓位 0.00%',
      signalSources: [
        {
          id: 'daily',
          priceCoordinate: 'run',
          asset: { symbol: '510300.SH', market: 'CN', assetType: 'etf' },
          timeframe: '1d',
          series: ['close'],
        },
      ],
      executionInstrument: { symbol: '510300.SH', market: 'CN', assetType: 'etf' },
      primaryTimeframe: '1d',
      entry: {
        type: 'compare',
        operator: 'gt',
        left: source,
        right: { type: 'constant', value: '0' },
      },
      exit: {
        type: 'compare',
        operator: 'lt',
        left: source,
        right: { type: 'constant', value: '0' },
      },
      sizing: target
        ? { type: 'targetWeight', weight: ratio }
        : { type: 'percentOfEquity', percent: ratio },
      risk: [
        { type: 'fixedStop', percent: ratio },
        { type: 'fixedTakeProfit', percent: ratio },
      ],
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: cost, slippageRate: cost },
    },
  };
}
