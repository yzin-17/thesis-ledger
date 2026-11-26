import { z } from 'zod';
import { backtestDailyOrderExecutionSchema } from './backtest-daily-orders.js';
import { dailyOrderExecutionForStrategySchema } from './backtest-daily-order-validation.js';
import { validateBooleanExpression, validateExpressionDeclarations } from './backtest-expression-validation.js';
import { backtestTradePlanSchema, validateTradePlanSources } from './backtest-trade-plan.js';
import {
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
  positiveRatioStringSchema,
} from './monetary-values.js';
import {
  backtestTimeframeSchema,
  backtestCurrencySchema,
  type Timeframe,
  assetSymbolRefSchema,
  signalSourceSchema,
  seriesFieldSchema,
  type SignalSource,
  currencyForMarket,
} from './backtest-values.js';
export { numericExpressionSchema, booleanExpressionSchema, expressionSchema } from './backtest-expression.js';
export type { PositionStateField, NumericExpression, BooleanExpression, Expression } from './backtest-expression.js';
import { expressionSchema, type Expression } from './backtest-expression.js';
const positiveIntegerSchema = z.number().int().positive();

const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: 'custom', path, message });


export const sizingRuleSchema = z.union([
  z.object({ type: z.literal('fixedAmount'), amount: positiveDecimalStringSchema }).strict(),
  z
    .object({
      type: z.literal('percentOfEquity'),
      percent: positiveRatioStringSchema,
    })
    .strict(),
  z.object({ type: z.literal('fixedQuantity'), quantity: positiveDecimalStringSchema }).strict(),
  z
    .object({
      type: z.literal('targetWeight'),
      weight: positiveRatioStringSchema,
    })
    .strict(),
]);
export type SizingRule = z.infer<typeof sizingRuleSchema>;

export const riskRuleSchema = z.union([
  z
    .object({
      type: z.literal('fixedStop'),
      percent: positiveRatioStringSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('fixedTakeProfit'),
      percent: positiveRatioStringSchema,
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
  backtestDailyOrderExecutionSchema,
  navExecutionConfigSchema,
]);
export type ExecutionConfig = z.infer<typeof executionConfigSchema>;

export const strategyBaseSchema = z
  .object({
    schemaVersion: z.literal('strategy-definition-v1'),
    name: z.string().trim().min(1),
    description: z.string().max(2000).optional(),
    signalSources: z.array(signalSourceSchema.extend({ series: z.array(seriesFieldSchema) })),
    entryTrigger: z.enum(['rising-edge', 'while-flat']).optional(),
    executionInstrument: assetSymbolRefSchema,
    primaryTimeframe: backtestTimeframeSchema,
    // Keep these as unknown at the first parse boundary so semantic AST
    // errors can be reported at entry.type/sourceId rather than only as a
    // top-level union error.
    entry: z.unknown(),
    exit: z.unknown(),
    sizing: sizingRuleSchema,
    risk: z.array(riskRuleSchema),
    tradePlan: backtestTradePlanSchema.optional(),
    execution: z.unknown(),
    cost: strategyCostModelSchema,
    benchmark: assetSymbolRefSchema.optional(),
  })
  .strict();

const exchangeTimeframes = new Set<Timeframe>(['1d', '60m', '30m', '15m', '5m', '1m']);

function validateStrategySignalSources(value: z.infer<typeof strategyBaseSchema>, ctx: z.RefinementCtx): Map<string, SignalSource> {
  const sourceIds = new Set<string>();
  const sources = new Map<string, SignalSource>();
  for (const [index, source] of value.signalSources.entries()) {
    if (!source.priceCoordinate)
      issue(ctx, ['signalSources', index, 'priceCoordinate'], '策略必须明确价格来源的坐标');
    if (sourceIds.has(source.id))
      issue(ctx, ['signalSources', index, 'id'], 'SignalSource id 必须唯一且稳定');
    sourceIds.add(source.id);
    sources.set(source.id, source);
    if (new Set(source.series).size !== source.series.length)
      issue(ctx, ['signalSources', index, 'series'], 'series 不得重复');
    const isFund = source.asset.assetType === 'fund';
    if (isFund && source.priceCoordinate !== 'native-nav')
      issue(ctx, ['signalSources', index, 'priceCoordinate'], '基金净值来源必须使用 native-nav 坐标');
    if (!isFund && source.priceCoordinate === 'native-nav')
      issue(ctx, ['signalSources', index, 'priceCoordinate'], '股票／ETF 不能使用 native-nav 坐标');
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
  return sources;
}

export const strategySchema = strategyBaseSchema.superRefine((value, ctx) => {
  const sources = validateStrategySignalSources(value, ctx);
  validateTradePlanSources(value.tradePlan, sources, value.executionInstrument,value.primaryTimeframe, ctx);
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
  if (executionConfig?.timing === 'dailyBarOrders') {
    if (value.primaryTimeframe !== '1d') issue(ctx, ['primaryTimeframe'], '日线委托只支持 1d 主周期');
    appendSchemaIssues(executionConfig, dailyOrderExecutionForStrategySchema({
      sources: value.signalSources, instrument: execution, timeframe: value.primaryTimeframe,
      stageIds: value.tradePlan?.stages.map(stage => stage.id) ?? [],
      stageSides: Object.fromEntries(value.tradePlan?.stages.map(stage => [stage.id, stage.action.kind === 'add' ? 'buy' : 'sell']) ?? []),
    }), ['execution']);
  }
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
  else validateExpressionDeclarations(value.entry, sources, ctx, ['entry']);
  if (exitValid) validateBooleanExpression(value.exit, sources, ctx, ['exit']);
  else validateExpressionDeclarations(value.exit, sources, ctx, ['exit']);
});
type BacktestStrategyBase = z.infer<typeof strategyBaseSchema>;
export type BacktestStrategy = Omit<BacktestStrategyBase, 'entry' | 'exit' | 'execution'> & {
  entry: Expression;
  exit: Expression;
  execution: ExecutionConfig;
};
