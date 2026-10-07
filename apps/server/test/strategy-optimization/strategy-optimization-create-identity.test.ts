import { describe, expect, it } from 'vitest';
import { optimizationExperimentCreateSchema } from '@thesis-ledger/schemas';
import { assertOptimizationCreateIdentity } from '../../src/strategy-optimization/strategy-optimization-create-identity.js';
import {
  budget,
  createNormalizedRunConfig,
  split,
} from './strategy-optimization-postgres-fixtures.js';

const fixture = () => {
  const request = optimizationExperimentCreateSchema.parse({
    contractVersion: 3,
    sourceMode: 'existing',
    strategyVersionId: '11111111-1111-4111-8111-111111111111',
    allowedParameterIds: ['entry.threshold'],
    models: [{ provider: 'provider-a', model: 'model-a' }],
    objective: { mode: 'balanced', minClosedTrades: 1 },
    split,
    runConfig: createNormalizedRunConfig(),
    budget,
    maxRounds: 1,
    acknowledgeUnknownCost: false,
    idempotencyKey: 'same-intent',
  });
  const modelConfig = [
    { provider: 'provider-a', model: 'model-a', costStatus: 'known', costCurrency: 'USD' },
  ];
  const previous = {
    sourceMode: request.sourceMode,
    baselineStrategyVersionId: request.strategyVersionId!,
    discoveryScope: null,
    allowedParameterIds: request.allowedParameterIds,
    objective: request.objective,
    split: request.split,
    runConfig: request.runConfig,
    modelConfig,
    budget: request.budget,
    maxRounds: request.maxRounds,
  };
  return { request, previous, modelConfig };
};

describe('优化实验创建意图身份', () => {
  it('相同配置和费用确认可以幂等重放', () => {
    const f = fixture();
    expect(() =>
      assertOptimizationCreateIdentity(f.previous, structuredClone(f.request), f.modelConfig),
    ).not.toThrow();
  });
  it.each(['strategy', 'cash', 'adjustment', 'split', 'parameters', 'objective'])(
    '配置变化不能复用原实验：%s',
    (change) => {
      const f = fixture();
      const request = structuredClone(f.request);
      if (change === 'strategy') request.strategyVersionId = '22222222-2222-4222-8222-222222222222';
      else if (change === 'cash') request.runConfig.initialCash.CNY = '20000';
      else if (change === 'adjustment')
        request.runConfig.executionPriceProtocol.priceBasis.adjustment = 'hfq';
      else if (change === 'split') request.split.development.end = '2024-01-03';
      else if (change === 'parameters') request.allowedParameterIds = ['other'];
      else request.objective.mode = 'return';
      expect(() => assertOptimizationCreateIdentity(f.previous, request, f.modelConfig)).toThrow(
        '不同实验配置',
      );
    },
  );
  it('费用变化保留专用的重新确认错误', () => {
    const f = fixture();
    const request = { ...f.request, maxRounds: 2 };
    expect(() => assertOptimizationCreateIdentity(f.previous, request, f.modelConfig)).toThrow(
      '费用预算已变化',
    );
  });
  it('探索范围变化不能复用已有实验，隐藏种子ID不改变相同探索意图', () => {
    const f = fixture();
    const request = {
      ...f.request,
      sourceMode: 'discovery' as const,
      discoveryScope: {
        executionInstrument: {
          symbol: '600519.SH',
          market: 'CN' as const,
          assetType: 'stock' as const,
        },
        primaryTimeframe: '1d' as const,
      },
    };
    const previous = {
      ...f.previous,
      sourceMode: 'discovery' as const,
      discoveryScope: request.discoveryScope,
      baselineStrategyVersionId: 'internal-seed',
    };
    expect(() => assertOptimizationCreateIdentity(previous, request, f.modelConfig)).not.toThrow();
    const changed = structuredClone(request);
    changed.discoveryScope.executionInstrument.symbol = '000001.SZ';
    expect(() => assertOptimizationCreateIdentity(previous, changed, f.modelConfig)).toThrow(
      '不同实验配置',
    );
  });
});
