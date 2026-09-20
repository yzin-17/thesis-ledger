import {
  optimizationDiscoveryScopeSchema,
  optimizationTradingCostReadModelSchema,
  resultReadEligibilityForExperiment,
  strategySchemaV2,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { aiExecutionReadModel, safeAttemptMetadata } from '../ai/ai-execution-read-model.js';
import {
  experimentDisplayName,
  toRecord,
  type AttemptRow,
  type EnrichedExperiment,
  type ExperimentReadRow,
  type ExperimentRow,
} from './strategy-optimization-common.js';
import { optimizationCostSummary } from './strategy-optimization-cost.js';
import { createDiscoverySeed } from './strategy-optimization-discovery.js';

const zeroDecimal = (value: string) => /^0+(?:\.0+)?$/u.test(value);

export const optimizationTradingCostReadModel = (row: ExperimentReadRow) => {
  let source: 'baseline_strategy' | 'discovery_seed' | 'unavailable' = 'unavailable';
  let strategy: StrategySchemaV2 | null = null;
  if (row.sourceMode === 'discovery') {
    const scope = optimizationDiscoveryScopeSchema.safeParse(row.discoveryScope);
    if (scope.success) {
      source = 'discovery_seed';
      strategy = createDiscoverySeed(scope.data);
    }
  } else {
    const parsed = strategySchemaV2.safeParse(row.baselineStrategySchema);
    if (parsed.success) {
      source = 'baseline_strategy';
      strategy = parsed.data as StrategySchemaV2;
    }
  }
  return optimizationTradingCostReadModelSchema.parse({
    source,
    commissionRate: strategy?.cost.commissionRate ?? null,
    slippageRate: strategy?.cost.slippageRate ?? null,
    isAssumption: true,
    zeroDoesNotMeanFree:
      strategy !== null &&
      zeroDecimal(strategy.cost.commissionRate) &&
      zeroDecimal(strategy.cost.slippageRate),
  });
};

export const optimizationAttemptReadModel = ({ modelMetadata, ...attempt }: AttemptRow) => {
  const execution = aiExecutionReadModel(modelMetadata);
  return {
    ...attempt,
    modelMetadata: safeAttemptMetadata(modelMetadata),
    execution,
    usageCompleteness: execution?.usageCompleteness ?? ('legacy_unknown' as const),
  };
};

const sourceForExperiment = (row: ExperimentReadRow) => {
  if (row.sourceMode === 'existing') {
    if (
      row.strategyId &&
      row.baselineStrategyVersionId &&
      row.strategyVersion !== null &&
      row.strategyVersion > 0 &&
      row.strategySchemaVersion !== null &&
      row.strategySchemaVersion > 0
    ) {
      return {
        kind: 'existing' as const,
        strategyId: row.strategyId,
        strategyVersionId: row.baselineStrategyVersionId,
        strategyName: row.strategyName?.trim() || null,
        version: row.strategyVersion,
        schemaVersion: row.strategySchemaVersion,
      };
    }
    return {
      kind: 'unknown' as const,
      reason: 'missing_baseline' as const,
      referenceId: row.baselineStrategyVersionId ?? null,
    };
  }
  const scope = optimizationDiscoveryScopeSchema.safeParse(row.discoveryScope);
  return {
    kind: 'discovery' as const,
    experimentId: row.id,
    strategySpaceVersion: row.strategySpaceVersion?.trim() || null,
    discoveryScope: scope.success ? scope.data : null,
  };
};

export const enrichOptimizationExperiment = (
  row: ExperimentReadRow,
  attempts?: readonly AttemptRow[],
): EnrichedExperiment => {
  const {
    strategyId: _strategyId,
    strategyName,
    strategyVersion: _strategyVersion,
    strategySchemaVersion: _schemaVersion,
    baselineStrategySchema: _baselineStrategySchema,
    ...experiment
  } = row;
  void _strategyId;
  void _strategyVersion;
  void _schemaVersion;
  void _baselineStrategySchema;
  const costSummary = optimizationCostSummary(experiment, attempts);
  return {
    ...experiment,
    costUsed: costSummary.status === 'complete' ? experiment.costUsed : null,
    costSummary,
    name: experimentDisplayName({ ...experiment, strategyName }),
    nameSource: experiment.name?.trim() ? 'stored' : 'legacy_fallback',
    source: sourceForExperiment(row),
    readEligibility: resultReadEligibilityForExperiment(row),
    tradingCost: optimizationTradingCostReadModel(row),
  };
};

export const optimizationUsageNote = (
  experiment: Pick<ExperimentRow, 'modelConfig'>,
  attempts: AttemptRow[],
) => {
  const routes = Array.isArray(experiment.modelConfig) ? experiment.modelConfig : [];
  const summaries = routes.flatMap((routeValue) => {
    const route = toRecord(routeValue);
    if (typeof route.provider !== 'string' || typeof route.model !== 'string') return [];
    const modelKey = `${route.provider}:${route.model}`;
    const modelAttempts = attempts.filter((attempt) => attempt.modelKey === modelKey);
    const inputTokens = modelAttempts.reduce((sum, attempt) => sum + (attempt.inputTokens ?? 0), 0);
    const outputTokens = modelAttempts.reduce(
      (sum, attempt) => sum + (attempt.outputTokens ?? 0),
      0,
    );
    const durationMs = modelAttempts.reduce((sum, attempt) => sum + (attempt.durationMs ?? 0), 0);
    const costUnknown =
      route.costStatus === 'unknown' ||
      modelAttempts.some((attempt) => toRecord(attempt.modelMetadata).costStatus === 'unknown');
    const cost = modelAttempts.reduce((sum, attempt) => {
      if (attempt.cost === null) return sum;
      const value = Number(attempt.cost.toString());
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    const costText = costUnknown ? '费用未知' : `费用 ${cost.toFixed(6)}`;
    return [
      `${modelKey}：${modelAttempts.length} 次，Token ${inputTokens}/${outputTokens}，耗时 ${(durationMs / 1000).toFixed(1)}s，${costText}`,
    ];
  });
  return summaries.length > 0 ? ` 模型调用：${summaries.join('；')}。` : '';
};
