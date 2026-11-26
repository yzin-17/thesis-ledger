import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  tradePlanMonthlyRebalanceSchema,
  validateTradePlanAllocations,
} from '../src/backtest-trade-monthly-rebalance.js';

const monthly = {
  targetEquityFraction: '0.30',
  deviationThreshold: '0.03',
  evaluation: 'lastTradingDayClose',
};

it('月末比例和百分点使用十进制字符串，拒绝缺字段、非法比例及其他时点', () => {
  expect(tradePlanMonthlyRebalanceSchema.parse(monthly)).toEqual(monthly);
  for (const patch of [
    { targetEquityFraction: '30' },
    { deviationThreshold: '3' },
    { deviationThreshold: '-0.03' },
    { deviationThreshold: 0.03 },
    { evaluation: 'calendarMonthEnd' },
    { evaluation: 'dailyClose' },
    { hiddenOrder: true },
  ])
    expect(tradePlanMonthlyRebalanceSchema.safeParse({ ...monthly, ...patch }).success).toBe(false);
  expect(tradePlanMonthlyRebalanceSchema.safeParse({ targetEquityFraction: '0.3' }).success).toBe(
    false,
  );
});

it('月末控制器与其他仓位控制器互斥，普通保护和暂停可由根合同继续组合', () => {
  const schema = z
    .object({
      stages: z.array(z.unknown()),
      riskBudget: z.unknown().optional(),
      volatilityTarget: z.unknown().optional(),
      monthlyRebalance: tradePlanMonthlyRebalanceSchema.optional(),
    })
    .superRefine(validateTradePlanAllocations);
  const plan = { stages: [], monthlyRebalance: monthly };
  expect(schema.safeParse(plan).success).toBe(true);
  for (const patch of [{ riskBudget: {} }, { volatilityTarget: {} }, { stages: [{}] }]) {
    const parsed = schema.safeParse({ ...plan, ...patch });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.at(-1)!.path).toEqual(['monthlyRebalance']);
  }
});
