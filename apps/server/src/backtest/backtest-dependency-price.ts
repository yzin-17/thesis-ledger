import {
  checkBacktestRuleCompatibility,
  strategyRequiredLookback,
  type FrozenExecutionModel,
  type RequiredRuleConversion,
  type RulePriceCoordinateFacts,
} from '@thesis-ledger/domain';
import type {
  AssetSymbolRef,
  RunConfigV3,
  BacktestStrategy,
  Timeframe,
} from '@thesis-ledger/schemas';
import type {
  BacktestDependencyPlan,
  BacktestDependencyPlanIssue,
  BacktestPlannedDataset,
  BacktestRuleCompatibilityFacts,
} from './backtest-dependency-plan.js';

const currencyByMarket = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;
const timeframeRank: Record<Timeframe, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
  '1d': 1440,
};
const warmupRangePolicyVersion = 'calendar-aware-conservative-v1';
const warmupCalendarBufferDays = 14;

const instrumentKey = (instrument: AssetSymbolRef) =>
  `${instrument.market}:${instrument.symbol}:${instrument.assetType}`;

const baseTimeframe = (timeframe: Timeframe): Timeframe => (timeframe === '1d' ? '1d' : '1m');
const uniqueSorted = <T extends string>(items: readonly T[]): T[] => [...new Set(items)].sort();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const collectUsedSignalSources = (strategy: BacktestStrategy) => {
  const fieldsBySource = new Map<string, Set<string>>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    if (
      value.type === 'series' &&
      typeof value.sourceId === 'string' &&
      typeof value.field === 'string'
    ) {
      const fields = fieldsBySource.get(value.sourceId) ?? new Set<string>();
      fields.add(value.field);
      fieldsBySource.set(value.sourceId, fields);
    }
    Object.values(value).forEach(visit);
  };
  visit(strategy.entry);
  visit(strategy.exit);
  return strategy.signalSources
    .filter((source) => fieldsBySource.has(source.id))
    .map((source) => ({
      id: source.id,
      instrument: instrumentKey(source.asset),
      timeframe: source.timeframe,
      fields: uniqueSorted([...fieldsBySource.get(source.id)!]),
      asset: source.asset,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
};

const withoutEventPredicates = (expression: unknown): unknown => {
  if (!isRecord(expression) || typeof expression.type !== 'string') return expression;
  if (expression.type === 'corporateActionEvent') {
    // Event facts are checked separately; B01 analyzes units of the remaining rules.
    return { type: 'positionState', field: 'isOpen' };
  }
  if (expression.type === 'all' || expression.type === 'any') {
    return {
      ...expression,
      conditions: Array.isArray(expression.conditions)
        ? expression.conditions.map(withoutEventPredicates)
        : expression.conditions,
    };
  }
  if (expression.type === 'not') {
    return { ...expression, expression: withoutEventPredicates(expression.expression) };
  }
  return expression;
};

const subtractUtcDays = (date: string, days: number): string | undefined => {
  if (!Number.isSafeInteger(days) || days < 0) return undefined;
  const value = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime())) return undefined;
  value.setUTCDate(value.getUTCDate() - days);
  return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : undefined;
};

const missingRuleCompatibility = (
  missingInputs: readonly string[],
): BacktestDependencyPlan['ruleCompatibility'] => ({
  status: 'pending',
  missingInputs,
  issues: [],
  requiredConversions: [],
});

const priceBasisMatches = (coordinate: RulePriceCoordinateFacts, runConfig: RunConfigV3) => {
  const actual = coordinate.priceBasis;
  const expected = runConfig.executionPriceProtocol.priceBasis;
  return (
    actual.adjustment === expected.adjustment &&
    actual.quantityBasis === expected.quantityBasis &&
    actual.volumeBasis === expected.volumeBasis &&
    actual.conversionAvailable === expected.conversionAvailable &&
    actual.conversionEvidenceRef === expected.conversionEvidenceRef &&
    actual.dividendMeaning === expected.dividendMeaning
  );
};

const planRuleCompatibility = (
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  usedSourceIds: readonly string[],
  facts: BacktestRuleCompatibilityFacts | undefined,
): {
  result: BacktestDependencyPlan['ruleCompatibility'];
  issue?: BacktestDependencyPlanIssue;
} => {
  const missing = [];
  if (!runConfig.executionModel) missing.push('runConfig.executionModel');
  if (!facts) {
    missing.push('ruleCompatibilityFacts.executionUnits');
    missing.push('ruleCompatibilityFacts.executionCoordinate');
    missing.push('ruleCompatibilityFacts.sourceCoordinates');
  }
  for (const sourceId of usedSourceIds) {
    if (facts && !facts.sourceCoordinates[sourceId]) {
      missing.push(`ruleCompatibilityFacts.sourceCoordinates.${sourceId}`);
    }
  }
  if (missing.length > 0 || !facts || !runConfig.executionModel) {
    return { result: missingRuleCompatibility(uniqueSorted(missing)) };
  }

  const mismatchPath: readonly (string | number)[] | undefined = !priceBasisMatches(
    facts.executionCoordinate,
    runConfig,
  )
    ? ['ruleCompatibilityFacts', 'executionCoordinate', 'priceBasis']
    : facts.executionCoordinate.currency !== currencyByMarket[strategy.executionInstrument.market]
      ? ['ruleCompatibilityFacts', 'executionCoordinate', 'currency']
      : undefined;
  if (mismatchPath) {
    return {
      result: missingRuleCompatibility([]),
      issue: {
        code: 'EXECUTION_PRICE_COORDINATE_MISMATCH',
        path: mismatchPath,
        message: '执行坐标与 RunConfig 冻结的价格协议或市场币种不一致',
      },
    };
  }

  const protocol = runConfig.executionPriceProtocol;
  const unitStrategy = {
    ...strategy,
    entry: withoutEventPredicates(strategy.entry),
    exit: withoutEventPredicates(strategy.exit),
  };
  const report = checkBacktestRuleCompatibility(unitStrategy, {
    protocol: {
      protocolVersion: protocol.protocolVersion,
      accountingBasis: protocol.accountingBasis,
      priceBasis: protocol.priceBasis,
      history: { basis: protocol.history.basis },
    },
    executionModel: runConfig.executionModel as FrozenExecutionModel,
    executionUnits: facts.executionUnits,
    executionCoordinate: facts.executionCoordinate,
    sourceCoordinates: facts.sourceCoordinates,
  });
  return {
    result: {
      status: report.compatible ? 'compatible' : 'blocked',
      missingInputs: [],
      issues: report.issues,
      requiredConversions: report.requiredConversions satisfies readonly RequiredRuleConversion[],
    },
    ...(!report.compatible
      ? {
          issue: {
            code: 'RULE_INCOMPATIBLE' as const,
            path: [],
            message: '策略规则与冻结的价格、记账或真实单位事实不兼容',
          },
        }
      : {}),
  };
};

export const planBacktestPriceInputs = (
  strategy: BacktestStrategy,
  runConfig: Pick<
    RunConfigV3,
    'startDate' | 'endDate' | 'baseCurrency' | 'frozenWarmupBudgetSessions'
  >,
  options: { minimumWarmupSessions?: number } = {},
) => {
  const signalSources = collectUsedSignalSources(strategy);
  const benchmark = strategy.benchmark ?? strategy.executionInstrument;
  const executionInstrument = instrumentKey(strategy.executionInstrument);
  const benchmarkKey = instrumentKey(benchmark);
  const rangeEnd = runConfig.endDate;
  const lookbackTimeframe = [
    ...signalSources.map((source) => baseTimeframe(source.timeframe)),
    baseTimeframe(strategy.primaryTimeframe),
  ].sort((left, right) => timeframeRank[left] - timeframeRank[right])[0]!;
  const lookback = strategyRequiredLookback({
    entry: withoutEventPredicates(strategy.entry),
    exit: withoutEventPredicates(strategy.exit),
  } as Parameters<typeof strategyRequiredLookback>[0]);
  const requiredSessions = Math.max(lookback.required, options.minimumWarmupSessions ?? 0);
  const warmupStartDate = subtractUtcDays(
    runConfig.startDate,
    requiredSessions * 2 + warmupCalendarBufferDays,
  );
  const blockingIssues: BacktestDependencyPlanIssue[] = [];
  if (
    runConfig.frozenWarmupBudgetSessions !== undefined &&
    lookback.required > runConfig.frozenWarmupBudgetSessions
  ) {
    blockingIssues.push({
      code: 'INVALID_WARMUP_RANGE',
      path: ['warmup'],
      message: '策略预热需求超过实验已冻结的交易日预算',
    });
  }
  if (!warmupStartDate) {
    blockingIssues.push({
      code: 'INVALID_WARMUP_RANGE',
      path: ['warmup'],
      message: '策略预热窗口无法表示为有效日期',
    });
  }
  const warmupStart = warmupStartDate ?? runConfig.startDate;
  const usedAssets = [
    ...signalSources.map((source) => ({ asset: source.asset, role: 'signal' })),
    { asset: strategy.executionInstrument, role: 'execution' },
    { asset: benchmark, role: 'benchmark' },
  ];
  const rolesByInstrument = new Map<string, Set<string>>();
  for (const { asset, role } of usedAssets) {
    const key = instrumentKey(asset);
    const roles = rolesByInstrument.get(key) ?? new Set<string>();
    roles.add(role);
    rolesByInstrument.set(key, roles);
  }
  const identities = [...rolesByInstrument]
    .map(([instrument, roles]) => ({ instrument, roles: uniqueSorted([...roles]) }))
    .sort((left, right) => left.instrument.localeCompare(right.instrument));
  const calendarMarkets = uniqueSorted(usedAssets.map(({ asset }) => asset.market));
  const requiredFx = uniqueSorted(
    usedAssets
      .map(({ asset }) => currencyByMarket[asset.market])
      .filter((currency) => currency !== runConfig.baseCurrency),
  ).map((currency) => `${currency}/${runConfig.baseCurrency}`);

  const range = { startDate: warmupStart, endDate: rangeEnd };
  const datasets: BacktestPlannedDataset[] = signalSources.map((source) => ({
    instrument: source.instrument,
    purpose: 'signal',
    requestedTimeframe: source.timeframe,
    baseTimeframe: baseTimeframe(source.timeframe),
    range,
    sourceId: source.id,
  }));
  datasets.push(
    {
      instrument: executionInstrument,
      purpose: 'execution',
      requestedTimeframe: strategy.primaryTimeframe,
      baseTimeframe: baseTimeframe(strategy.primaryTimeframe),
      range,
    },
    {
      instrument: benchmarkKey,
      purpose: 'benchmark',
      requestedTimeframe: strategy.primaryTimeframe,
      baseTimeframe: baseTimeframe(strategy.primaryTimeframe),
      range,
    },
  );
  for (const { asset } of usedAssets) {
    const key = instrumentKey(asset);
    datasets.push({
      instrument: key,
      purpose: 'instrumentFacts',
      requestedTimeframe: '1d',
      baseTimeframe: '1d',
      range,
    });
    if (asset.assetType === 'fund' && asset.market === 'CN') {
      datasets.push({
        instrument: key,
        purpose: 'nav',
        requestedTimeframe: '1d',
        baseTimeframe: '1d',
        range,
      });
    }
  }
  for (const market of calendarMarkets) {
    datasets.push({
      instrument: market,
      purpose: 'calendar',
      requestedTimeframe: '1d',
      baseTimeframe: '1d',
      range,
    });
  }
  for (const fx of requiredFx) {
    datasets.push({
      instrument: fx,
      purpose: 'fx',
      requestedTimeframe: '1d',
      baseTimeframe: '1d',
      range,
    });
  }

  const plan: Pick<
    BacktestDependencyPlan,
    | 'signalSources'
    | 'executionInstrument'
    | 'benchmark'
    | 'datasets'
    | 'identities'
    | 'calendarMarkets'
    | 'requiredFx'
    | 'warmup'
    | 'blockingIssues'
  > = {
    signalSources: signalSources.map(({ id, instrument, timeframe, fields }) => ({
      id,
      instrument,
      timeframe,
      fields,
    })),
    executionInstrument,
    benchmark: {
      instrument: benchmarkKey,
      explicit: strategy.benchmark !== undefined,
      timeframe: strategy.primaryTimeframe,
      samePriceAndReturnSemanticsRequired: true,
    },
    datasets,
    identities,
    calendarMarkets,
    requiredFx,
    warmup: {
      lookbackPeriods: requiredSessions,
      lookbackTimeframe,
      startDate: warmupStart,
      rangePolicyVersion: warmupRangePolicyVersion,
      calendarBufferDays: warmupCalendarBufferDays,
      requiresVerifiedSessionCalendar: true,
    },
    blockingIssues,
  };
  return plan;
};

export const derivePriceDependencyPlan = (
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  ruleFacts: BacktestRuleCompatibilityFacts | undefined,
) => {
  const plan = planBacktestPriceInputs(strategy, runConfig);
  const rulePlan = planRuleCompatibility(
    strategy,
    runConfig,
    plan.signalSources.map((source) => source.id),
    ruleFacts,
  );
  return {
    ...plan,
    blockingIssues: [...plan.blockingIssues, ...(rulePlan.issue ? [rulePlan.issue] : [])],
    ruleCompatibility: rulePlan.result,
  };
};
