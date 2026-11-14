import { describe, expect, it, vi } from 'vitest';
import {
  optimizationExperimentCreateSchema,
  priceResearchStrategyIssues,
} from '@thesis-ledger/schemas';
import {
  createDiscoverySeed,
  assembleDiscoveryGeneration,
  discoveryCandidateStrategy,
} from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import {
  createDiscoveryExperiment,
  cloneDiscoveryExperiment,
} from '../../src/strategy-optimization/strategy-optimization-discovery-store.js';
import { createOptimizationExperiment } from '../../src/strategy-optimization/strategy-optimization-create.js';
import { buildOptimizationModelConfig } from '../../src/strategy-optimization/strategy-optimization-model-routing.js';
import { optimizationResearchRunConfig } from './optimization-research-fixtures.js';
import {
  createNormalizedRunConfig,
  budget,
  split,
} from './strategy-optimization-postgres-fixtures.js';
import { optimizationModelResearchNotice } from '../../src/strategy-optimization/strategy-optimization-model-feedback.js';

const scope = {
  executionInstrument: { symbol: '600519.SH', market: 'CN' as const, assetType: 'stock' as const },
  primaryTimeframe: '1d' as const,
};
const input = () =>
  optimizationExperimentCreateSchema.parse({
    contractVersion: 3,
    sourceMode: 'discovery',
    discoveryScope: scope,
    models: [{ provider: 'fixture', model: 'fixture' }],
    objective: { mode: 'balanced', minClosedTrades: 1 },
    budget,
    split,
    maxRounds: 1,
    runConfig: optimizationResearchRunConfig(),
    idempotencyKey: 'research-test',
  });
function store() {
  const transaction = {
    strategy: { create: vi.fn(async () => ({ id: 'strategy' })) },
    strategyVersion: {
      create: vi
        .fn<(input: unknown) => Promise<{ id: string }>>()
        .mockResolvedValue({ id: 'seed' }),
    },
    $queryRaw: vi.fn(async () => [{ id: 'experiment' }]),
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    },
  };
}
describe('AI 实验统一后复权研究', () => {
  it('新提示词解释双价格规则，历史归一化提示词保留转换门禁', () => {
    expect(optimizationModelResearchNotice(optimizationResearchRunConfig())).toContain(
      '具体价格常量使用已冻结的不复权参考价',
    );
    expect(optimizationModelResearchNotice(createNormalizedRunConfig())).toContain(
      '未提供该证据时不得使用',
    );
  });
  it('新研究种子与候选自动分配实际价格常量，历史种子保留 V2', () => {
    const seed = createDiscoverySeed(scope, true);
    expect(seed.schemaVersion).toBe('3');
    expect(createDiscoverySeed(scope).schemaVersion).toBe('2');
    const proposal = assembleDiscoveryGeneration({ discoveryScope: scope } as never, seed, {
      strategy: {
        name: '实际价格条件',
        series: ['close'],
        entry: {
          type: 'compare',
          operator: 'lt',
          left: { type: 'series', sourceId: 'discovery-primary', field: 'close' },
          right: { type: 'constant', value: '10' },
        },
        exit: seed.exit,
        sizing: seed.sizing,
        risk: [],
      },
      reason: '受控样本',
      evidenceRefs: [],
    });
    expect(proposal.strategy.schemaVersion).toBe('3');
    expect(proposal.strategy.signalSources[0]?.priceCoordinate).toBe('actual');
    expect(priceResearchStrategyIssues(proposal.strategy as never)).toEqual([]);
    expect(() =>
      discoveryCandidateStrategy(
        { discoveryScope: scope, runConfig: optimizationResearchRunConfig() } as never,
        { ...proposal, strategy: createDiscoverySeed(scope) },
      ),
    ).toThrow('预览并确认');
  });
  it('新种子及克隆保存 V3，历史克隆继续保存原 V2', async () => {
    const { prisma, transaction } = store();
    await createDiscoveryExperiment(prisma as never, input(), []);
    expect(transaction.strategyVersion.create.mock.calls[0]?.[0]).toMatchObject({
      data: { schemaVersion: 3, schema: { schemaVersion: '3' } },
    });
    for (const [runConfig, expected] of [
      [optimizationResearchRunConfig(), 3],
      [createNormalizedRunConfig(), 2],
    ] as const) {
      transaction.strategyVersion.create.mockClear();
      await cloneDiscoveryExperiment(
        prisma as never,
        { ...input(), runConfig, sourceMode: 'discovery' } as never,
        'clone',
        'clone-key',
        {},
      );
      expect(transaction.strategyVersion.create.mock.calls[0]?.[0]).toMatchObject({
        data: { schemaVersion: expected, schema: { schemaVersion: String(expected) } },
      });
    }
  });
  it('新建入口拒绝缺少研究冻结的配置，旧幂等创建仍恢复原记录', async () => {
    const providers = {
      strict: () => ({ metadata: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' } }),
    };
    const parsed = optimizationExperimentCreateSchema.parse({
      ...input(),
      runConfig: createNormalizedRunConfig(),
    });
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const reads = { experiment: vi.fn().mockResolvedValue({ id: 'original' }) };
    const process = vi.fn();
    const dependencies = { prisma, providers, reads, candidates: {}, process } as never;
    await expect(createOptimizationExperiment(parsed, dependencies)).rejects.toThrow(
      '统一后复权研究',
    );
    const modelConfig = buildOptimizationModelConfig(
      parsed.models,
      providers as never,
      'strategy_discovery',
    );
    prisma.$queryRaw.mockResolvedValue([
      { ...parsed, id: 'original', baselineStrategyVersionId: 'seed', modelConfig },
    ]);
    expect(await createOptimizationExperiment(parsed, dependencies)).toEqual({ id: 'original' });
    expect(process).not.toHaveBeenCalled();
  });
});
