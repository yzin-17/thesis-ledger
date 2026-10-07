import { z } from 'zod';
import type { BacktestDecimalString } from './backtest-values.js';
import {
  decimalStringSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from './monetary-values.js';
import { corporateActionTypeSchema, type CorporateActionType } from './backtest-data.js';
import {
  backtestTimeframeSchema,
  backtestCurrencySchema,
  seriesFieldSchema,
  type Timeframe,
  type SeriesField,
  assetSymbolRefSchema,
  signalSourceSchema,
  type SignalSource,
  currencyForMarket,
} from './backtest-values.js';
type DecimalString = BacktestDecimalString;
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
  /**
   * A point-in-time corporate-action signal dependency. Matching uses the
   * action's explicit effectiveDate, and visibility requires strategyVisibility;
   * legacy occurredAt/availableAt alone do not make an action signal-eligible.
   */
  | { type: 'corporateActionEvent'; eventType: CorporateActionType }
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

export const numericExpressionSchema: z.ZodType<NumericExpression> = z.lazy(() =>
  z.union([
    constantExpressionSchema,
    seriesExpressionSchema,
    indicatorExpressionSchema,
    positionStateExpressionSchema,
  ]),
) as z.ZodType<NumericExpression>;

export const booleanExpressionSchema: z.ZodType<BooleanExpression> = z.lazy(() =>
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
    z
      .object({
        type: z.literal('corporateActionEvent'),
        eventType: corporateActionTypeSchema,
      })
      .strict(),
    z.object({ type: z.literal('positionState'), field: z.literal('isOpen') }).strict(),
  ]),
);

export const expressionSchema: z.ZodType<Expression> = z.union([
  numericExpressionSchema,
  booleanExpressionSchema,
]);

const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: 'custom', path, message });

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
  if (node.type === 'corporateActionEvent') return;
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

export const sizingRuleSchema = z.union([
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
export type SizingRule = z.infer<typeof sizingRuleSchema>;

export const riskRuleSchema = z.union([
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
export type RiskRule = z.infer<typeof riskRuleSchema>;

export const strategyCostModelSchema = z
  .object({
    commissionRate: nonNegativeDecimalStringSchema,
    minimumCommission: z
      .object({ amount: nonNegativeDecimalStringSchema, currency: backtestCurrencySchema })
      .strict()
      .optional(),
    slippageRate: nonNegativeDecimalStringSchema,
  })
  .strict();
export type StrategyCostModel = z.infer<typeof strategyCostModelSchema>;

export const exchangeExecutionConfigSchema = z
  .object({
    mode: z.literal('exchange'),
    orderType: z.literal('market'),
    timeInForce: z.literal('DAY'),
    timing: z.literal('nextEligibleBarOpen'),
  })
  .strict();
export const navExecutionConfigSchema = z
  .object({
    mode: z.literal('nav'),
    requestTypes: z.array(z.enum(['subscribe', 'redeem'])).min(1),
    timing: z.literal('nextAvailableNav'),
  })
  .strict();
export const executionConfigSchema = z.union([
  exchangeExecutionConfigSchema,
  navExecutionConfigSchema,
]);
export type ExecutionConfig = z.infer<typeof executionConfigSchema>;

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
    sizing: sizingRuleSchema,
    risk: z.array(riskRuleSchema),
    execution: z.unknown(),
    cost: strategyCostModelSchema,
    benchmark: assetSymbolRefSchema.optional(),
  })
  .strict();

const exchangeTimeframes = new Set<Timeframe>(['1d', '60m', '30m', '15m', '5m', '1m']);

export const strategySchema = strategyBaseSchema.superRefine((value, ctx) => {
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
  const entryValid = appendSchemaIssues(value.entry, expressionSchema, ['entry']);
  const exitValid = appendSchemaIssues(value.exit, expressionSchema, ['exit']);
  const executionValid = appendSchemaIssues(value.execution, executionConfigSchema, ['execution']);
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
type BacktestStrategyBase = z.infer<typeof strategyBaseSchema>;
export type BacktestStrategy = Omit<BacktestStrategyBase, 'entry' | 'exit' | 'execution'> & {
  entry: Expression;
  exit: Expression;
  execution: ExecutionConfig;
};
