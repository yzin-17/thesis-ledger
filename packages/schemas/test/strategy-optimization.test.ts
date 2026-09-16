import { describe, expect, it } from 'vitest';
import {
  optimizationExperimentCloneSchema,
  optimizationExperimentCreateSchema,
  optimizationProposalSchema,
  optimizationDiscoveryProposalSchema,
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
    expect(() =>
      optimizationExperimentCloneSchema.parse({ idempotencyKey: 'clone-1', resetExposure: true }),
    ).toThrow();
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
      channels: ['feishu'],
    });
  });
});
