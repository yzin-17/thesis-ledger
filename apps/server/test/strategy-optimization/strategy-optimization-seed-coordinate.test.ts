import { describe, expect, it } from 'vitest';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { createNormalizedRunConfig } from './strategy-optimization-postgres-fixtures.js';

const scope = {
  executionInstrument: { symbol: '600519.SH', market: 'CN' as const, assetType: 'stock' as const },
  primaryTimeframe: '1d' as const,
};

const planWithNormalizedFacts = (strategy: BacktestStrategy) => {
  const runConfig = createNormalizedRunConfig();
  const coordinate = {
    coordinateId: 'execution-series',
    currency: 'CNY' as const,
    priceBasis: runConfig.executionPriceProtocol.priceBasis,
  };
  return planBacktestDependencies({
    strategy,
    runConfig,
    ruleCompatibilityFacts: {
      executionCoordinate: coordinate,
      sourceCoordinates: { 'discovery-primary': coordinate },
      executionUnits: {
        realLotSize: '100',
        realTickSize: '0.01',
        actualQuantityConversion: { available: false, evidenceRef: null },
      },
    },
  });
};

describe('探索种子的价格坐标兼容', () => {
  it('在没有真实单位转换证据的归一化窗口中允许参考种子回测', () => {
    const result = planWithNormalizedFacts(createDiscoverySeed(scope));

    expect(result.status).toBe('planned');
    expect(result.ruleCompatibility.status).toBe('compatible');
    expect(result.ruleCompatibility.issues).toEqual([]);
  });

  it('继续拒绝将绝对价格阈值用于没有转换证据的归一化窗口', () => {
    const seed = createDiscoverySeed(scope);
    const result = planWithNormalizedFacts({
      ...seed,
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'discovery-primary', field: 'close' },
        right: { type: 'constant', value: '0' },
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.ruleCompatibility.status).toBe('blocked');
    expect(result.ruleCompatibility.issues).toContainEqual(
      expect.objectContaining({ code: 'ABSOLUTE_PRICE_THRESHOLD_UNCONVERTIBLE' }),
    );
  });
});
