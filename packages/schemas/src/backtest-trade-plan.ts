import { z } from 'zod';
import { positiveDecimalStringSchema, positiveRatioStringSchema } from './monetary-values.js';
import type { SignalSource } from './backtest-values.js';
import { booleanExpressionSchema } from './backtest-expression.js';
import { validateBooleanExpression } from './backtest-expression-validation.js';
import {
  tradePlanMonthlyRebalanceSchema,
  validateTradePlanAllocations,
} from './backtest-trade-monthly-rebalance.js';

export const tradePlanProtectionActivationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('immediate') }).describe('立即建立保护，不等待启用条件。'),
  z
    .strictObject({ kind: z.literal('condition'), condition: booleanExpressionSchema })
    .describe('持仓后条件首次成立即永久启用，本轮持仓内不撤销。'),
]);
const protectionActivation = {
  activation: tradePlanProtectionActivationSchema.optional(),
};
export const tradePlanStopSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('percent'),
    percent: positiveRatioStringSchema,
    ...protectionActivation,
  }),
  z.strictObject({
    kind: z.literal('entryAtr'),
    sourceId: z.string().min(1),
    period: z.number().int().positive().max(500),
    multiple: positiveDecimalStringSchema,
    ...protectionActivation,
  }),
]);
const trailingActivation = {
  ...protectionActivation,
  activationGainPercent: positiveDecimalStringSchema.optional(),
  breakEvenGainPercent: positiveDecimalStringSchema.optional(),
};
export const tradePlanTrailingSchema = z.union([
  z.strictObject({ drawdownPercent: positiveRatioStringSchema, ...trailingActivation }),
  z.strictObject({
    kind: z.literal('currentAtr'),
    sourceId: z.string().min(1),
    period: z.number().int().positive().max(500),
    multiple: positiveDecimalStringSchema,
    ...trailingActivation,
  }),
]);
export const tradePlanStageSchema = z.strictObject({
  id: z.string().trim().min(1).max(80),
  trigger: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('gainPercent'),
      value: positiveDecimalStringSchema.describe('上涨0.5%必须写"0.005"，50%="0.5"。'),
    }),
    z.strictObject({
      kind: z.literal('entryAtrMultiple'),
      value: positiveDecimalStringSchema.describe('冻结ATR倍数，不是百分比，不除以100。'),
    }),
  ]),
  action: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('reduce'),
      basis: z.enum(['initialQuantity', 'remainingQuantity']),
      fraction: positiveRatioStringSchema,
    }),
    z.strictObject({
      kind: z.literal('add'),
      initialFraction: positiveRatioStringSchema,
      maxEquityFraction: positiveRatioStringSchema,
    }),
  ]),
});

/** 收盘触发与后续开盘成交；阶段和冷却只由实际接受的成交推进。 */
export const backtestTradePlanSchema = z
  .strictObject({
    version: z.literal(1),
    evaluation: z.literal('barClose'),
    initialStop: tradePlanStopSchema.optional(),
    trailing: tradePlanTrailingSchema.optional(),
    cooldown: z
      .strictObject({
        bars: z.number().int().nonnegative().max(10000),
        stopBars: z.number().int().nonnegative().max(10000),
      })
      .optional(),
    riskBudget: z
      .strictObject({
        equityFraction: positiveRatioStringSchema,
        maxEquityFraction: positiveRatioStringSchema,
      })
      .optional(),
    lossPause: z
      .strictObject({
        completedTrades: z.number().int().min(1).max(50),
        tradingDays: z.number().int().min(1).max(1000),
        pnlBasis: z.literal('fillsNetOfFees'),
      })
      .optional(),
    stages: z.array(tradePlanStageSchema).max(32),
    monthlyRebalance: tradePlanMonthlyRebalanceSchema.optional(),
    volatilityTarget: z
      .strictObject({
        returnPeriods: z.number().int().min(2).max(500),
        targetAnnualVolatility: positiveRatioStringSchema,
        maxEquityFraction: positiveRatioStringSchema,
        annualizationPeriods: z.literal(252),
        returnKind: z.literal('simple'),
        variance: z.literal('sample'),
        update: z.literal('dailyClose'),
      })
      .optional(),
  })
  .superRefine((plan, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (new Set(plan.stages.map((s) => s.id)).size !== plan.stages.length)
      fail(['stages'], '阶段标识不能重复');
    if (plan.riskBudget && !plan.initialStop) fail(['riskBudget'], '风险预算必须配置初始止损距离');
    if (plan.riskBudget && tradePlanProtectionCondition(plan.initialStop))
      fail(['riskBudget'], '风险预算需要无条件初始保护，不能用待启用的止损距离定仓');
    validateTradePlanAllocations(plan, ctx);
    if (
      plan.stages.some((s) => s.trigger.kind === 'entryAtrMultiple') &&
      plan.initialStop?.kind !== 'entryAtr'
    )
      fail(['stages'], 'ATR 阶段必须声明冻结入场 ATR');
  });
export type BacktestTradePlan = z.infer<typeof backtestTradePlanSchema>;

export function tradePlanProtectionCondition(
  rule: BacktestTradePlan['initialStop'] | BacktestTradePlan['trailing'],
) {
  return rule?.activation?.kind === 'condition' ? rule.activation.condition : undefined;
}
export function tradePlanProtectionRules(plan: BacktestTradePlan | undefined) {
  return (['initialStop', 'trailing'] as const).flatMap((key) => {
    const rule = plan?.[key];
    const expression = tradePlanProtectionCondition(rule);
    const path = ['tradePlan', key, 'activation', 'condition'];
    return expression ? [{ key, expression, path }] : [];
  });
}

export function validateTradePlanSources(
  plan: BacktestTradePlan | undefined,
  sources: Map<string, SignalSource>,
  instrument: SignalSource['asset'],
  timeframe: SignalSource['timeframe'],
  ctx: z.RefinementCtx,
) {
  if (!plan) return;
  for (const { expression, path } of tradePlanProtectionRules(plan)) {
    validateBooleanExpression(expression, sources, ctx, path);
    validateProtectionScope(expression, sources, instrument, timeframe, ctx, path);
  }
  if (instrument.assetType === 'fund')
    ctx.addIssue({
      code: 'custom',
      path: ['tradePlan'],
      message: '交易计划目前只支持场内股票／ETF，不能用于基金申赎',
    });
  if (plan.volatilityTarget && timeframe !== '1d')
    ctx.addIssue({
      code: 'custom',
      path: ['tradePlan', 'volatilityTarget'],
      message: '目标波动率主动调仓目前只支持日线',
    });
  if (plan.monthlyRebalance && timeframe !== '1d')
    ctx.addIssue({
      code: 'custom',
      path: ['tradePlan', 'monthlyRebalance'],
      message: '月末调仓目前只支持日线',
    });
  const atrs = [
    ...(plan.initialStop?.kind === 'entryAtr'
      ? [{ key: 'initialStop', config: plan.initialStop }]
      : []),
    ...(plan.trailing && 'sourceId' in plan.trailing
      ? [{ key: 'trailing', config: plan.trailing }]
      : []),
  ];
  for (const { key, config } of atrs) {
    const source = sources.get(config.sourceId);
    if (
      !source ||
      ['high', 'low', 'close'].some((f) => !source.series.includes(f as never)) ||
      source.priceCoordinate === 'actual' ||
      source.timeframe !== timeframe ||
      source.asset.symbol !== instrument.symbol ||
      source.asset.market !== instrument.market ||
      source.asset.assetType !== instrument.assetType
    )
      ctx.addIssue({
        code: 'custom',
        path: ['tradePlan', key, 'sourceId'],
        message: 'ATR 保护需要同一研究价格来源声明 high、low、close',
      });
  }
}

function validateProtectionScope(
  value: unknown,
  sources: Map<string, SignalSource>,
  instrument: SignalSource['asset'],
  timeframe: SignalSource['timeframe'],
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  if (!value || typeof value !== 'object') return;
  const node = value as Record<string, unknown>;
  if (
    (node.type === 'series' || node.type === 'sessionValue') &&
    typeof node.sourceId === 'string'
  ) {
    const source = sources.get(node.sourceId);
    if (
      source &&
      (source.timeframe !== timeframe ||
        source.asset.symbol !== instrument.symbol ||
        source.asset.market !== instrument.market ||
        source.asset.assetType !== instrument.assetType)
    )
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'sourceId'],
        message: '保护启用条件首期只支持同标的、同主周期来源',
      });
  }
  for (const [key, child] of Object.entries(node)) {
    if (Array.isArray(child))
      child.forEach((v, i) =>
        validateProtectionScope(v, sources, instrument, timeframe, ctx, [...path, key, i]),
      );
    else if (child && typeof child === 'object')
      validateProtectionScope(child, sources, instrument, timeframe, ctx, [...path, key]);
  }
}
