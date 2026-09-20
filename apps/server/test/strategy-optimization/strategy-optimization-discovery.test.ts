import { optimizationExperimentCreateSchema, strategySchemaV2 } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  assembleDiscoveryGeneration,
  createDiscoverySeed,
  discoveryGenerationPrompt,
  discoveryPrompt,
  parseDiscoveryProposal,
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
    expect(seed.sizing).toEqual({ type: 'percentOfEquity', percent: '0.5' });
    expect(seed.exit).toEqual({ type: 'positionState', field: 'isOpen' });
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

  it('把首版候选的 benchmark null 归一化为未提供', () => {
    const proposal = parseDiscoveryProposal(
      {
        strategy: { ...createDiscoverySeed(scope), benchmark: null },
        reason: '保持首版单标的约束',
        evidenceRefs: [],
      },
      scope,
    );

    expect(proposal.strategy).not.toHaveProperty('benchmark');
  });

  it('为 schema 失败追加最多五条安全 issue 诊断', () => {
    expect(() => parseDiscoveryProposal({ strategy: {} }, scope)).toThrowError(
      expect.objectContaining({
        message: expect.stringMatching(
          /^AI 探索输出必须包含完整 StrategySchemaV2 候选；校验问题：/u,
        ),
      }),
    );
    try {
      parseDiscoveryProposal({ strategy: {} }, scope);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const details = message.split('；校验问题：')[1]?.split('；') ?? [];
      expect(details.length).toBeLessThanOrEqual(5);
      expect(message).not.toContain('strategy: {}');
      expect(message).toMatch(/strategy\.[\w.]+: /u);
    }
  });

  it('在 discovery prompt 中明确比例、风险和响应 envelope 契约', () => {
    const messages = discoveryPrompt(
      {
        strategySpaceVersion: STRATEGY_SPACE_VERSION,
        discoveryScope: scope,
        objective: { mode: 'balanced', minClosedTrades: 1 },
      } as never,
      createDiscoverySeed(scope),
      1,
      [],
    );
    const system = messages[0]!;
    const user = messages[1]!;
    const prompt = `${String(system.content)}\n${String(user.content)}`;
    expect(prompt).toContain('percentOfEquity.percent');
    expect(prompt).toContain('targetWeight.weight');
    expect(prompt).toContain('字符串比例');
    expect(prompt).toContain('fixedStop.percent');
    expect(prompt).toContain('fixedTakeProfit.percent');
    expect(prompt).toContain('maxHoldingPeriod.periods');
    expect(prompt).toContain('entry/exit must be BooleanExpression');
    expect(prompt).toContain("operator:'eq|neq|gt|gte|lt|lte'");
    expect(prompt).toContain("direction:'above|below'");
    expect(prompt).toContain('value:decimal string');
    expect(prompt).toContain('quantity|averageCost|holdingPeriods');
    expect(prompt).toContain('indicator.input 必须是完整 NumericExpression');
    expect(prompt).toContain('"sourceId":"discovery-primary"');
    expect(prompt).toContain('and/or/condition/rule');
    expect(prompt).toContain('risk 必须是数组');
    expect(prompt).toContain('不得输出以 fixedStop/fixedTakeProfit 为键的对象');
    expect(prompt).toContain('首版禁止 benchmark');
    expect(prompt).toContain('只能包含 strategy、reason、evidenceRefs');
    expect(prompt).toContain('不得复制到 strategy');
    expect(prompt).toContain('responseTemplate 完整复制');
    expect(prompt).toContain('不得省略任何 strategy 顶层字段');
    const request = JSON.parse(String(user.content).replace('DISCOVERY_REQUEST_JSON:', '')) as {
      seedStrategy: unknown;
      responseTemplate: { strategy: unknown; reason: string; evidenceRefs: unknown[] };
    };
    expect(request.responseTemplate.strategy).toEqual(request.seedStrategy);
    expect(request.responseTemplate.evidenceRefs).toEqual([]);
  });

  it('只让模型生成可变策略字段，固定字段由服务端装配', () => {
    const seed = createDiscoverySeed(scope);
    const experiment = {
      strategySpaceVersion: STRATEGY_SPACE_VERSION,
      discoveryScope: scope,
      objective: { mode: 'balanced', minClosedTrades: 1 },
    } as never;
    const generated = {
      strategy: {
        name: 'MA 趋势候选',
        description: '仅生成可变策略部分',
        series: ['close'],
        entry: {
          type: 'compare',
          operator: 'gt',
          left: { type: 'series', sourceId: 'discovery-primary', field: 'close' },
          right: { type: 'constant', value: '100' },
        },
        exit: { type: 'positionState', field: 'isOpen' },
        sizing: { type: 'percentOfEquity', percent: '0.4' },
        risk: [{ type: 'fixedStop', percent: '0.05' }],
      },
      reason: '验证精简生成契约',
      evidenceRefs: [],
    };

    const proposal = assembleDiscoveryGeneration(experiment, seed, generated);

    expect(proposal.strategy).toEqual({
      schemaVersion: seed.schemaVersion,
      name: generated.strategy.name,
      description: generated.strategy.description,
      signalSources: [{ ...seed.signalSources[0], series: ['close'] }],
      executionInstrument: seed.executionInstrument,
      primaryTimeframe: seed.primaryTimeframe,
      entry: generated.strategy.entry,
      exit: generated.strategy.exit,
      sizing: generated.strategy.sizing,
      risk: generated.strategy.risk,
      execution: seed.execution,
      cost: seed.cost,
    });
  });

  it('拒绝模型越权输出固定字段或引用未声明 series', () => {
    const seed = createDiscoverySeed(scope);
    const experiment = { discoveryScope: scope } as never;
    const generated = {
      strategy: {
        name: '非法候选',
        series: ['close'],
        entry: {
          type: 'compare',
          operator: 'gt',
          left: { type: 'series', sourceId: 'discovery-primary', field: 'open' },
          right: { type: 'constant', value: '0' },
        },
        exit: { type: 'positionState', field: 'isOpen' },
        sizing: { type: 'percentOfEquity', percent: '0.5' },
        risk: [],
      },
      evidenceRefs: [],
    };

    expect(() => assembleDiscoveryGeneration(experiment, seed, generated)).toThrow(
      /未声明的 series/,
    );
    expect(() =>
      assembleDiscoveryGeneration(experiment, seed, {
        ...generated,
        strategy: {
          ...generated.strategy,
          entry: seed.entry,
          executionInstrument: scope.executionInstrument,
        },
      }),
    ).toThrow();
    expect(() =>
      assembleDiscoveryGeneration(experiment, seed, {
        ...generated,
        strategy: {
          ...generated.strategy,
          entry: {
            type: 'compare',
            operator: 'gt',
            left: { type: 'series', sourceId: 'other-source', field: 'close' },
            right: { type: 'constant', value: '0' },
          },
        },
      }),
    ).toThrow(/冻结的 SignalSource ID/);
  });

  it('精简 discovery prompt 不携带完整 seed 或响应模板', () => {
    const messages = discoveryGenerationPrompt(
      {
        strategySpaceVersion: STRATEGY_SPACE_VERSION,
        discoveryScope: scope,
        objective: { mode: 'balanced', minClosedTrades: 1 },
      } as never,
      createDiscoverySeed(scope),
      1,
      [],
    );
    const user = String(messages[1]!.content);
    const request = JSON.parse(user.replace('DISCOVERY_REQUEST_JSON:', '')) as Record<
      string,
      unknown
    >;

    expect(request).not.toHaveProperty('seedStrategy');
    expect(request).not.toHaveProperty('responseTemplate');
    expect(request).toHaveProperty('frozenSource.id', 'discovery-primary');
    expect(String(messages[0]!.content)).toContain('不得输出 schemaVersion');
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
