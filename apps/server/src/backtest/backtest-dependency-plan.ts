import type {
  BacktestCorporateActionsResponse,
  CorporateActionFact,
  RunConfigV3,
  BacktestStrategy,
  Timeframe,
} from '@thesis-ledger/schemas';
import type {
  ExecutionModelRuleUnitFacts,
  RulePriceCoordinateFacts,
  RuleCompatibilityIssue,
  RequiredRuleConversion,
} from '@thesis-ledger/domain';
import { deriveEventDependencyPlan } from './backtest-dependency-events.js';
import { derivePriceDependencyPlan } from './backtest-dependency-price.js';

export type BacktestDependencyPlanIssue = {
  code:
    | 'INVALID_WARMUP_RANGE'
    | 'EVENT_COVERAGE_UNAVAILABLE'
    | 'EVENT_COVERAGE_INCOMPLETE'
    | 'EVENT_EFFECTIVE_DATE_MISSING'
    | 'EVENT_STRATEGY_VISIBILITY_MISSING'
    | 'EVENT_FACT_AFTER_DATA_AS_OF'
    | 'EXECUTION_PRICE_COORDINATE_MISMATCH'
    | 'RULE_INCOMPATIBLE';
  path: readonly (string | number)[];
  message: string;
};

export interface BacktestRuleCompatibilityFacts {
  executionUnits: ExecutionModelRuleUnitFacts;
  executionCoordinate: RulePriceCoordinateFacts;
  sourceCoordinates: Readonly<Record<string, RulePriceCoordinateFacts>>;
}

export interface BacktestDependencyPlanInput {
  strategy: BacktestStrategy;
  runConfig: RunConfigV3;
  /** Resolved, frozen responses. This pure planner never fetches or caches them. */
  corporateActionResponses?: Readonly<Record<string, BacktestCorporateActionsResponse>>;
  /** Resolved route and instrument facts consumed by the B01 compatibility helper. */
  ruleCompatibilityFacts?: BacktestRuleCompatibilityFacts;
}

export interface BacktestPlannedDataset {
  instrument: string;
  purpose:
    | 'signal'
    | 'execution'
    | 'benchmark'
    | 'fx'
    | 'corporateActions'
    | 'calendar'
    | 'instrumentFacts'
    | 'nav';
  requestedTimeframe: Timeframe;
  baseTimeframe: Timeframe;
  range: { startDate: string; endDate: string };
  sourceId?: string;
}

export interface BacktestEventDependency {
  instrument: string;
  purpose: 'raw-accounting' | 'strategy-signal';
  effectiveDateWindow: { startDate: string; endDate: string };
  eventTypes: readonly CorporateActionFact['type'][];
  requiredFields: readonly string[];
  completeCoverageRequired: true;
  visibilityRequired: boolean;
}

export interface BacktestDependencyPlan {
  version: 'backtest-dependency-plan-v1';
  status: 'planned' | 'blocked';
  blockingIssues: readonly BacktestDependencyPlanIssue[];
  runWindow: { startDate: string; endDate: string };
  signalSources: readonly {
    id: string;
    instrument: string;
    timeframe: Timeframe;
    fields: readonly string[];
  }[];
  executionInstrument: string;
  benchmark: {
    instrument: string;
    explicit: boolean;
    timeframe: Timeframe;
    samePriceAndReturnSemanticsRequired: true;
  };
  datasets: readonly BacktestPlannedDataset[];
  identities: readonly { instrument: string; roles: readonly string[] }[];
  calendarMarkets: readonly string[];
  requiredFx: readonly string[];
  warmup: {
    lookbackPeriods: number;
    lookbackTimeframe: Timeframe;
    startDate: string;
    rangePolicyVersion: string;
    calendarBufferDays: number;
    requiresVerifiedSessionCalendar: true;
  };
  corporateActions: {
    dependencies: readonly BacktestEventDependency[];
    requiredInstruments: readonly string[];
    validation: 'not-required' | 'pending' | 'complete' | 'blocked';
  };
  history: {
    basis: 'point-in-time' | 'fixed-provider-snapshot';
    dataAsOf: string;
    reconstructionEvidenceRef?: string;
    requiredBarFields: readonly string[];
    eventSignalsRequireStrategyVisibility: boolean;
  };
  ruleCompatibility: {
    status: 'pending' | 'compatible' | 'blocked';
    missingInputs: readonly string[];
    issues: readonly RuleCompatibilityIssue[];
    requiredConversions: readonly RequiredRuleConversion[];
  };
}

/**
 * Computes a V3 data dependency closure without network, database, cache, or
 * filesystem access. It keeps economic event dates separate from PIT visibility.
 */
export const planBacktestDependencies = (
  input: BacktestDependencyPlanInput,
): BacktestDependencyPlan => {
  const { strategy, runConfig } = input;
  const price = derivePriceDependencyPlan(strategy, runConfig, input.ruleCompatibilityFacts);
  const events = deriveEventDependencyPlan(
    strategy,
    runConfig,
    price.warmup.startDate,
    input.corporateActionResponses,
  );
  const datasets = new Map<string, BacktestPlannedDataset>();
  for (const dataset of [...price.datasets, ...events.datasets]) {
    const key = [
      dataset.instrument,
      dataset.purpose,
      dataset.requestedTimeframe,
      dataset.baseTimeframe,
      dataset.range.startDate,
      dataset.range.endDate,
      dataset.sourceId ?? '',
    ].join('|');
    datasets.set(key, dataset);
  }
  const orderedDatasets = [...datasets.values()].sort((left, right) =>
    [left.instrument, left.purpose, left.requestedTimeframe, left.sourceId ?? '']
      .join('|')
      .localeCompare(
        [right.instrument, right.purpose, right.requestedTimeframe, right.sourceId ?? ''].join('|'),
      ),
  );
  const blockingIssues = [...price.blockingIssues, ...events.issues];
  const history = runConfig.executionPriceProtocol.history;

  return {
    version: 'backtest-dependency-plan-v1',
    status: blockingIssues.length > 0 ? 'blocked' : 'planned',
    blockingIssues,
    runWindow: { startDate: runConfig.startDate, endDate: runConfig.endDate },
    signalSources: price.signalSources,
    executionInstrument: price.executionInstrument,
    benchmark: price.benchmark,
    datasets: orderedDatasets,
    identities: price.identities,
    calendarMarkets: price.calendarMarkets,
    requiredFx: price.requiredFx,
    warmup: price.warmup,
    corporateActions: {
      dependencies: events.dependencies,
      requiredInstruments: events.requiredInstruments,
      validation: events.validation,
    },
    history: {
      basis: history.basis,
      dataAsOf: runConfig.dataAsOf,
      ...(history.basis === 'point-in-time'
        ? { reconstructionEvidenceRef: history.reconstructionEvidenceRef }
        : {}),
      requiredBarFields: ['occurredAt', 'availableAt', 'providerRevision'],
      eventSignalsRequireStrategyVisibility: events.dependencies.some(
        (dependency) => dependency.purpose === 'strategy-signal',
      ),
    },
    ruleCompatibility: price.ruleCompatibility,
  };
};
