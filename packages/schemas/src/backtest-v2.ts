import { z } from 'zod';
import {
  decimalStringSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from './ledger-v2.js';

/** V2 intentionally has its own contracts; this module does not extend V1. */

export const backtestTimeframeSchema = z.enum(['1d', '60m', '30m', '15m', '5m', '1m']);
export const strategyMarketSchemaV2 = z.enum(['CN', 'HK', 'US']);
export const backtestAssetTypeSchema = z.enum(['stock', 'etf', 'fund']);
export const backtestCurrencySchema = z.enum(['CNY', 'HKD', 'USD']);
export const seriesFieldSchema = z.enum(['open', 'high', 'low', 'close', 'volume', 'nav']);

export type Timeframe = z.infer<typeof backtestTimeframeSchema>;
type StrategyMarket = z.infer<typeof strategyMarketSchemaV2>;
export type BacktestAssetType = z.infer<typeof backtestAssetTypeSchema>;
export type BacktestCurrency = z.infer<typeof backtestCurrencySchema>;
export type SeriesField = z.infer<typeof seriesFieldSchema>;
export type BacktestDecimalString = z.infer<typeof decimalStringSchema>;
type DecimalString = BacktestDecimalString;

export const backtestMoneySchema = z
  .object({ amount: decimalStringSchema, currency: backtestCurrencySchema })
  .strict();
export type BacktestMoney = z.infer<typeof backtestMoneySchema>;
export type Money = BacktestMoney;

export const assetSymbolRefSchema = z
  .object({
    symbol: z.string().trim().min(1),
    market: strategyMarketSchemaV2,
    assetType: backtestAssetTypeSchema,
  })
  .strict();
export type AssetSymbolRef = z.infer<typeof assetSymbolRefSchema>;

export const seriesRefSchema = z
  .object({ sourceId: z.string().trim().min(1), field: seriesFieldSchema })
  .strict();
export type SeriesRef = z.infer<typeof seriesRefSchema>;

export const signalSourceSchema = z
  .object({
    id: z.string().trim().min(1),
    asset: assetSymbolRefSchema,
    timeframe: backtestTimeframeSchema,
    series: z.array(seriesFieldSchema).min(1),
  })
  .strict();
export type SignalSource = z.infer<typeof signalSourceSchema>;

const positiveIntegerSchema = z.number().int().positive();
const indicatorNameSchema = z.enum([
  'MA',
  'EMA',
  'RSI',
  'MACD',
  'ATR',
  'VWAP',
  'Highest',
  'Lowest',
]);
const indicatorParamSchema = z.union([positiveIntegerSchema, positiveDecimalStringSchema]);

export type PositionStateField = 'isOpen' | 'quantity' | 'averageCost' | 'holdingPeriods';
export type NumericExpression =
  | { type: 'constant'; value: DecimalString }
  | { type: 'series'; sourceId: string; field: SeriesField }
  | {
      type: 'indicator';
      name: z.infer<typeof indicatorNameSchema>;
      input: NumericExpression;
      params: Record<string, number | DecimalString>;
      output?: 'macd' | 'signal' | 'histogram';
    }
  | { type: 'positionState'; field: Exclude<PositionStateField, 'isOpen'> };
export type BooleanExpression =
  | { type: 'all'; conditions: BooleanExpression[] }
  | { type: 'any'; conditions: BooleanExpression[] }
  | { type: 'not'; expression: BooleanExpression }
  | {
      type: 'compare';
      operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
      left: NumericExpression;
      right: NumericExpression;
    }
  | {
      type: 'cross';
      direction: 'above' | 'below';
      left: NumericExpression;
      right: NumericExpression;
    }
  | { type: 'positionState'; field: 'isOpen' };
export type Expression = NumericExpression | BooleanExpression;

const constantExpressionSchema = z
  .object({ type: z.literal('constant'), value: decimalStringSchema })
  .strict();
const seriesExpressionSchema = z
  .object({
    type: z.literal('series'),
    sourceId: z.string().trim().min(1),
    field: seriesFieldSchema,
  })
  .strict();
const positionStateExpressionSchema = z
  .object({
    type: z.literal('positionState'),
    field: z.enum(['isOpen', 'quantity', 'averageCost', 'holdingPeriods']),
  })
  .strict();

const indicatorExpressionSchema: z.ZodType<NumericExpression> = z.lazy(() =>
  z
    .object({
      type: z.literal('indicator'),
      name: indicatorNameSchema,
      input: numericExpressionSchema,
      params: z.record(z.string(), indicatorParamSchema),
      output: z.enum(['macd', 'signal', 'histogram']).optional(),
    })
    .strict(),
) as z.ZodType<NumericExpression>;

const numericExpressionSchema: z.ZodType<NumericExpression> = z.lazy(() =>
  z.union([
    constantExpressionSchema,
    seriesExpressionSchema,
    indicatorExpressionSchema,
    positionStateExpressionSchema,
  ]),
) as z.ZodType<NumericExpression>;

const booleanExpressionSchema: z.ZodType<BooleanExpression> = z.lazy(() =>
  z.union([
    z
      .object({ type: z.literal('all'), conditions: z.array(booleanExpressionSchema).min(1) })
      .strict(),
    z
      .object({ type: z.literal('any'), conditions: z.array(booleanExpressionSchema).min(1) })
      .strict(),
    z.object({ type: z.literal('not'), expression: booleanExpressionSchema }).strict(),
    z
      .object({
        type: z.literal('compare'),
        operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
        left: numericExpressionSchema,
        right: numericExpressionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('cross'),
        direction: z.enum(['above', 'below']),
        left: numericExpressionSchema,
        right: numericExpressionSchema,
      })
      .strict(),
    z.object({ type: z.literal('positionState'), field: z.literal('isOpen') }).strict(),
  ]),
);

export const numericExpressionSchemaV2 = numericExpressionSchema;
export const booleanExpressionSchemaV2 = booleanExpressionSchema;
export const expressionSchemaV2: z.ZodType<Expression> = z.union([
  numericExpressionSchema,
  booleanExpressionSchema,
]);

const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: 'custom', path, message });

const decimalIsNonNegative = (value: string) => !value.startsWith('-');
const decimalIsPositive = (value: string) => /[1-9]/.test(value);
const requiredIndicatorParams: Record<string, string[]> = {
  MA: ['period'],
  EMA: ['period'],
  RSI: ['period'],
  MACD: ['fastPeriod', 'slowPeriod', 'signalPeriod'],
  ATR: ['period'],
  VWAP: ['period'],
  Highest: ['period'],
  Lowest: ['period'],
};

const validateNumericExpression = (
  value: unknown,
  sources: Map<string, SignalSource>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): 'numeric' | 'boolean' | 'unknown' => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issue(ctx, [...path, 'type'], '必须是受支持的 AST 节点');
    return 'unknown';
  }
  const node = value as Record<string, unknown>;
  if (node.type === 'constant') return 'numeric';
  if (node.type === 'positionState') {
    if (node.field === 'isOpen') {
      issue(ctx, [...path, 'field'], 'isOpen 是布尔值，不能作为数值表达式');
      return 'boolean';
    }
    return 'numeric';
  }
  if (node.type === 'series') {
    const sourceId = typeof node.sourceId === 'string' ? node.sourceId : undefined;
    const source = sourceId ? sources.get(sourceId) : undefined;
    if (!source) issue(ctx, [...path, 'sourceId'], '未知 SignalSource');
    if (
      source &&
      typeof node.field === 'string' &&
      !source.series.includes(node.field as SeriesField)
    ) {
      issue(ctx, [...path, 'field'], 'Series 未在 SignalSource 中声明');
    }
    return 'numeric';
  }
  if (node.type === 'indicator') {
    const name = typeof node.name === 'string' ? node.name : undefined;
    if (
      !name ||
      !indicatorNameSchema.options.includes(name as (typeof indicatorNameSchema.options)[number])
    ) {
      issue(ctx, [...path, 'name'], '未知 Indicator');
      return 'numeric';
    }
    validateNumericExpression(node.input, sources, ctx, [...path, 'input']);
    const params =
      node.params && typeof node.params === 'object' && !Array.isArray(node.params)
        ? (node.params as Record<string, unknown>)
        : {};
    const required = requiredIndicatorParams[name] ?? [];
    for (const param of required) {
      if (!(param in params)) issue(ctx, [...path, 'params', param], '缺少 Indicator 参数');
    }
    for (const param of Object.keys(params)) {
      if (!required.includes(param)) issue(ctx, [...path, 'params', param], '未知 Indicator 参数');
      const val = params[param];
      if (typeof val === 'number' && (!Number.isInteger(val) || val <= 0)) {
        issue(ctx, [...path, 'params', param], '参数必须是正整数');
      }
      if (
        typeof val === 'string' &&
        param.toLowerCase().includes('period') &&
        !/^[1-9]\d*$/.test(val)
      ) {
        issue(ctx, [...path, 'params', param], '周期参数必须是正整数');
      }
    }
    if (name === 'MACD' && typeof node.output !== 'string') {
      issue(ctx, [...path, 'output'], 'MACD 必须显式选择 output');
    }
    if (name !== 'MACD' && node.output !== undefined) {
      issue(ctx, [...path, 'output'], '该 Indicator 不支持 output selector');
    }
    return 'numeric';
  }
  issue(ctx, [...path, 'type'], '未知或不支持的数值 AST 节点');
  return 'unknown';
};

const validateBooleanExpression = (
  value: unknown,
  sources: Map<string, SignalSource>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issue(ctx, [...path, 'type'], '必须是布尔 AST 节点');
    return;
  }
  const node = value as Record<string, unknown>;
  if (node.type === 'all' || node.type === 'any') {
    if (!Array.isArray(node.conditions))
      issue(ctx, [...path, 'conditions'], 'conditions 必须是数组');
    else
      node.conditions.forEach((item, index) =>
        validateBooleanExpression(item, sources, ctx, [...path, 'conditions', index]),
      );
    return;
  }
  if (node.type === 'not') {
    validateBooleanExpression(node.expression, sources, ctx, [...path, 'expression']);
    return;
  }
  if (node.type === 'positionState' && node.field === 'isOpen') return;
  if (node.type === 'compare' || node.type === 'cross') {
    const leftType = validateNumericExpression(node.left, sources, ctx, [...path, 'left']);
    const rightType = validateNumericExpression(node.right, sources, ctx, [...path, 'right']);
    if (leftType !== 'numeric') issue(ctx, [...path, 'left'], '比较输入必须是数值表达式');
    if (rightType !== 'numeric') issue(ctx, [...path, 'right'], '比较输入必须是数值表达式');
    return;
  }
  issue(ctx, [...path, 'type'], '未知或不支持的布尔 AST 节点');
};

const isRatioAtMostOne = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return whole === '0' || (whole === '1' && /^0*$/.test(fraction));
};

export const sizingRuleSchemaV2 = z.union([
  z.object({ type: z.literal('fixedAmount'), amount: positiveDecimalStringSchema }).strict(),
  z
    .object({
      type: z.literal('percentOfEquity'),
      percent: positiveDecimalStringSchema.refine(isRatioAtMostOne, 'ratio 必须小于或等于 1'),
    })
    .strict(),
  z.object({ type: z.literal('fixedQuantity'), quantity: positiveDecimalStringSchema }).strict(),
  z
    .object({
      type: z.literal('targetWeight'),
      weight: positiveDecimalStringSchema.refine(isRatioAtMostOne, 'ratio 必须小于或等于 1'),
    })
    .strict(),
]);
export type SizingRule = z.infer<typeof sizingRuleSchemaV2>;

export const riskRuleSchemaV2 = z.union([
  z
    .object({
      type: z.literal('fixedStop'),
      percent: positiveDecimalStringSchema.refine(isRatioAtMostOne, 'ratio 必须小于或等于 1'),
    })
    .strict(),
  z
    .object({
      type: z.literal('fixedTakeProfit'),
      percent: positiveDecimalStringSchema.refine(isRatioAtMostOne, 'ratio 必须小于或等于 1'),
    })
    .strict(),
  z.object({ type: z.literal('maxHoldingPeriod'), periods: positiveIntegerSchema }).strict(),
]);
export type RiskRule = z.infer<typeof riskRuleSchemaV2>;

export const strategyCostModelSchemaV2 = z
  .object({
    commissionRate: nonNegativeDecimalStringSchema,
    minimumCommission: z
      .object({ amount: nonNegativeDecimalStringSchema, currency: backtestCurrencySchema })
      .strict()
      .optional(),
    slippageRate: nonNegativeDecimalStringSchema,
  })
  .strict();
export type StrategyCostModel = z.infer<typeof strategyCostModelSchemaV2>;

export const exchangeExecutionConfigSchemaV2 = z
  .object({
    mode: z.literal('exchange'),
    orderType: z.literal('market'),
    timeInForce: z.literal('DAY'),
    timing: z.literal('nextEligibleBarOpen'),
  })
  .strict();
export const navExecutionConfigSchemaV2 = z
  .object({
    mode: z.literal('nav'),
    requestTypes: z.array(z.enum(['subscribe', 'redeem'])).min(1),
    timing: z.literal('nextAvailableNav'),
  })
  .strict();
export const executionConfigSchemaV2 = z.union([
  exchangeExecutionConfigSchemaV2,
  navExecutionConfigSchemaV2,
]);
export type ExecutionConfig = z.infer<typeof executionConfigSchemaV2>;

const strategyBaseSchema = z
  .object({
    schemaVersion: z.literal('2'),
    name: z.string().trim().min(1),
    description: z.string().max(2000).optional(),
    signalSources: z.array(signalSourceSchema).min(1),
    executionInstrument: assetSymbolRefSchema,
    primaryTimeframe: backtestTimeframeSchema,
    // Keep these as unknown at the first parse boundary so semantic AST
    // errors can be reported at entry.type/sourceId rather than only as a
    // top-level union error.
    entry: z.unknown(),
    exit: z.unknown(),
    sizing: sizingRuleSchemaV2,
    risk: z.array(riskRuleSchemaV2),
    execution: z.unknown(),
    cost: strategyCostModelSchemaV2,
    benchmark: assetSymbolRefSchema.optional(),
  })
  .strict();

const currencyForMarket: Record<StrategyMarket, BacktestCurrency> = {
  CN: 'CNY',
  HK: 'HKD',
  US: 'USD',
};
const exchangeTimeframes = new Set<Timeframe>(['1d', '60m', '30m', '15m', '5m', '1m']);

export const strategySchemaV2 = strategyBaseSchema.superRefine((value, ctx) => {
  const sourceIds = new Set<string>();
  const sources = new Map<string, SignalSource>();
  for (const [index, source] of value.signalSources.entries()) {
    if (sourceIds.has(source.id))
      issue(ctx, ['signalSources', index, 'id'], 'SignalSource id 必须唯一且稳定');
    sourceIds.add(source.id);
    sources.set(source.id, source);
    if (new Set(source.series).size !== source.series.length)
      issue(ctx, ['signalSources', index, 'series'], 'series 不得重复');
    const isFund = source.asset.assetType === 'fund';
    if (
      isFund &&
      (source.asset.market !== 'CN' ||
        source.timeframe !== '1d' ||
        source.series.some((field) => field !== 'nav'))
    ) {
      issue(ctx, ['signalSources', index], 'NAV Fund 只支持 CN、1d 和 nav Series');
    }
    if (!isFund && source.series.some((field) => field === 'nav')) {
      issue(ctx, ['signalSources', index, 'series'], 'Stock/ETF 不支持 nav Series');
    }
    if (!isFund && !exchangeTimeframes.has(source.timeframe)) {
      issue(ctx, ['signalSources', index, 'timeframe'], '不支持的交易所周期');
    }
  }
  if (!value.signalSources.some((source) => source.timeframe === value.primaryTimeframe)) {
    issue(ctx, ['primaryTimeframe'], '至少一个 SignalSource 必须使用 primaryTimeframe');
  }
  const execution = value.executionInstrument;
  const appendSchemaIssues = (
    candidate: unknown,
    schema: z.ZodTypeAny,
    path: (string | number)[],
  ) => {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) return true;
    for (const schemaIssue of parsed.error.issues) {
      const issuePath =
        schemaIssue.path.length > 0
          ? schemaIssue.path.map((segment) =>
              typeof segment === 'symbol' ? String(segment) : segment,
            )
          : ['type'];
      issue(ctx, [...path, ...issuePath], schemaIssue.message);
    }
    return false;
  };
  const entryValid = appendSchemaIssues(value.entry, expressionSchemaV2, ['entry']);
  const exitValid = appendSchemaIssues(value.exit, expressionSchemaV2, ['exit']);
  const executionValid = appendSchemaIssues(value.execution, executionConfigSchemaV2, [
    'execution',
  ]);
  const executionCurrency = currencyForMarket[execution.market];
  if (
    execution.assetType === 'fund' &&
    (execution.market !== 'CN' || value.primaryTimeframe !== '1d')
  ) {
    issue(ctx, ['executionInstrument'], 'NAV Fund 只支持 CN 日频');
  }
  const executionConfig = executionValid ? (value.execution as ExecutionConfig) : undefined;
  if (
    executionConfig?.mode === 'nav' &&
    (execution.assetType !== 'fund' || execution.market !== 'CN')
  ) {
    issue(ctx, ['execution', 'mode'], 'NavExecution 只支持 CN NAV Fund');
  }
  if (executionConfig?.mode === 'exchange' && execution.assetType === 'fund') {
    issue(ctx, ['execution', 'mode'], 'ExchangeExecution 不支持 NAV Fund');
  }
  if (value.cost.minimumCommission && value.cost.minimumCommission.currency !== executionCurrency) {
    issue(ctx, ['cost', 'minimumCommission', 'currency'], 'minimumCommission 必须使用执行标的币种');
  }
  if (value.benchmark?.assetType === 'fund' && value.benchmark.market !== 'CN') {
    issue(ctx, ['benchmark'], 'HK/US NAV Fund 不受支持');
  }
  if (entryValid) validateBooleanExpression(value.entry, sources, ctx, ['entry']);
  if (exitValid) validateBooleanExpression(value.exit, sources, ctx, ['exit']);
});
type StrategySchemaV2Base = z.infer<typeof strategyBaseSchema>;
export type StrategySchemaV2 = Omit<StrategySchemaV2Base, 'entry' | 'exit' | 'execution'> & {
  entry: Expression;
  exit: Expression;
  execution: ExecutionConfig;
};

export const strategySchema = strategySchemaV2;

export const portfolioValuationPolicySchema = z
  .object({
    baseTimezone: z.string().trim().min(1),
    dailyValuationTime: z.string().regex(/^\d{2}:\d{2}$/),
    pricePolicy: z.literal('latestAvailable'),
    fxPolicy: z.literal('latestAvailable'),
  })
  .strict();
export type PortfolioValuationPolicy = z.infer<typeof portfolioValuationPolicySchema>;

const initialCashSchema = z
  .object({
    CNY: nonNegativeDecimalStringSchema.optional(),
    HKD: nonNegativeDecimalStringSchema.optional(),
    USD: nonNegativeDecimalStringSchema.optional(),
  })
  .strict();

export const runConfigSchemaV2 = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    dataAsOf: z.iso.datetime({ offset: true }),
    baseCurrency: backtestCurrencySchema,
    initialCash: initialCashSchema,
    valuationPolicy: portfolioValuationPolicySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate > value.endDate)
      issue(ctx, ['endDate'], 'startDate 必须早于或等于 endDate');
    if (
      !Object.values(value.initialCash).some(
        (amount) => amount !== undefined && decimalIsNonNegative(amount),
      )
    ) {
      issue(ctx, ['initialCash'], '至少提供一种初始现金');
    }
  });
export type RunConfig = z.infer<typeof runConfigSchemaV2>;
export const runConfigSchema = runConfigSchemaV2;

/**
 * Strict V2 Run creation boundary. Market data is intentionally absent: the
 * Server owns snapshot construction and the Runner only receives its final
 * SnapshotRef/ArtifactRefs.
 */
export const backtestRunCreateSchemaV2 = z
  .object({
    strategyVersionId: z.uuid(),
    runConfig: runConfigSchemaV2,
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict();
export type BacktestRunCreateV2 = z.infer<typeof backtestRunCreateSchemaV2>;

export const backtestRunStatusSchemaV2 = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export type BacktestRunStatusV2 = z.infer<typeof backtestRunStatusSchemaV2>;

export const backtestRunStageSchemaV2 = z.enum([
  'queued',
  'snapshot-finalized',
  'running',
  'persisting-result',
  'succeeded',
  'failed',
  'cancelled',
]);
export type BacktestRunStageV2 = z.infer<typeof backtestRunStageSchemaV2>;

export const backtestRunResponseSchemaV2 = z
  .object({
    id: z.string().trim().min(1),
    strategyVersionId: z.string().trim().min(1),
    mode: z.literal('V2'),
    status: backtestRunStatusSchemaV2,
    stage: backtestRunStageSchemaV2.nullable().optional(),
    snapshotId: z.string().trim().min(1).nullable().optional(),
    errorCode: z.string().trim().min(1).nullable().optional(),
    errorSummary: z.string().nullable().optional(),
  })
  .passthrough();
export type BacktestRunResponseV2 = z.infer<typeof backtestRunResponseSchemaV2>;

export const simulationFillSchemaV2 = z
  .object({
    fillId: z.string().trim().min(1),
    orderId: z.string().trim().min(1),
    executionSymbol: z.string().trim().min(1),
    side: z.enum(['buy', 'sell']),
    quantity: positiveDecimalStringSchema,
    price: positiveDecimalStringSchema,
    charges: z.array(backtestMoneySchema),
    occurredAt: z.iso.datetime({ offset: true }),
    availableAt: z.iso.datetime({ offset: true }),
    reason: z.enum(['signal', 'risk']),
  })
  .strict();
export type SimulationFill = z.infer<typeof simulationFillSchemaV2>;
export const simulationFillSchema = simulationFillSchemaV2;

export const backtestTradeSchemaV2 = z
  .object({
    source: z.literal('BACKTEST'),
    executionSymbol: z.string().trim().min(1),
    openedAt: z.iso.datetime({ offset: true }),
    closedAt: z.iso.datetime({ offset: true }),
    entryQuantity: positiveDecimalStringSchema,
    exitQuantity: positiveDecimalStringSchema,
    entryValue: backtestMoneySchema,
    exitValue: backtestMoneySchema,
    realizedPnl: backtestMoneySchema,
    charges: z.array(backtestMoneySchema),
    returnRate: decimalStringSchema,
    closeReason: z.enum(['signal', 'risk']),
    fillIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();
export type BacktestTradeV2 = z.infer<typeof backtestTradeSchemaV2>;
export type BacktestTrade = BacktestTradeV2;
export const backtestTradeSchema = backtestTradeSchemaV2;

export const backtestMetricSchema = z
  .object({
    status: z.enum(['available', 'unavailable', 'warning']),
    value: decimalStringSchema.optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'available' && value.value === undefined)
      issue(ctx, ['value'], 'available 指标必须有 value');
    if (value.status !== 'available' && value.reason === undefined)
      issue(ctx, ['reason'], '不可用或警告指标必须有 reason');
  });

export const rejectedBacktestOrderSchema = z
  .object({
    orderId: z.string().trim().min(1),
    executionSymbol: z.string().trim().min(1),
    side: z.enum(['buy', 'sell']),
    reasonCode: z.string().trim().min(1),
    message: z.string().trim().min(1),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const backtestEquityPointSchema = z
  .object({
    occurredAt: z.iso.datetime({ offset: true }),
    value: backtestMoneySchema,
    availableAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const backtestDrawdownPointSchema = z
  .object({
    occurredAt: z.iso.datetime({ offset: true }),
    equity: backtestMoneySchema,
    peak: backtestMoneySchema,
    drawdown: decimalStringSchema,
    availableAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const backtestResultSchemaV2 = z
  .object({
    source: z.literal('BACKTEST'),
    runId: z.string().trim().min(1),
    strategyVersionId: z.string().trim().min(1),
    snapshotId: z.string().trim().min(1),
    engineVersion: z.string().trim().min(1),
    schemaVersion: z.literal('2'),
    marketRuleVersion: z.string().trim().min(1),
    calendarVersion: z.string().trim().min(1),
    aggregationVersion: z.string().trim().min(1),
    contentHash: z.string().trim().min(1),
    resultChecksum: z.string().trim().min(1),
    completeness: z.enum(['complete', 'partial', 'unavailable']),
    warnings: z.array(z.string()),
    rejectedOrders: z.array(rejectedBacktestOrderSchema),
    rejectedNavRequests: z.array(rejectedBacktestOrderSchema).optional(),
    simulationFills: z.array(simulationFillSchemaV2),
    trades: z.array(backtestTradeSchemaV2),
    equityCurve: z.array(backtestEquityPointSchema),
    drawdownCurve: z.array(backtestDrawdownPointSchema).optional(),
    metrics: z.record(z.string(), backtestMetricSchema),
    benchmark: z.record(z.string(), backtestMetricSchema).optional(),
  })
  .strict();
export type BacktestResultV2 = z.infer<typeof backtestResultSchemaV2>;
export type BacktestResult = BacktestResultV2;
export const backtestResultSchema = backtestResultSchemaV2;

export const backtestErrorCodes = [
  'INVALID_SCHEMA',
  'UNKNOWN_FIELD',
  'UNKNOWN_SOURCE',
  'UNKNOWN_SERIES',
  'UNKNOWN_INDICATOR',
  'INVALID_PARAMETER',
  'TYPE_MISMATCH',
  'UNSUPPORTED_CAPABILITY',
  'DATA_UNAVAILABLE',
  'INSUFFICIENT_CASH',
  'INSUFFICIENT_POSITION',
  'ORDER_REJECTED',
  'SNAPSHOT_HASH_MISMATCH',
  'FUTURE_DATA',
  'RULE_REJECTED',
  'NAV_DELAYED',
  'UNSUPPORTED_CORPORATE_ACTION',
  'ARTIFACT_UNAVAILABLE',
  'CANCELLED',
  'INTERNAL_ERROR',
] as const;
export const backtestErrorSchema = z
  .object({
    code: z.enum(backtestErrorCodes),
    message: z.string().trim().min(1),
    path: z.array(z.union([z.string(), z.number()])),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type BacktestError = z.infer<typeof backtestErrorSchema>;
export type BacktestErrorCode = (typeof backtestErrorCodes)[number];
export const backtestErrorSchemaV2 = backtestErrorSchema;

export interface StrategyRunConfigValidationError {
  code: 'INSUFFICIENT_CASH';
  message: string;
  path: ['runConfig', 'initialCash', BacktestCurrency];
}

export interface StrategyRunConfigValidationResult {
  valid: boolean;
  errors: StrategyRunConfigValidationError[];
}

/**
 * Cross-contract validation kept separate from the Run create DTO. The Server
 * can call this after resolving an immutable StrategyVersion and parsing a
 * RunConfig, without making either public schema depend on the other.
 */
export const validateStrategyRunConfig = (
  strategy: StrategySchemaV2,
  runConfig: RunConfig,
): StrategyRunConfigValidationResult => {
  const executionCurrency = currencyForMarket[strategy.executionInstrument.market];
  const amount = runConfig.initialCash[executionCurrency];
  if (amount !== undefined && decimalIsPositive(amount)) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: [
      {
        code: 'INSUFFICIENT_CASH',
        path: ['runConfig', 'initialCash', executionCurrency],
        message: `执行标的需要 ${executionCurrency} 的正数已结算初始现金`,
      },
    ],
  };
};

export const backtestContractSchemas = {
  strategy: strategySchemaV2,
  runConfig: runConfigSchemaV2,
  result: backtestResultSchemaV2,
  error: backtestErrorSchema,
} as const;
