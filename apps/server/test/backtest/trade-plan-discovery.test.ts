import { describe, expect, it } from 'vitest';
import { backtestTradePlanLines, strategyRequiredLookback } from '@thesis-ledger/domain';
import {
  assembleDiscoveryGeneration,
  createDiscoverySeed,
} from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { collectUsedSignalSources } from '../../src/backtest/backtest-dependency-price.js';

describe('精简真实入口的计划装配与依赖', () => {
  it('装配保留计划，ATR来源依赖与预热不因未出现在entry/exit而消失', () => {
    const scope = {
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
    } as const;
    const seed = createDiscoverySeed(scope, true);
    const tradePlan = {
      version: 1,
      evaluation: 'barClose',
      initialStop: {
        activation: { kind: 'immediate' },
        kind: 'entryAtr',
        sourceId: seed.signalSources[0]!.id,
        period: 14,
        multiple: '2',
      },
      riskBudget: { equityFraction: '0.01', maxEquityFraction: '0.5' },
      stages: [],
    };
    const { name, entry, exit, sizing, risk } = seed;
    const result = assembleDiscoveryGeneration({ discoveryScope: scope } as never, seed, {
      strategy: { name, entry, exit, sizing, risk, series: ['high', 'low', 'close'], tradePlan },
    });
    expect(result.strategy.tradePlan).toEqual(tradePlan);
    expect(collectUsedSignalSources(result.strategy)).toMatchObject([
      { fields: ['close', 'high', 'low'] },
    ]);
    expect(strategyRequiredLookback(result.strategy).required).toBeGreaterThanOrEqual(14);
    expect(backtestTradePlanLines(result.strategy.tradePlan, '研究单位').join('\n')).toContain(
      '委托时可见权益 × 1%',
    );
  });
});
