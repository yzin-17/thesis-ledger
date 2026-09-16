import { optimizationExperimentCreateSchema, strategySchemaV2 } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  createDiscoverySeed,
  STRATEGY_SPACE_VERSION,
  validateDiscoveryStrategy,
} from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import {
  computeDiscoveryDataFingerprint,
  createDiscoveryExperiment,
} from '../../src/strategy-optimization/strategy-optimization-discovery-store.js';
import { optimizationSha256 } from '../../src/strategy-optimization/strategy-optimization-common.js';

const scope = {
  executionInstrument: { symbol: '600519.SH', market: 'CN' as const, assetType: 'stock' as const },
  primaryTimeframe: '1d' as const,
};

describe('AI discovery strategy space', () => {
  it('creates a valid hidden v0 seed in the fixed space', () => {
    const seed = createDiscoverySeed(scope);
    expect(strategySchemaV2.parse(seed).executionInstrument).toEqual(scope.executionInstrument);
    expect(STRATEGY_SPACE_VERSION).toBe('strategy-space-v1');
  });

  it('rejects candidates that cross the selected instrument or timeframe', () => {
    const candidate = createDiscoverySeed(scope);
    expect(() =>
      validateDiscoveryStrategy(
        {
          ...candidate,
          executionInstrument: { ...candidate.executionInstrument, symbol: '000001.SZ' },
        },
        scope,
      ),
    ).toThrow(/不得改变执行标的/);
    expect(() =>
      validateDiscoveryStrategy({ ...candidate, primaryTimeframe: '5m' }, scope),
    ).toThrow();
  });

  it('rejects additional signal sources and arbitrary strategy fields', () => {
    const candidate = createDiscoverySeed(scope);
    expect(() =>
      validateDiscoveryStrategy(
        { ...candidate, signalSources: [...candidate.signalSources, candidate.signalSources[0]] },
        scope,
      ),
    ).toThrow();
    expect(() =>
      validateDiscoveryStrategy({ ...candidate, entry: { type: 'code', code: 'x' } }, scope),
    ).toThrow();
  });
});

describe('AI discovery persistence', () => {
  it('uses the persisted StrategySchemaV2 seed for the experiment fingerprint', async () => {
    const input = optimizationExperimentCreateSchema.parse({
      sourceMode: 'discovery',
      discoveryScope: scope,
      models: [{ provider: 'fixture', model: 'discovery-model' }],
      objective: { mode: 'balanced', minClosedTrades: 1 },
      split: {
        development: { start: '2026-01-01', end: '2026-04-30' },
        validation: { start: '2026-05-01', end: '2026-07-31' },
        test: { start: '2026-08-01', end: '2026-09-10' },
      },
      runConfig: {
        startDate: '2026-01-01',
        endDate: '2026-09-10',
        dataAsOf: '2026-09-11T08:00:00.000Z',
        baseCurrency: 'CNY',
        initialCash: { CNY: '100000' },
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '15:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
      },
      budget: {
        maxAiCalls: 10,
        maxBacktestRuns: 30,
        maxInputTokens: 200_000,
        maxOutputTokens: 20_000,
        maxDurationSeconds: 1_800,
      },
      idempotencyKey: 'discovery-fingerprint-regression',
    });
    const seed = createDiscoverySeed(scope);
    const queries: Array<{ values: unknown[] }> = [];
    const transaction = {
      strategy: { create: vi.fn(async () => ({ id: 'strategy-1' })) },
      strategyVersion: { create: vi.fn(async () => ({ id: 'version-0' })) },
      $queryRaw: vi.fn(async (query: { values: unknown[] }) => {
        queries.push(query);
        return [{ id: 'experiment-1' }];
      }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };

    await createDiscoveryExperiment(prisma as never, input, [
      { provider: 'fixture', model: 'discovery-model', costStatus: 'known' },
    ]);

    expect(transaction.strategyVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ schema: seed }),
    });
    expect(queries[0]?.values).toContain(computeDiscoveryDataFingerprint(seed, input));
    expect(queries[0]?.values).not.toContain(
      optimizationSha256({
        schema: { id: 'strategy-1' },
        runConfig: input.runConfig,
        split: input.split,
        semanticVersion: 'strategy-optimization-v1',
      }),
    );
  });
});
