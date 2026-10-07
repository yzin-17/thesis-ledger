import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  backtestExecutionModelSchemaV3,
  runConfigSchemaV3,
  strategySchema,
  type BacktestCorporateActionsResponse,
  type BacktestExecutionModelV3,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { RulePriceCoordinateFacts } from '@thesis-ledger/domain';
import {
  planBacktestDependencies,
  type BacktestDependencyPlanInput,
} from '../../src/backtest/backtest-dependency-plan.js';

const modelFixtureUrl = new URL(
  '../../../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json',
  import.meta.url,
);
let executionModel: BacktestExecutionModelV3;

beforeAll(async () => {
  executionModel = backtestExecutionModelSchemaV3.parse(
    JSON.parse(await readFile(modelFixtureUrl, 'utf8')) as unknown,
  );
});

const executionModelFor = (
  accountingBasis: 'raw-events' | 'normalized-series',
): BacktestExecutionModelV3 => {
  const model = structuredClone(executionModel);
  if (accountingBasis === 'raw-events') return model;

  return {
    ...model,
    segments: model.segments.map((segment) => {
      if (segment.fees === null) {
        throw new Error('Normalized fixture requires exchange execution');
      }
      return {
        ...segment,
        execution: {
          ...segment.execution,
          price: {
            kind: 'noDailyLimit',
            reason: '合成 V3 归一化执行测试假设',
          },
          normalizedExecution: {
            priceCoordinate: 'continuous-decimal',
            quantityUnits: 'continuous-normalized-decimal',
            lotSizeConstraint: 'not-applied',
            tickSizeConstraint: 'not-applied',
            dailyPriceLimit: 'not-applied',
            feeBasis: 'simulatedTurnover',
          },
        },
      };
    }),
  };
};

const strategyValue = (overrides: Record<string, unknown> = {}): BacktestStrategy =>
  strategySchema.parse({
    schemaVersion: '2',
    name: 'dependency plan',
    signalSources: [
      {
        id: 'close',
        asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
        timeframe: '1d',
        series: ['close'],
      },
    ],
    executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
    entry: {
      type: 'compare',
      operator: 'gt',
      left: {
        type: 'indicator',
        name: 'MA',
        input: {
          type: 'indicator',
          name: 'RSI',
          input: { type: 'series', sourceId: 'close', field: 'close' },
          params: { period: 14 },
        },
        params: { period: 5 },
      },
      right: { type: 'constant', value: '0' },
    },
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'percentOfEquity', percent: '1' },
    risk: [],
    execution: {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    },
    cost: { commissionRate: '0', slippageRate: '0' },
    ...overrides,
  }) as BacktestStrategy;

const runConfigValue = (
  accountingBasis: 'raw-events' | 'normalized-series' = 'raw-events',
  includeExecutionModel = accountingBasis === 'normalized-series',
): RunConfigV3 => {
  const normalized = accountingBasis === 'normalized-series';
  return runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: '2024-02-01',
    endDate: '2024-02-29',
    dataAsOf: '2024-03-04T16:00:00+08:00',
    baseCurrency: 'CNY',
    initialCash: { CNY: '100000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    ...(includeExecutionModel ? { executionModel: executionModelFor(accountingBasis) } : {}),
    executionPriceProtocol: {
      protocolVersion: 'execution-price-v1',
      accountingBasis,
      priceBasis: {
        adjustment: normalized ? 'qfq' : 'none',
        method: 'provider-native',
        methodVersion: 'test-source-v1',
        basisScope: 'global',
        anchor: normalized ? '2024-02-01' : null,
        revision: { origin: 'provider', id: 'revision-1' },
        observedAt: '2024-03-01T12:00:00+08:00',
        volumeBasis: normalized ? 'split-adjusted' : 'original',
        dividendMeaning: normalized ? 'provider-defined' : 'explicit-cash',
        dividendEvidenceRef: null,
        conversionAvailable: normalized,
        conversionEvidenceRef: normalized ? 'conversion-evidence-1' : null,
        derivation: null,
        quantityBasis: normalized ? 'normalized-units' : 'actual-units',
      },
      history: normalized
        ? { basis: 'fixed-provider-snapshot' }
        : { basis: 'point-in-time', reconstructionEvidenceRef: 'reconstruction-1' },
    },
  }) as RunConfigV3;
};

const splitFact = (overrides: Record<string, unknown> = {}) => ({
  symbol: '600519.SH',
  market: 'CN',
  instrumentType: 'STOCK',
  type: 'SPLIT',
  ratio: '2',
  effectiveDate: '2024-02-20',
  occurredAt: '2024-02-20T00:00:00Z',
  availableAt: '2024-02-19T17:00:00Z',
  provider: 'fixture',
  providerRevision: 'r1',
  ...overrides,
});

const actionsResponse = (
  facts: readonly unknown[],
  coverage: BacktestCorporateActionsResponse['coverage'] = {
    start: '2023-12-01',
    end: '2024-03-30',
    complete: true,
  },
): BacktestCorporateActionsResponse => ({
  version: 3,
  status: 'supported',
  provider: 'fixture',
  providerRevision: 'r1',
  coverage,
  facts: facts as BacktestCorporateActionsResponse['facts'],
});

const eventSignal = () =>
  strategyValue({
    entry: {
      type: 'all',
      conditions: [
        { type: 'corporateActionEvent', eventType: 'SPLIT' },
        {
          type: 'compare',
          operator: 'gt',
          left: { type: 'series', sourceId: 'close', field: 'close' },
          right: { type: 'constant', value: '0' },
        },
      ],
    },
  });

const rawResponse = (facts: readonly unknown[]) => ({
  'CN:600519.SH:stock': actionsResponse(facts),
});

const coordinate = (
  runConfig: RunConfigV3,
  overrides: Partial<RulePriceCoordinateFacts> = {},
): RulePriceCoordinateFacts => ({
  coordinateId: 'CN:600519.SH:execution-price',
  currency: 'CNY',
  priceBasis: { ...runConfig.executionPriceProtocol.priceBasis },
  ...overrides,
});

const ruleFacts = (runConfig: RunConfigV3) => ({
  executionUnits: {
    realLotSize: '100',
    realTickSize: '0.01',
    actualQuantityConversion: { available: false, evidenceRef: null },
  },
  executionCoordinate: coordinate(runConfig),
  sourceCoordinates: {
    close: coordinate(runConfig, { coordinateId: 'CN:600519.SH:signal-close' }),
  },
});

describe('backtest dependency plan', () => {
  it('closes strategy, execution, default benchmark, FX, identity, sessions, and warmup inputs', () => {
    const strategy = strategyValue({
      signalSources: [
        {
          id: 'close',
          asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
          timeframe: '1d',
          series: ['close'],
        },
        {
          id: 'unused-us',
          asset: { symbol: 'AAPL', market: 'US', assetType: 'stock' },
          timeframe: '1d',
          series: ['close'],
        },
      ],
    });
    const plan = planBacktestDependencies({
      strategy,
      runConfig: runConfigValue(),
      corporateActionResponses: {},
    });

    expect(plan.status).toBe('blocked');
    expect(plan.signalSources).toEqual([
      { id: 'close', instrument: 'CN:600519.SH:stock', timeframe: '1d', fields: ['close'] },
    ]);
    expect(plan.executionInstrument).toBe('CN:600519.SH:stock');
    expect(plan.benchmark).toMatchObject({
      instrument: 'CN:600519.SH:stock',
      explicit: false,
      samePriceAndReturnSemanticsRequired: true,
    });
    expect(plan.requiredFx).toEqual([]);
    expect(plan.calendarMarkets).toEqual(['CN']);
    expect(plan.warmup).toMatchObject({
      lookbackPeriods: 19,
      lookbackTimeframe: '1d',
      startDate: '2023-12-11',
      requiresVerifiedSessionCalendar: true,
    });
    expect(plan.datasets.some((dataset) => dataset.instrument === 'US:AAPL:stock')).toBe(false);
    expect(plan.corporateActions.dependencies).toMatchObject([
      {
        purpose: 'raw-accounting',
        effectiveDateWindow: { startDate: '2024-02-01', endDate: '2024-02-29' },
      },
    ]);
    expect(plan.blockingIssues.map(({ code }) => code)).toContain('EVENT_COVERAGE_UNAVAILABLE');
    expect(plan.history).toMatchObject({
      basis: 'point-in-time',
      reconstructionEvidenceRef: 'reconstruction-1',
      requiredBarFields: ['occurredAt', 'availableAt', 'providerRevision'],
    });
  });

  it('does not request any corporate action table for an event-free normalized strategy', () => {
    const plan = planBacktestDependencies({
      strategy: strategyValue(),
      runConfig: runConfigValue('normalized-series'),
      corporateActionResponses: {
        'CN:600519.SH:stock': {
          ...actionsResponse([]),
          status: 'unavailable',
          reason: 'not configured',
        },
      },
    });

    expect(plan.status).toBe('planned');
    expect(plan.corporateActions).toEqual({
      dependencies: [],
      requiredInstruments: [],
      validation: 'not-required',
    });
    expect(plan.datasets.some((dataset) => dataset.purpose === 'corporateActions')).toBe(false);
  });

  it('requires effectiveDate for raw accounting facts but does not require strategy visibility', () => {
    const plan = planBacktestDependencies({
      strategy: strategyValue(),
      runConfig: runConfigValue(),
      corporateActionResponses: rawResponse([splitFact()]),
    });

    expect(plan.corporateActions.validation).toBe('complete');
    expect(plan.blockingIssues).toEqual([]);
    expect(plan.corporateActions.dependencies[0]).toMatchObject({
      purpose: 'raw-accounting',
      visibilityRequired: false,
      requiredFields: expect.arrayContaining(['effectiveDate']),
    });
  });

  it('fails closed when a relevant raw action has no effectiveDate', () => {
    const plan = planBacktestDependencies({
      strategy: strategyValue(),
      runConfig: runConfigValue(),
      corporateActionResponses: rawResponse([splitFact({ effectiveDate: undefined })]),
    });

    expect(plan.status).toBe('blocked');
    expect(plan.blockingIssues.map(({ code }) => code)).toContain('EVENT_EFFECTIVE_DATE_MISSING');
  });

  it('requires strategyVisibility for matched event signals and never substitutes provider availability', () => {
    const plan = planBacktestDependencies({
      strategy: eventSignal(),
      runConfig: runConfigValue('normalized-series'),
      corporateActionResponses: rawResponse([splitFact()]),
    });

    expect(plan.status).toBe('blocked');
    expect(plan.corporateActions.dependencies).toHaveLength(1);
    expect(plan.corporateActions.dependencies[0]).toMatchObject({
      purpose: 'strategy-signal',
      visibilityRequired: true,
      eventTypes: ['SPLIT'],
      requiredFields: expect.arrayContaining(['effectiveDate', 'strategyVisibility']),
    });
    expect(plan.blockingIssues.map(({ code }) => code)).toContain(
      'EVENT_STRATEGY_VISIBILITY_MISSING',
    );
  });

  it('accepts event-signal facts only with effective and visibility evidence plus full coverage', () => {
    const plan = planBacktestDependencies({
      strategy: eventSignal(),
      runConfig: runConfigValue('normalized-series'),
      corporateActionResponses: rawResponse([
        splitFact({
          strategyVisibility: { kind: 'announcement', announcedAt: '2024-02-19T16:00:00+08:00' },
        }),
      ]),
    });

    expect(plan.status).toBe('planned');
    expect(plan.corporateActions.validation).toBe('complete');
    expect(plan.history.eventSignalsRequireStrategyVisibility).toBe(true);
  });

  it('rejects action and announcement facts later than dataAsOf within the same millisecond', () => {
    const dataAsOf = '2024-03-04T08:00:00.000001Z';
    const late = '2024-03-04T08:00:00.000002Z';
    const raw = planBacktestDependencies({
      strategy: strategyValue(),
      runConfig: { ...runConfigValue(), dataAsOf },
      corporateActionResponses: rawResponse([splitFact({ availableAt: late })]),
    });
    expect(raw.blockingIssues.map(({ code }) => code)).toContain('EVENT_FACT_AFTER_DATA_AS_OF');

    const signal = planBacktestDependencies({
      strategy: eventSignal(),
      runConfig: { ...runConfigValue('normalized-series'), dataAsOf },
      corporateActionResponses: rawResponse([
        splitFact({ strategyVisibility: { kind: 'announcement', announcedAt: late } }),
      ]),
    });
    expect(signal.blockingIssues.map(({ code }) => code)).toContain('EVENT_FACT_AFTER_DATA_AS_OF');
  });

  it('keeps event coverage fail-closed when the provider reports a short or incomplete window', () => {
    const plan = planBacktestDependencies({
      strategy: strategyValue(),
      runConfig: runConfigValue(),
      corporateActionResponses: {
        'CN:600519.SH:stock': actionsResponse([splitFact()], {
          start: '2024-02-10',
          end: '2024-02-29',
          complete: false,
        }),
      },
    });

    expect(plan.status).toBe('blocked');
    expect(plan.blockingIssues.map(({ code }) => code)).toContain('EVENT_COVERAGE_INCOMPLETE');
  });

  it('marks missing B01 facts pending and carries verified unit conversions from the helper', () => {
    const strategy = strategyValue({
      entry: {
        type: 'all',
        conditions: [
          {
            type: 'compare',
            operator: 'gt',
            left: { type: 'series', sourceId: 'close', field: 'close' },
            right: { type: 'constant', value: '10' },
          },
          {
            type: 'compare',
            operator: 'gt',
            left: { type: 'positionState', field: 'averageCost' },
            right: { type: 'constant', value: '0' },
          },
        ],
      },
    });
    const config = runConfigValue('normalized-series', true);
    const pending = planBacktestDependencies({ strategy, runConfig: config });
    expect(pending.ruleCompatibility.status).toBe('pending');
    expect(pending.ruleCompatibility.missingInputs).toContain(
      'ruleCompatibilityFacts.executionUnits',
    );

    const facts = ruleFacts(config);
    facts.sourceCoordinates.close!.priceBasis.conversionEvidenceRef = 'signal-price-map';
    const plan = planBacktestDependencies({
      strategy,
      runConfig: config,
      ruleCompatibilityFacts: facts,
    });

    expect(plan.ruleCompatibility.status).toBe('compatible');
    expect(plan.ruleCompatibility.requiredConversions).toEqual(
      expect.arrayContaining([
        { kind: 'price-to-raw', sourceId: 'close', evidenceRef: 'signal-price-map' },
        {
          kind: 'price-to-raw',
          sourceId: '__execution__',
          evidenceRef: 'conversion-evidence-1',
        },
      ]),
    );
  });

  it('rejects coordinate facts that do not match the frozen execution price protocol', () => {
    const config = runConfigValue('normalized-series', true);
    const facts = ruleFacts(config);
    facts.executionCoordinate.priceBasis.adjustment = 'none';
    const plan = planBacktestDependencies({
      strategy: strategyValue(),
      runConfig: config,
      ruleCompatibilityFacts: facts,
    } satisfies BacktestDependencyPlanInput);

    expect(plan.status).toBe('blocked');
    expect(plan.blockingIssues.map(({ code }) => code)).toContain(
      'EXECUTION_PRICE_COORDINATE_MISMATCH',
    );
  });

  it('uses an explicit benchmark and keeps its separate market, identity, session, and FX inputs', () => {
    const strategy = strategyValue({
      benchmark: { symbol: 'SPY', market: 'US', assetType: 'etf' },
    });
    const plan = planBacktestDependencies({
      strategy,
      runConfig: runConfigValue('normalized-series'),
    });

    expect(plan.benchmark).toMatchObject({ instrument: 'US:SPY:etf', explicit: true });
    expect(plan.calendarMarkets).toEqual(['CN', 'US']);
    expect(plan.requiredFx).toEqual(['USD/CNY']);
    expect(plan.identities).toContainEqual({ instrument: 'US:SPY:etf', roles: ['benchmark'] });
  });
});
