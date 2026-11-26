import { signalPriceArtifactKeyV3 } from './backtest-signal-price-plan-v3.js';
import {
  marketDataBarRouteKeyV3Schema,
  runConfigSchemaV3,
  strategySchema,
  type BacktestSnapshotManifestV3,
  type BacktestStrategy,
  type RunConfigV3,
  type MarketDataBarRouteKeyV3,
  priceResearchStrategyIssues,
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
  artifactKey: string;
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
  validateSnapshotPriceResearch(strategy, runConfig);
  const bindings = runConfig.priceInputBindings;
  if (!bindings) unavailable('缺少显式信号和基准价格绑定，不能生成完整 V3 Snapshot');
  const instrument = strategy.executionInstrument;
  if (
    strategy.execution.mode !== 'exchange' ||
    instrument.assetType === 'fund'
  ) {
    unavailable('当前 V3 完整冻结仅支持场内股票/ETF 的显式同坐标输入');
  }
  const plan = planBacktestDependencies({ ...input, runConfig });
  if (
    runConfig.knownCashPreparation &&
    plan.blockingIssues.some((issue) => issue.path[0] === 'knownCashPreparation')
  )
    unavailable('已知现金研究不能使用公司行动策略信号');
  const invalidWarmup = plan.blockingIssues.find((issue) => issue.code === 'INVALID_WARMUP_RANGE');
  if (invalidWarmup) unavailable(invalidWarmup.message);
  if (plan.requiredFx.length > 0) unavailable('V3 跨币种 FX 冻结尚未就绪');
  if (plan.benchmark.instrument !== plan.executionInstrument) {
    unavailable('基准绑定 execution-series 要求与执行标的身份完全一致');
  }
  validateSnapshotSignalBindings(strategy, runConfig, plan, bindings);
  const executionRouteKey = snapshotExecutionRouteKeyV3(strategy, runConfig);
  const priceInputs: SnapshotPriceInputAliasV3[] = [
    {
      purpose: 'execution',
      instrument: plan.executionInstrument,
      artifactKey: 'execution/bars.parquet',
    },
    ...plan.signalSources.map<SnapshotPriceInputAliasV3>((source) => ({
      purpose: 'signal' as const,
      instrument: source.instrument,
      sourceId: source.id,
      artifactKey: signalPriceArtifactKeyV3(strategy, source.id, runConfig),
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

function validateSnapshotPriceResearch(strategy: BacktestStrategy, runConfig: RunConfigV3) {
  if (runConfig.priceResearch) {
    const issues = priceResearchStrategyIssues(strategy);
    if (issues.length)
      unavailable(issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
}

function validateSnapshotSignalBindings(
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  plan: BacktestDependencyPlan,
  bindings: NonNullable<RunConfigV3['priceInputBindings']>,
) {
  const expectedIds = new Set(plan.signalSources.map((source) => source.id));
  if (
    bindings.signals.length !== expectedIds.size ||
    bindings.signals.some((binding) => !expectedIds.has(binding.sourceId))
  ) {
    unavailable('价格绑定必须准确覆盖策略实际引用的信号 sourceId');
  }
  for (const source of plan.signalSources) {
    const coordinate = strategy.signalSources.find(
      (candidate) => candidate.id === source.id,
    )?.priceCoordinate;
    const binding = bindings.signals.find((candidate) => candidate.sourceId === source.id)?.binding;
    const adjustment = runConfig.executionPriceProtocol.priceBasis.adjustment;
    if (coordinate === 'run' && binding !== 'execution-series')
      unavailable(`信号 ${source.id} 必须绑定本次冻结执行价格`);
    if (coordinate === 'research' && !runConfig.priceResearch && adjustment !== 'hfq')
      unavailable(`信号 ${source.id} 要求后复权研究价格，不能使用其他运行坐标`);
    if (coordinate === 'actual' && !runConfig.priceResearch && adjustment !== 'none')
      unavailable(`信号 ${source.id} 要求实际价格，不能使用复权执行价格`);
    if (coordinate === 'native-nav') unavailable(`信号 ${source.id} 必须走净值冻结与申赎入口`);
    if (
      runConfig.priceResearch &&
      (coordinate === 'actual') !== (binding === 'actual-price-series')
    )
      unavailable(`信号 ${source.id} 的价格坐标与冻结绑定不一致`);
    if (source.instrument !== plan.executionInstrument) {
      unavailable(`信号 ${source.id} 不能复用其他标的的执行价格序列`);
    }
  }
}

/** 盘中只冻结原始分钟，聚合由本地同一完成区间规则执行。 */
export function snapshotExecutionRouteKeyV3(strategy: BacktestStrategy, runConfig: RunConfigV3) {
  const instrument = strategy.executionInstrument;
  if (instrument.assetType === 'fund') unavailable('场外基金没有场内行情路线');
  const daily = strategy.primaryTimeframe === '1d';
  return marketDataBarRouteKeyV3Schema.parse({
    kind: 'bar', market: instrument.market,
    assetType: instrument.assetType === 'stock' ? 'STOCK' : 'ETF',
    capability: daily ? 'DAILY_BAR' : 'MINUTE_BAR',
    timeframe: daily ? '1d' : '1m',
    adjustment: runConfig.executionPriceProtocol.priceBasis.adjustment,
  });
}
