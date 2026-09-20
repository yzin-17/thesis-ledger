import { describe, expect, it } from 'vitest';
import {
  optimizationExperimentCloneSchema,
  optimizationExperimentCreateSchema,
  optimizationExperimentRenameSchema,
  optimizationExperimentSourceSchema,
  optimizationCandidateSourceSchema,
  optimizationModelConfigSnapshotSchema,
  optimizationProposalSchema,
  optimizationTradingCostDisclosureSchema,
  optimizationDiscoveryGenerationOutputSchema,
  optimizationDiscoveryProposalSchema,
  resultReadEligibilityForExperiment,
  resultReadEligibilityForRun,
  riskApplicationArchiveSchema,
  riskApplicationCreateSchema,
} from '../src/strategy-optimization.js';

const runConfig = {
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  dataAsOf: '2025-01-01T00:00:00+00:00',
  baseCurrency: 'CNY',
  initialCash: { CNY: '100000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
};

const experiment = {
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
  models: [
    { provider: 'provider-a', model: 'model-a' },
    { provider: 'provider-b', model: 'model-b' },
  ],
  allowedParameterIds: ['risk.0.percent'],
  objective: { mode: 'balanced', minClosedTrades: 2 },
  split: {
    development: { start: '2024-01-01', end: '2024-06-30' },
    validation: { start: '2024-07-01', end: '2024-09-30' },
    test: { start: '2024-10-01', end: '2024-12-31' },
  },
  runConfig,
  budget: { maxAiCalls: 6, maxBacktestRuns: 13, maxDurationSeconds: 1800 },
  maxRounds: 2,
  idempotencyKey: 'experiment-1',
};

describe('strategy optimization contracts', () => {
  it('accepts a strict multi-model experiment contract', () => {
    const parsed = optimizationExperimentCreateSchema.parse({
      ...experiment,
      models: [{ ...experiment.models[0], reasoningEffort: 'high' }, experiment.models[1]],
    });
    expect(parsed.models).toHaveLength(2);
    expect(parsed.split.test.start).toBe('2024-10-01');
    expect(parsed.models[0]?.reasoningEffort).toBe('high');
    expect(parsed.models[1]).not.toHaveProperty('reasoningEffort');
  });

  it('requires a currency for known frozen pricing and preserves explicit zero-price metadata', () => {
    expect(
      optimizationModelConfigSnapshotSchema.parse({
        provider: 'provider-a',
        model: 'model-a',
        costStatus: 'known',
        costCurrency: 'usd',
        pricingVersion: 'zero-v1',
      }),
    ).toMatchObject({ costStatus: 'known', costCurrency: 'USD', pricingVersion: 'zero-v1' });
    expect(() =>
      optimizationModelConfigSnapshotSchema.parse({
        provider: 'provider-a',
        model: 'model-a',
        costStatus: 'known',
      }),
    ).toThrow();
    expect(
      optimizationModelConfigSnapshotSchema.parse({
        provider: 'provider-a',
        model: 'model-a',
        costStatus: 'unknown',
        costCurrency: 'USD',
      }),
    ).toMatchObject({ costStatus: 'unknown', costCurrency: 'USD' });
  });
});

describe('Vercel AI SDK 策略生成契约', () => {
  it('明确区分冻结 seed 的零交易成本假设', () => {
    expect(
      optimizationTradingCostDisclosureSchema.parse({
        source: 'frozen_seed',
        commissionRate: '0',
        slippageRate: '0.000',
        assumption: 'zero_assumption',
      }),
    ).toMatchObject({ assumption: 'zero_assumption' });
    expect(() =>
      optimizationTradingCostDisclosureSchema.parse({
        source: 'frozen_seed',
        commissionRate: '0.001',
        slippageRate: '0',
        assumption: 'zero_assumption',
      }),
    ).toThrow();
  });
});

describe('strategy optimization contracts', () => {
  it('keeps existing optimization compatible and requires a bounded discovery scope', () => {
    const parsed = optimizationExperimentCreateSchema.parse(experiment);
    expect(parsed.sourceMode).toBe('existing');
    expect(() =>
      optimizationExperimentCreateSchema.parse({ ...experiment, sourceMode: 'discovery' }),
    ).toThrow();
    const discovery = optimizationExperimentCreateSchema.parse({
      ...experiment,
      sourceMode: 'discovery',
      strategyVersionId: undefined,
      allowedParameterIds: undefined,
      discoveryScope: {
        executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
        primaryTimeframe: '1d',
      },
    });
    expect(discovery.discoveryScope?.primaryTimeframe).toBe('1d');
    expect(() =>
      optimizationExperimentCreateSchema.parse({
        ...experiment,
        discoveryScope: {
          executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
          primaryTimeframe: '1d',
        },
      }),
    ).toThrow();
  });

  it('requires discovery proposals to contain a complete StrategySchemaV2', () => {
    expect(() =>
      optimizationDiscoveryProposalSchema.parse({ strategy: { type: 'code' } }),
    ).toThrow();
  });
});

describe('Vercel AI SDK 策略生成契约', () => {
  it('只允许 discovery 模型返回可变字段，并拒绝固定字段与非法引用结构', () => {
    const generated = {
      strategy: {
        name: '均线探索',
        series: ['close'],
        entry: {
          type: 'compare',
          operator: 'gt',
          left: { type: 'series', sourceId: 'discovery-primary', field: 'close' },
          right: { type: 'constant', value: '10' },
        },
        exit: { type: 'positionState', field: 'isOpen' },
        sizing: { type: 'percentOfEquity', percent: '0.5' },
        risk: [{ type: 'fixedStop', percent: '0.05' }],
      },
      reason: '在固定探索边界内生成候选。',
      evidenceRefs: [],
    };
    expect(optimizationDiscoveryGenerationOutputSchema.parse(generated)).toMatchObject({
      strategy: { name: '均线探索', series: ['close'] },
    });
    expect(() =>
      optimizationDiscoveryGenerationOutputSchema.parse({
        ...generated,
        strategy: {
          ...generated.strategy,
          executionInstrument: { symbol: 'AAPL', market: 'US', assetType: 'stock' },
        },
      }),
    ).toThrow();
    expect(() =>
      optimizationDiscoveryGenerationOutputSchema.parse({
        ...generated,
        strategy: { ...generated.strategy, sizing: { type: 'percentOfEquity', percent: 50 } },
      }),
    ).toThrow();
  });
});

describe('strategy optimization contracts', () => {
  it('keeps provider/model identities distinct when either identity contains a colon', () => {
    const parsed = optimizationExperimentCreateSchema.parse({
      ...experiment,
      models: [
        { provider: 'provider:a', model: 'model' },
        { provider: 'provider', model: 'a:model' },
      ],
    });
    expect(parsed.models).toHaveLength(2);
  });

  it('rejects duplicate model identities and split leakage', () => {
    expect(() =>
      optimizationExperimentCreateSchema.parse({
        ...experiment,
        models: [
          { provider: 'provider-a', model: 'model-a' },
          { provider: 'provider-a', model: 'model-a' },
        ],
      }),
    ).toThrow();
    expect(() =>
      optimizationExperimentCreateSchema.parse({
        ...experiment,
        split: {
          ...experiment.split,
          validation: { start: '2024-06-30', end: '2024-09-30' },
        },
      }),
    ).toThrow();
  });

  it('keeps experiment clone input narrow and cannot reset exposure', () => {
    expect(optimizationExperimentCloneSchema.parse({ idempotencyKey: 'clone-1' })).toEqual({
      idempotencyKey: 'clone-1',
    });
    expect(
      optimizationExperimentCloneSchema.parse({
        idempotencyKey: 'clone-2',
        acknowledgeUnknownCost: true,
      }),
    ).toMatchObject({ acknowledgeUnknownCost: true });
    expect(() =>
      optimizationExperimentCloneSchema.parse({ idempotencyKey: 'clone-1', resetExposure: true }),
    ).toThrow();
  });

  it('keeps names bounded and source identities explicit', () => {
    expect(
      optimizationExperimentCreateSchema.parse({ ...experiment, name: '  我的实验  ' }).name,
    ).toBe('我的实验');
    expect(optimizationExperimentRenameSchema.parse({ name: '重命名' })).toEqual({
      name: '重命名',
    });
    expect(() => optimizationExperimentRenameSchema.parse({ name: ' ' })).toThrow();
    expect(
      optimizationExperimentSourceSchema.parse({
        kind: 'existing',
        strategyId: '11111111-1111-4111-8111-111111111111',
        strategyVersionId: '22222222-2222-4222-8222-222222222222',
        strategyName: '正式策略',
        version: 3,
        schemaVersion: 2,
      }),
    ).toMatchObject({ kind: 'existing', version: 3 });
    expect(
      optimizationCandidateSourceSchema.parse({
        kind: 'candidate',
        experimentId: '11111111-1111-4111-8111-111111111111',
        candidateId: '22222222-2222-4222-8222-222222222222',
        candidateStrategyVersionId: '33333333-3333-4333-8333-333333333333',
        candidateNumber: 1,
        stage: 'awaiting_finalization',
      }),
    ).toMatchObject({ kind: 'candidate', candidateNumber: 1 });
  });

  it('reserves symmetric model work and final verification before starting', () => {
    expect(() =>
      optimizationExperimentCreateSchema.parse({
        ...experiment,
        budget: { ...experiment.budget, maxAiCalls: 3 },
      }),
    ).toThrow(/至少需要 4 次/);
    expect(() =>
      optimizationExperimentCreateSchema.parse({
        ...experiment,
        budget: { ...experiment.budget, maxBacktestRuns: 12 },
      }),
    ).toThrow(/至少需要 13 次/);
  });

  it('rejects duplicate proposal parameters and unknown fields', () => {
    expect(() =>
      optimizationProposalSchema.parse({
        changes: [
          { parameterId: 'risk.0.percent', value: '0.05' },
          { parameterId: 'risk.0.percent', value: '0.06' },
        ],
        reason: 'duplicate',
        evidenceRefs: [],
      }),
    ).toThrow();
    expect(() =>
      optimizationProposalSchema.parse({
        changes: [{ parameterId: 'risk.0.percent', value: '0.05' }],
        reason: 'valid',
        evidenceRefs: [],
        code: 'do-not-run',
      }),
    ).toThrow();
  });

  it('keeps risk application creation explicit and fills notification policy defaults', () => {
    const parsed = riskApplicationCreateSchema.parse({
      strategyVersionId: '11111111-1111-4111-8111-111111111111',
      accountId: '22222222-2222-4222-8222-222222222222',
      symbol: '600519.SH',
      cycleMode: 'existingAndFuture',
      previewHash: 'preview-hash',
      idempotencyKey: 'risk-application-1',
      enabled: false,
      notification: { enabled: true, cooldownMinutes: 60 },
    });
    expect(parsed.enabled).toBe(false);
    expect(parsed.notification).toEqual({
      enabled: true,
      cooldownMinutes: 60,
      severity: 'warning',
      channels: [],
    });
  });

  it('requires an optimistic revision when archiving a risk application', () => {
    expect(riskApplicationArchiveSchema.parse({ expectedRevision: 2 })).toEqual({
      expectedRevision: 2,
    });
    expect(() => riskApplicationArchiveSchema.parse({ expectedRevision: 0 })).toThrow();
    expect(() =>
      riskApplicationArchiveSchema.parse({ expectedRevision: 2, hardDelete: true }),
    ).toThrow();
  });

  it('separates test access from explicit reveal evidence', () => {
    const restricted = resultReadEligibilityForExperiment({
      testExposedAt: '2026-09-18T00:00:00.000Z',
      exposure: { testAccessStarted: true },
    });
    expect(restricted).toMatchObject({
      state: 'restricted',
      code: 'HISTORICAL_REVEAL_UNKNOWN',
      scope: 'test',
      accessedAt: '2026-09-18T00:00:00.000Z',
    });
    expect(
      resultReadEligibilityForExperiment({
        exposure: { testRevealed: false },
        testExposedAt: '2026-09-18T00:00:00.000Z',
      }),
    ).toMatchObject({ state: 'restricted', code: 'TEST_NOT_REVEALED' });
    expect(
      resultReadEligibilityForExperiment({
        exposure: { testRevealed: true, testRevealedAt: '2026-09-18T01:00:00.000Z' },
      }),
    ).toMatchObject({ state: 'readable', code: 'READABLE', scope: 'none' });
  });

  it('only protects test-associated runs and never infers reveal from access', () => {
    expect(
      resultReadEligibilityForRun({
        associated: true,
        split: 'validation',
        exposure: { testRevealed: false },
      }).state,
    ).toBe('readable');
    expect(
      resultReadEligibilityForRun({
        associated: true,
        split: 'test',
        testExposedAt: '2026-09-18T00:00:00.000Z',
        exposure: { testAccessStarted: true },
      }).code,
    ).toBe('HISTORICAL_REVEAL_UNKNOWN');
    expect(resultReadEligibilityForRun({ associated: false }).code).toBe(
      'HISTORICAL_REVEAL_UNKNOWN',
    );
    expect(resultReadEligibilityForRun({ associated: false, ordinaryFormal: true }).code).toBe(
      'RUN_NOT_ASSOCIATED',
    );
  });
});
