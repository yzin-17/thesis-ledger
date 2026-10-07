import {
  DecimalValue,
  availabilityForDecision,
  compareBacktestBenchmarkCompatibility,
  type BacktestBenchmarkCompatibilityIdentity,
  type BacktestBenchmarkCompatibilityReport,
  type BacktestBenchmarkCostAssumption,
  type BacktestMetric,
} from '@thesis-ledger/domain';
import {
  backtestBenchmarkCompatibilitySchemaV3,
  backtestSnapshotManifestV3Schema,
  compareMarketPitEvidenceInstantStringsV1,
  runConfigSchemaV3,
  strategySchema,
  type BacktestSnapshotManifestV3,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import {
  calendarFact,
  tradingCalendarFromFact,
  type ExchangeVerticalResult,
} from './backtest-v2-execution-shared.js';
import { barResearchClocksV3 } from './backtest-v3-research-clock.js';
import { alignBacktestBenchmarkClosesV3 } from './backtest-v3-benchmark-alignment.js';
import { resolveBacktestV3BenchmarkCost } from './backtest-v3-benchmark-cost.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';

const EVALUATION_VERSION =
  'v3-buy-first-in-range-close-liquidate-last-in-range-close-by-trading-date-v2';

type BenchmarkMetric = BacktestMetric;
type BenchmarkCostReport = BacktestBenchmarkCostAssumption | { kind: 'unavailable' };

export interface BacktestV3BenchmarkInput {
  runConfig: RunConfigV3;
  strategy: BacktestStrategy;
  manifest: BacktestSnapshotManifestV3;
  rows: ReadonlyMap<string, readonly ArtifactRow[]>;
  analytics: Pick<ExchangeVerticalResult['analytics'], 'equityCurve' | 'metrics'>;
  skippedTradingDates?: readonly string[];
}

export interface BacktestV3BenchmarkProjection {
  benchmark: Record<string, BenchmarkMetric>;
  benchmarkCompatibility: BacktestBenchmarkCompatibilityReport & {
    costAssumption: BenchmarkCostReport;
  };
  warnings: string[];
}

interface ValuationClose {
  occurredAt: string;
  availableAt: string;
  decisionAt: string;
  close: string;
  tradingDate: string;
}

const unavailable = (reason: string): BenchmarkMetric => ({ status: 'unavailable', reason });
const available = (value: string): BenchmarkMetric => ({ status: 'available', value });

const failIntegrity = (message: string): never => {
  throw new Error(`V3 benchmark frozen-input integrity failure: ${message}`);
};

const instrumentCurrency = (market: BacktestStrategy['executionInstrument']['market']) => {
  if (market === 'CN') return 'CNY' as const;
  if (market === 'HK') return 'HKD' as const;
  return 'USD' as const;
};

const instrumentRouteType = (assetType: BacktestStrategy['executionInstrument']['assetType']) => {
  if (assetType === 'stock') return 'STOCK';
  if (assetType === 'etf') return 'ETF';
  return 'NAV_FUND';
};

const sourceIdentity = (source: BacktestSnapshotManifestV3['actualSources'][number]) => ({
  symbol: source.symbol,
  routeKey: source.routeKey,
  provenance: source.provenance,
  inputFingerprint: source.inputFingerprint,
});

const same = (left: unknown, right: unknown) =>
  canonicalizeManifest(left) === canonicalizeManifest(right);

const assertFrozenInputs = (input: BacktestV3BenchmarkInput) => {
  const runConfig = runConfigSchemaV3.parse(input.runConfig);
  const parsedStrategy = strategySchema.parse(input.strategy);
  const strategy: BacktestStrategy = {
    ...parsedStrategy,
    entry: parsedStrategy.entry as BacktestStrategy['entry'],
    exit: parsedStrategy.exit as BacktestStrategy['exit'],
    execution: parsedStrategy.execution as BacktestStrategy['execution'],
  };
  const manifest = backtestSnapshotManifestV3Schema.parse(input.manifest);
  if (manifest.status !== 'finalized' || manifest.quality.completeness !== 'complete') {
    failIntegrity('仅接受 finalized complete Snapshot');
  }
  if (
    manifest.runConfigChecksum !== hashCanonicalManifest(runConfig) ||
    manifest.dataAsOf !== runConfig.dataAsOf ||
    manifest.dateRange.startDate !== runConfig.startDate ||
    manifest.dateRange.endDate !== runConfig.endDate ||
    !same(manifest.executionPriceProtocol, runConfig.executionPriceProtocol)
  ) {
    failIntegrity('manifest 与 RunConfig 的冻结协议、日期或 checksum 不一致');
  }
  if (manifest.strategyVersionHash !== hashCanonicalManifest(strategy)) {
    failIntegrity('manifest strategyVersionHash 与 strategy 不一致');
  }

  const executionSources = manifest.actualSources.filter(
    (source) => source.purpose === 'execution',
  );
  if (executionSources.length !== 1) {
    failIntegrity('manifest 必须包含唯一 execution 来源');
  }
  const executionSource = executionSources[0]!;
  const instrument = strategy.executionInstrument;
  if (
    executionSource.routeKey.kind !== 'bar' ||
    executionSource.symbol !== instrument.symbol ||
    executionSource.routeKey.market !== instrument.market ||
    executionSource.routeKey.assetType !== instrumentRouteType(instrument.assetType) ||
    executionSource.routeKey.capability !== 'DAILY_BAR' ||
    executionSource.routeKey.timeframe !== '1d' ||
    executionSource.routeKey.adjustment !== runConfig.executionPriceProtocol.priceBasis.adjustment
  ) {
    failIntegrity('唯一 execution 来源与策略标的或 RunConfig 价格协议不一致');
  }

  const configuredModel = runConfig.executionModel;
  const manifestModel = manifest.executionModel;
  if (configuredModel) {
    const modelArtifact = manifest.artifacts.find(
      (artifact) => artifact.key === manifestModel?.artifactKey,
    );
    if (
      !manifestModel ||
      manifestModel.id !== configuredModel.id ||
      manifestModel.version !== configuredModel.version ||
      manifestModel.contentHash !== hashCanonicalManifest(configuredModel) ||
      !modelArtifact
    ) {
      failIntegrity('manifest execution model 引用与 RunConfig 不一致');
    }
  } else if (manifestModel) {
    failIntegrity('manifest 冻结了 RunConfig 中不存在的 execution model');
  }

  return { runConfig, strategy, manifest, executionSource };
};

const rowsForExecutionArtifact = (
  manifest: BacktestSnapshotManifestV3,
  rows: ReadonlyMap<string, readonly ArtifactRow[]>,
) => {
  const refs = manifest.artifacts.filter((artifact) =>
    artifact.key.endsWith('/execution/bars.parquet'),
  );
  if (refs.length !== 1) return undefined;
  return rows.get(refs[0]!.key);
};

const executionRowsMatchSource = (
  rows: readonly ArtifactRow[],
  source: BacktestSnapshotManifestV3['actualSources'][number],
) => {
  const routeKey = source.routeKey;
  if (routeKey.kind !== 'bar') return false;
  return rows.every(
    (row) =>
      row.kind === 'market-bar-v3' &&
      row.purpose === 'execution' &&
      row.symbol === source.symbol &&
      row.market === routeKey.market &&
      row.assetType === routeKey.assetType &&
      row.timeframe === routeKey.timeframe &&
      row.adjustment === routeKey.adjustment &&
      row.providerId === source.provenance.providerId &&
      row.upstreamSource === source.provenance.upstreamSource &&
      row.routeIndex === source.provenance.routeIndex &&
      row.effectivePolicyRevision === source.provenance.effectivePolicyRevision &&
      row.inputFingerprint === source.inputFingerprint,
  );
};

const inRangeEquityPoints = (
  points: ExchangeVerticalResult['analytics']['equityCurve'],
  calendar: ReturnType<typeof tradingCalendarFromFact>,
  runConfig: RunConfigV3,
) =>
  points
    .filter((point) => {
      const date = calendar.status(point.occurredAt).date;
      return date >= runConfig.startDate && date <= runConfig.endDate;
    })
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));

const valuationCloses = (
  rows: readonly ArtifactRow[],
  calendar: ReturnType<typeof tradingCalendarFromFact>,
  runConfig: RunConfigV3,
  warnings: Set<string>,
): ValuationClose[] => {
  const points: ValuationClose[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      typeof row.occurredAt !== 'string' ||
      typeof row.availableAt !== 'string' ||
      typeof row.close !== 'string' ||
      row.timeframe !== '1d'
    ) {
      continue;
    }
    let tradingDate: string;
    try {
      tradingDate = calendar.status(row.occurredAt).date;
    } catch {
      warnings.add('BENCHMARK_INVALID_OBSERVATION_TIME');
      continue;
    }
    if (tradingDate < runConfig.startDate || tradingDate > runConfig.endDate) continue;
    if (
      row.quality !== 'complete' ||
      row.completionStatus !== 'complete' ||
      row.suspended === true
    ) {
      warnings.add('BENCHMARK_INCOMPLETE_VALUATION_CLOSE');
      continue;
    }
    const closeIdentity = tradingDate;
    if (seen.has(closeIdentity)) {
      warnings.add('BENCHMARK_DUPLICATE_VALUATION_CLOSE');
      continue;
    }
    seen.add(closeIdentity);
    try {
      const close = DecimalValue.from(row.close);
      if (!close.isPositive()) {
        warnings.add('BENCHMARK_INVALID_VALUATION_PRICE');
        continue;
      }
      const clocks = barResearchClocksV3(row, calendar, runConfig);
      const decisionAt = availabilityForDecision({
        availableAt: row.availableAt,
        ...(clocks.researchClock ? { researchClock: clocks.researchClock } : {}),
      });
      if (
        !decisionAt ||
        compareMarketPitEvidenceInstantStringsV1(decisionAt, decisionAt) === undefined
      ) {
        warnings.add('BENCHMARK_FUTURE_OBSERVATION');
        continue;
      }
      points.push({
        occurredAt: row.occurredAt,
        availableAt: row.availableAt,
        decisionAt,
        close: close.toString(),
        tradingDate,
      });
    } catch {
      warnings.add('BENCHMARK_FUTURE_OBSERVATION');
    }
  }
  return points.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
};

const identityFor = (
  runConfig: RunConfigV3,
  source: BacktestSnapshotManifestV3['actualSources'][number],
  costAssumption?: BacktestBenchmarkCostAssumption,
  benchmarkConvention = EVALUATION_VERSION,
): BacktestBenchmarkCompatibilityIdentity => ({
  priceProtocol: {
    priceBasis: JSON.parse(
      JSON.stringify(runConfig.executionPriceProtocol.priceBasis),
    ) as NonNullable<BacktestBenchmarkCompatibilityIdentity['priceProtocol']>,
    accountingBasis: runConfig.executionPriceProtocol.accountingBasis,
    // assertFrozenInputs only returns a validated daily execution source; callers only reuse
    // another source after verifying its full source identity matches that execution source.
    timeframe: '1d',
  },
  returnProtocol: {
    version: 'v3-total-return-v1',
    metric: 'net-total-return',
    currency: runConfig.baseCurrency,
    evaluationRange: { startDate: runConfig.startDate, endDate: runConfig.endDate },
    benchmarkConvention,
  },
  historyProtocol: runConfig.executionPriceProtocol.history,
  ...(costAssumption === undefined ? {} : { costAssumption }),
  source: sourceIdentity(source),
  dividendAssumption: {
    accountingBasis: runConfig.executionPriceProtocol.accountingBasis,
    meaning: runConfig.executionPriceProtocol.priceBasis.dividendMeaning,
    evidenceRef: runConfig.executionPriceProtocol.priceBasis.dividendEvidenceRef,
  },
});

const finish = (
  strategyIdentity: BacktestBenchmarkCompatibilityIdentity,
  benchmarkIdentity: BacktestBenchmarkCompatibilityIdentity | undefined,
  costAssumption: BenchmarkCostReport,
  totalReturn: BenchmarkMetric,
  strategyTotalReturn: BenchmarkMetric,
  warnings: Set<string>,
): BacktestV3BenchmarkProjection => {
  const comparison = compareBacktestBenchmarkCompatibility(strategyIdentity, benchmarkIdentity);
  let excessReturn: BenchmarkMetric;
  if (comparison.status === 'incompatible') {
    excessReturn = unavailable('BENCHMARK_COMPARISON_INCOMPATIBLE');
  } else if (comparison.status !== 'compatible') {
    excessReturn = unavailable('BENCHMARK_COMPARISON_UNVERIFIED');
  } else if (
    strategyTotalReturn.status !== 'available' ||
    strategyTotalReturn.value === undefined
  ) {
    excessReturn = unavailable('STRATEGY_RETURN_UNAVAILABLE');
  } else if (totalReturn.status !== 'available' || totalReturn.value === undefined) {
    excessReturn = unavailable('BENCHMARK_RETURN_UNAVAILABLE');
  } else {
    try {
      excessReturn = available(
        DecimalValue.from(strategyTotalReturn.value).minus(totalReturn.value).toString(),
      );
    } catch {
      excessReturn = unavailable('INVALID_RETURN_VALUE');
    }
  }
  const parsedCompatibility = backtestBenchmarkCompatibilitySchemaV3.parse({
    ...comparison,
    costAssumption,
  });
  const benchmarkCompatibility = {
    status: parsedCompatibility.status,
    ...(parsedCompatibility.strategyFingerprint === undefined
      ? {}
      : { strategyFingerprint: parsedCompatibility.strategyFingerprint }),
    ...(parsedCompatibility.benchmarkFingerprint === undefined
      ? {}
      : { benchmarkFingerprint: parsedCompatibility.benchmarkFingerprint }),
    missingFields: parsedCompatibility.missingFields,
    differentFields: parsedCompatibility.differentFields,
    costAssumption: parsedCompatibility.costAssumption,
  } satisfies BacktestV3BenchmarkProjection['benchmarkCompatibility'];
  return {
    benchmark: { totalReturn, excessReturn },
    benchmarkCompatibility,
    warnings: [...warnings],
  };
};

/** Computes the bounded V3 same-execution-series benchmark from frozen inputs only. */
export const buildBacktestV3Benchmark = (
  input: BacktestV3BenchmarkInput,
): BacktestV3BenchmarkProjection => {
  const { runConfig, strategy, manifest, executionSource } = assertFrozenInputs(input);
  const benchmarkConvention = EVALUATION_VERSION;
  const identity = (
    source: BacktestSnapshotManifestV3['actualSources'][number],
    costAssumption?: BacktestBenchmarkCostAssumption,
  ) => identityFor(runConfig, source, costAssumption, benchmarkConvention);
  const warnings = new Set<string>([`BENCHMARK_EVALUATION:${benchmarkConvention}`]);
  const strategyTotalReturn =
    input.analytics.metrics.totalReturn ?? unavailable('STRATEGY_RETURN_UNAVAILABLE');
  const executionCurrency = instrumentCurrency(strategy.executionInstrument.market);
  const strategyIdentity = identity(executionSource);

  const benchmarkBinding = runConfig.priceInputBindings?.benchmark;
  if (!benchmarkBinding || benchmarkBinding.binding !== 'execution-series') {
    warnings.add('BENCHMARK_BINDING_UNAVAILABLE');
    return finish(
      strategyIdentity,
      undefined,
      { kind: 'unavailable' },
      unavailable('BENCHMARK_BINDING_UNAVAILABLE'),
      strategyTotalReturn,
      warnings,
    );
  }

  const benchmarkInstrument = strategy.benchmark ?? strategy.executionInstrument;
  if (
    benchmarkInstrument.symbol !== strategy.executionInstrument.symbol ||
    benchmarkInstrument.market !== strategy.executionInstrument.market ||
    benchmarkInstrument.assetType !== strategy.executionInstrument.assetType
  ) {
    warnings.add('BENCHMARK_INDEPENDENT_SERIES_UNSUPPORTED');
    const independentSource = manifest.actualSources.find(
      (source) => source.purpose === 'benchmark',
    );
    const benchmarkIdentity = independentSource
      ? { source: sourceIdentity(independentSource) }
      : undefined;
    return finish(
      strategyIdentity,
      benchmarkIdentity,
      { kind: 'unavailable' },
      unavailable('BENCHMARK_INDEPENDENT_SERIES_UNSUPPORTED'),
      strategyTotalReturn,
      warnings,
    );
  }

  const benchmarkSources = manifest.actualSources.filter(
    (source) => source.purpose === 'benchmark',
  );
  if (benchmarkSources.length > 1) {
    warnings.add('BENCHMARK_SOURCE_AMBIGUOUS');
    return finish(
      strategyIdentity,
      undefined,
      { kind: 'unavailable' },
      unavailable('BENCHMARK_SOURCE_AMBIGUOUS'),
      strategyTotalReturn,
      warnings,
    );
  }
  const benchmarkSource = benchmarkSources[0] ?? executionSource;
  if (!same(sourceIdentity(benchmarkSource), sourceIdentity(executionSource))) {
    warnings.add('BENCHMARK_SOURCE_INCOMPATIBLE');
    return finish(
      strategyIdentity,
      { source: sourceIdentity(benchmarkSource) },
      { kind: 'unavailable' },
      unavailable('BENCHMARK_SOURCE_INCOMPATIBLE'),
      strategyTotalReturn,
      warnings,
    );
  }

  if (executionCurrency !== runConfig.baseCurrency) {
    warnings.add('BENCHMARK_CURRENCY_MISMATCH');
    const benchmarkIdentity = identity(benchmarkSource);
    delete benchmarkIdentity.returnProtocol;
    return finish(
      strategyIdentity,
      benchmarkIdentity,
      { kind: 'unavailable' },
      unavailable('BENCHMARK_CURRENCY_MISMATCH'),
      strategyTotalReturn,
      warnings,
    );
  }

  if (runConfig.executionPriceProtocol.accountingBasis !== 'normalized-series') {
    warnings.add('BENCHMARK_RAW_ACTIONS_UNSUPPORTED');
    const benchmarkIdentity = identity(benchmarkSource);
    delete benchmarkIdentity.returnProtocol;
    return finish(
      strategyIdentity,
      benchmarkIdentity,
      { kind: 'unavailable' },
      unavailable('BENCHMARK_RAW_ACTIONS_UNSUPPORTED'),
      strategyTotalReturn,
      warnings,
    );
  }

  if (strategy.executionInstrument.assetType === 'fund') {
    warnings.add('BENCHMARK_NAV_PRICE_SERIES_UNSUPPORTED');
    return finish(
      strategyIdentity,
      undefined,
      { kind: 'unavailable' },
      unavailable('BENCHMARK_NAV_PRICE_SERIES_UNSUPPORTED'),
      strategyTotalReturn,
      warnings,
    );
  }

  const calendarRows = [...input.rows.entries()]
    .filter(([key]) => key.split('/').at(-2) === 'calendar')
    .flatMap(([, rows]) => rows)
    .filter((row) => row.market === strategy.executionInstrument.market);
  if (calendarRows.length !== 1) {
    warnings.add('BENCHMARK_CALENDAR_UNAVAILABLE');
    return finish(
      strategyIdentity,
      identity(benchmarkSource),
      { kind: 'unavailable' },
      unavailable('BENCHMARK_CALENDAR_UNAVAILABLE'),
      strategyTotalReturn,
      warnings,
    );
  }
  const calendar = tradingCalendarFromFact(calendarFact(calendarRows[0]!));
  const executionRows = rowsForExecutionArtifact(manifest, input.rows);
  if (!executionRows || executionRows.length === 0) {
    warnings.add('BENCHMARK_EXECUTION_SERIES_UNAVAILABLE');
    return finish(
      strategyIdentity,
      identity(benchmarkSource),
      { kind: 'unavailable' },
      unavailable('BENCHMARK_EXECUTION_SERIES_UNAVAILABLE'),
      strategyTotalReturn,
      warnings,
    );
  }
  if (!executionRowsMatchSource(executionRows, executionSource)) {
    warnings.add('BENCHMARK_EXECUTION_SERIES_SOURCE_MISMATCH');
    return finish(
      strategyIdentity,
      { source: sourceIdentity(benchmarkSource) },
      { kind: 'unavailable' },
      unavailable('BENCHMARK_EXECUTION_SERIES_SOURCE_MISMATCH'),
      strategyTotalReturn,
      warnings,
    );
  }

  const closes = valuationCloses(executionRows, calendar, runConfig, warnings);
  const equity = inRangeEquityPoints(input.analytics.equityCurve, calendar, runConfig);
  if (equity.length < 2) {
    warnings.add('BENCHMARK_INSUFFICIENT_EQUITY_TIMES');
    return finish(
      strategyIdentity,
      identity(benchmarkSource),
      { kind: 'unavailable' },
      unavailable('INSUFFICIENT_EQUITY_POINTS'),
      strategyTotalReturn,
      warnings,
    );
  }
  const { aligned, expectedCount } = alignBacktestBenchmarkClosesV3({
    closes,
    equity,
    dateFor: (instant) => calendar.status(instant).date,
    ...(input.skippedTradingDates ? { skippedTradingDates: input.skippedTradingDates } : {}),
  });
  if (aligned.length !== expectedCount || aligned.length < 2) {
    if (aligned.length !== expectedCount) warnings.add('BENCHMARK_ALIGNMENT_INCOMPLETE');
    return finish(
      strategyIdentity,
      identity(benchmarkSource),
      { kind: 'unavailable' },
      unavailable('INSUFFICIENT_BENCHMARK_POINTS'),
      strategyTotalReturn,
      warnings,
    );
  }

  const firstClose = aligned[0]!;
  const lastClose = aligned.at(-1)!;
  const cost = resolveBacktestV3BenchmarkCost({
    runConfig,
    strategy,
    firstClose: firstClose.close,
    firstOccurredAt: firstClose.occurredAt,
    lastClose: lastClose.close,
    lastOccurredAt: lastClose.occurredAt,
  });
  if (cost.unavailableReason) warnings.add(cost.unavailableReason);
  const strategyComparisonIdentity = identity(executionSource, cost.identityAssumption);
  const benchmarkComparisonIdentity = identity(benchmarkSource, cost.identityAssumption);
  const result = cost.result;
  const benchmarkReturn =
    result.status === 'available' ? available(result.value) : unavailable(result.reason);
  return finish(
    strategyComparisonIdentity,
    benchmarkComparisonIdentity,
    cost.assumption,
    benchmarkReturn,
    strategyTotalReturn,
    warnings,
  );
};
