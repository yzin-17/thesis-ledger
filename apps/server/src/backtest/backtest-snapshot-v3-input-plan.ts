import {
  marketDataBarRouteKeyV3Schema,
  runConfigSchemaV3,
  strategySchema,
  type BacktestSnapshotManifestV3,
  type MarketDataBarRouteKeyV3,
} from '@thesis-ledger/schemas';
import {
  planBacktestDependencies,
  type BacktestDependencyPlan,
  type BacktestDependencyPlanInput,
} from './backtest-dependency-plan.js';

export class SnapshotV3InputPlanError extends Error {
  readonly code = 'DATA_UNAVAILABLE';
}

export interface SnapshotPriceInputAliasV3 {
  purpose: 'execution' | 'signal' | 'benchmark';
  instrument: string;
  sourceId?: string;
  artifactKey: 'execution/bars.parquet';
}

export interface SnapshotInputPlanV3 {
  plan: BacktestDependencyPlan;
  executionRouteKey: MarketDataBarRouteKeyV3;
  priceInputs: readonly SnapshotPriceInputAliasV3[];
  dependencyClosure: BacktestSnapshotManifestV3['dependencyClosure'];
  warmup: BacktestSnapshotManifestV3['warmup'];
}

function unavailable(message: string): never {
  throw new SnapshotV3InputPlanError(message);
}

/** Resolve explicit aliases; a planned dependency is not evidence that its data is ready. */
export const planSnapshotInputsV3 = (input: BacktestDependencyPlanInput): SnapshotInputPlanV3 => {
  strategySchema.parse(input.strategy);
  const strategy = input.strategy;
  const runConfig = runConfigSchemaV3.parse(input.runConfig);
  const bindings = runConfig.priceInputBindings;
  if (!bindings) unavailable('缺少显式信号和基准价格绑定，不能生成完整 V3 Snapshot');
  const instrument = strategy.executionInstrument;
  if (
    strategy.execution.mode !== 'exchange' ||
    instrument.assetType === 'fund' ||
    strategy.primaryTimeframe !== '1d'
  ) {
    unavailable('当前 V3 完整冻结仅支持股票/ETF 日线的显式同坐标输入');
  }
  const plan = planBacktestDependencies({ ...input, runConfig });
  const invalidWarmup = plan.blockingIssues.find((issue) => issue.code === 'INVALID_WARMUP_RANGE');
  if (invalidWarmup) unavailable(invalidWarmup.message);
  if (plan.requiredFx.length > 0) unavailable('V3 跨币种 FX 冻结尚未就绪');
  if (plan.benchmark.instrument !== plan.executionInstrument) {
    unavailable('基准绑定 execution-series 要求与执行标的身份完全一致');
  }
  const expectedIds = new Set(plan.signalSources.map((source) => source.id));
  if (
    bindings.signals.length !== expectedIds.size ||
    bindings.signals.some((binding) => !expectedIds.has(binding.sourceId))
  ) {
    unavailable('价格绑定必须准确覆盖策略实际引用的信号 sourceId');
  }
  for (const source of plan.signalSources) {
    if (source.instrument !== plan.executionInstrument || source.timeframe !== '1d') {
      unavailable(`信号 ${source.id} 不能复用不同标的或周期的执行价格序列`);
    }
  }
  const executionRouteKey = marketDataBarRouteKeyV3Schema.parse({
    kind: 'bar',
    market: instrument.market,
    assetType: instrument.assetType === 'stock' ? 'STOCK' : 'ETF',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: runConfig.executionPriceProtocol.priceBasis.adjustment,
  });
  const priceInputs: SnapshotPriceInputAliasV3[] = [
    {
      purpose: 'execution',
      instrument: plan.executionInstrument,
      artifactKey: 'execution/bars.parquet',
    },
    ...plan.signalSources.map((source) => ({
      purpose: 'signal' as const,
      instrument: source.instrument,
      sourceId: source.id,
      artifactKey: 'execution/bars.parquet' as const,
    })),
    {
      purpose: 'benchmark',
      instrument: plan.benchmark.instrument,
      artifactKey: 'execution/bars.parquet',
    },
  ];
  // Keep logical uses in the closure, with physical aliases frozen separately.
  const datasets = plan.datasets.map(
    ({ instrument: identity, purpose, requestedTimeframe, baseTimeframe }) => ({
      instrument: identity,
      purpose,
      requestedTimeframe,
      baseTimeframe,
    }),
  );
  return {
    plan,
    executionRouteKey,
    priceInputs,
    warmup: {
      lookbackPeriods: plan.warmup.lookbackPeriods,
      lookbackTimeframe: plan.warmup.lookbackTimeframe,
      startDate: plan.warmup.startDate,
      rangePolicyVersion: plan.warmup.rangePolicyVersion,
      calendarBufferDays: plan.warmup.calendarBufferDays,
    },
    dependencyClosure: {
      signalSources: [...new Set(plan.signalSources.map((source) => source.instrument))],
      executionInstrument: plan.executionInstrument,
      benchmark: plan.benchmark.instrument,
      requiredFx: [...plan.requiredFx],
      corporateActions: [...plan.corporateActions.requiredInstruments],
      calendars: [...plan.calendarMarkets],
      instrumentFacts: plan.identities.map((identity) => identity.instrument),
      baseTimeframes: [...new Set(datasets.map((dataset) => dataset.baseTimeframe))],
      datasets,
    },
  };
};
