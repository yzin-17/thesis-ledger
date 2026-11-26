import { z } from 'zod';
import {
  backtestTradePlanSchema,
  tradePlanStopSchema,
  tradePlanTrailingSchema,
  tradePlanProtectionActivationSchema,
  type BacktestTradePlan,
} from './backtest-trade-plan.js';
import type { BooleanExpression } from './backtest-expression.js';

export function generatedTradePlanSchemaFor(condition?: z.ZodType<BooleanExpression>) {
const { stages, riskBudget, monthlyRebalance, volatilityTarget, ...common } =
  backtestTradePlanSchema.shape;
const [percentStop, atrStop] = tradePlanStopSchema.options;
const [percentTrail, atrTrail] = tradePlanTrailingSchema.options;
const activation = (condition ? z.discriminatedUnion('kind', [
  tradePlanProtectionActivationSchema.options[0],
  tradePlanProtectionActivationSchema.options[1].extend({ condition }),
]) : tradePlanProtectionActivationSchema).describe(
  '独立选择启用方式：无条件保护选 immediate；条件成立后保护选 condition 并生成完整条件，保持已选距离类型。',
);
const stop = z
  .union([
    z
      .strictObject({
        ...percentStop.omit({ activation: true }).shape,
        activation,
      })
      .describe('固定比例止损：kind=percent，percent 必填。'),
    z
      .strictObject({
        ...atrStop.omit({ activation: true }).shape,
        activation,
      })
      .describe('冻结 ATR 止损：仅明确要求 ATR 时使用，sourceId、period、multiple 均必填。'),
  ])
  .optional()
  .describe('首笔成交价保护；冻结委托 ATR 用 entryAtr，逐期追踪放 trailing。');
const trailing = z
  .union([
    z.strictObject({
      ...percentTrail.omit({ activation: true }).shape,
      activation,
    }),
    z.strictObject({
      ...atrTrail.omit({ activation: true }).shape,
      activation,
    }),
  ])
  .optional();
const protection = {
  version: common.version,
  evaluation: common.evaluation,
  stages,
  initialStop: stop,
  trailing: trailing.describe('最高收盘减本期 ATR 用 currentAtr；仅按要求附启用条件。'),
  cooldown: common.cooldown,
  lossPause: common.lossPause,
};
const emptyStages = stages.length(0);
const unconditionalStop = z.union([
  z.strictObject({
    ...percentStop.omit({ activation: true }).shape,
    activation: tradePlanProtectionActivationSchema.options[0],
  }),
  z.strictObject({
    ...atrStop.omit({ activation: true }).shape,
    activation: tradePlanProtectionActivationSchema.options[0],
  }),
]);

/** 将已有互斥与前置条件直接表达给模型，最终仍按原计划合同校验。 */
const schema: z.ZodType<BacktestTradePlan> = z
  .union([
    z.strictObject(protection).describe('普通仓位分支：仅附加保护、冷却或分批，不改变 sizing。'),
    z
      .strictObject({
        riskBudget: riskBudget
          .unwrap()
          .describe('仅明确按止损距离和损失风险比例定仓时填写；投入权益比例属于普通 sizing。'),
        ...protection,
        initialStop: unconditionalStop,
        stages,
      })
      .describe('按损失预算定仓分支：替代 sizing；仅用户明确指定允许损失比例时使用。'),
    z
      .strictObject({
        monthlyRebalance: monthlyRebalance.unwrap(),
        ...protection,
        stages: emptyStages,
      })
      .describe('月末目标调仓分支：仅用户明确要求每月末调整仓位时使用。'),
    z
      .strictObject({
        volatilityTarget: volatilityTarget.unwrap(),
        ...protection,
        stages: emptyStages,
      })
      .describe('每日波动率仓位分支：仅用户明确要求按目标波动率每日调仓时使用。'),
  ])
  .superRefine((value, ctx) => {
    const parsed = backtestTradePlanSchema.safeParse(value);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  })
  .describe('仅输出需求明确要求的计划控制；保护和冷却不需要风险预算、亏损暂停或调仓。');
return schema;
}
export const generatedTradePlanSchema = generatedTradePlanSchemaFor();
