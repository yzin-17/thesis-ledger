import { z } from 'zod';
import { positiveRatioStringSchema } from './monetary-values.js';

export const tradePlanMonthlyRebalanceSchema = z.strictObject({
  targetEquityFraction: positiveRatioStringSchema,
  deviationThreshold: positiveRatioStringSchema,
  evaluation: z.literal('lastTradingDayClose'),
});

/** 多个仓位控制器不能同时决定同一持仓的目标。 */
export function validateTradePlanAllocations(
  plan: {
    stages: readonly unknown[];
    riskBudget?: unknown;
    volatilityTarget?: unknown;
    monthlyRebalance?: unknown;
  },
  ctx: z.RefinementCtx,
) {
  const fail = (field: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [field], message });
  if (plan.volatilityTarget && (plan.riskBudget || plan.stages.length))
    fail('volatilityTarget', '每日目标波动率首期不能与风险预算或一次性阶段组合');
  if (plan.monthlyRebalance && (plan.riskBudget || plan.stages.length || plan.volatilityTarget))
    fail('monthlyRebalance', '月末调仓首期不能与每日波动率、风险预算或一次性阶段组合');
}
