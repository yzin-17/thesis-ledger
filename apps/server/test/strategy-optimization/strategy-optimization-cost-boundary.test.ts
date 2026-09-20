import { describe, expect, it, vi } from 'vitest';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { budget, runConfig, split } from './strategy-optimization-postgres-fixtures.js';

const scope = {
  executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
  primaryTimeframe: '1d',
};

const input = (overrides: Record<string, unknown> = {}) => ({
  sourceMode: 'discovery',
  discoveryScope: scope,
  models: [{ provider: 'provider-a', model: 'model-a' }],
  objective: { mode: 'balanced', minClosedTrades: 1 },
  split,
  runConfig,
  budget: { ...budget },
  maxRounds: 1,
  acknowledgeUnknownCost: false,
  idempotencyKey: 'cost-boundary',
  ...overrides,
});

const serviceFor = (metadata: Record<string, unknown>, previous: unknown[] = []) => {
  const providers = {
    strict: vi.fn(() => ({ metadata })),
  };
  const prisma = { $queryRaw: vi.fn().mockResolvedValue(previous) };
  const service = new StrategyOptimizationService(
    prisma as never,
    providers as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
};

describe('strategy optimization cost creation boundary', () => {
  it('rejects unknown cost with a total amount cap before persistence', async () => {
    const { service, prisma } = serviceFor({ costPer1kInput: 0.1, costPer1kOutput: 0.2 });
    await expect(service.create(input())).rejects.toMatchObject({
      response: { errorCode: 'OPTIMIZATION_COST_TOTAL_LIMIT_UNAVAILABLE' },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('requires explicit unknown-cost confirmation when no total cap is requested', async () => {
    const { service } = serviceFor({ costPer1kInput: 0.1, costPer1kOutput: 0.2 });
    const request = input({ budget: { ...budget, maxCost: undefined } });
    await expect(service.create(request)).rejects.toMatchObject({
      response: { errorCode: 'OPTIMIZATION_COST_UNKNOWN_CONFIRMATION_REQUIRED' },
    });
  });

  it('rejects known mixed currencies and stale cost confirmations', async () => {
    const mixedProviders = {
      strict: vi.fn((provider: string) => ({
        metadata:
          provider === 'provider-a'
            ? { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' }
            : { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'HKD' },
      })),
    };
    const mixedService = new StrategyOptimizationService(
      { $queryRaw: vi.fn().mockResolvedValue([]) } as never,
      mixedProviders as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      mixedService.create(
        input({
          models: [
            { provider: 'provider-a', model: 'model-a' },
            { provider: 'provider-b', model: 'model-b' },
          ],
        }),
      ),
    ).rejects.toMatchObject({ response: { errorCode: 'OPTIMIZATION_COST_MIXED_CURRENCY' } });

    const previous = {
      id: '11111111-1111-4111-8111-111111111111',
      modelConfig: [
        { provider: 'provider-a', model: 'model-a', costStatus: 'known', costCurrency: 'USD' },
      ],
      budget: { ...budget, maxCost: '100' },
    };
    const stale = serviceFor(
      { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD', pricingVersion: 'v1' },
      [previous],
    );
    await expect(
      stale.service.create(input({ budget: { ...budget, maxCost: '101' } })),
    ).rejects.toMatchObject({
      response: { errorCode: 'OPTIMIZATION_COST_CONFIRMATION_STALE' },
    });
  });

  it('keeps call, token, backtest and duration caps on the reserve path', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const runs = new StrategyOptimizationRunService(
      { $executeRaw: executeRaw } as never,
      {} as never,
    );
    await expect(
      runs.reserveBudget('experiment-id', {
        aiCalls: 1,
        backtestRuns: 1,
        inputTokens: 10,
        outputTokens: 20,
        estimatedCost: 0,
      }),
    ).resolves.toBeUndefined();
    expect(executeRaw).toHaveBeenCalledTimes(1);

    executeRaw.mockResolvedValueOnce(0);
    await expect(runs.reserveBudget('experiment-id', { aiCalls: 1 })).rejects.toThrow(
      '优化实验预算或最长运行时长已耗尽',
    );
  });

  it('settles a known zero-price amount by currency and fail-closes unknown settlement', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const queryRaw = vi.fn().mockResolvedValue([
      {
        costUsed: '0',
        budget: { maxCost: '1' },
        modelConfig: [
          { provider: 'provider-a', model: 'model-a', costStatus: 'known', costCurrency: 'USD' },
        ],
      },
    ]);
    const runs = new StrategyOptimizationRunService(
      { $executeRaw: executeRaw, $queryRaw: queryRaw } as never,
      {} as never,
    );
    await expect(
      runs.reconcileCost('experiment-id', 0, 0, undefined, true, 'USD'),
    ).resolves.toBeUndefined();
    expect(executeRaw).toHaveBeenCalledTimes(1);

    queryRaw.mockResolvedValueOnce([
      { costUsed: '0', budget: {}, modelConfig: [{ costStatus: 'unknown' }] },
    ]);
    await expect(
      runs.reconcileCost('experiment-id', 0, 1, undefined, false, null),
    ).resolves.toBeUndefined();
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});
