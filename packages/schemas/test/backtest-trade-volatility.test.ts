import { expect, it } from 'vitest';
import { backtestTradePlanSchema } from '../src/backtest-trade-plan.js';
const volatilityTarget = {
  returnPeriods: 20,
  targetAnnualVolatility: '0.1',
  maxEquityFraction: '0.5',
  annualizationPeriods: 252,
  returnKind: 'simple',
  variance: 'sample',
  update: 'dailyClose',
};
const plan = { version: 1, evaluation: 'barClose', stages: [], volatilityTarget };
it('每日目标波动率显式统计合同，拒绝隐藏默认和不支持的统计／组合', () => {
  expect(backtestTradePlanSchema.safeParse(plan).success).toBe(true);
  for (const patch of [
    { returnPeriods: 1 },
    { returnPeriods: 501 },
    { returnPeriods: 20.5 },
    { targetAnnualVolatility: '0' },
    { maxEquityFraction: '1.1' },
    { annualizationPeriods: 365 },
    { variance: 'population' },
    { returnKind: 'log' },
    { update: 'entryOnly' },
  ])
    expect(
      backtestTradePlanSchema.safeParse({
        ...plan,
        volatilityTarget: { ...volatilityTarget, ...patch },
      }).success,
    ).toBe(false);
  expect(
    backtestTradePlanSchema.safeParse({
      ...plan,
      initialStop: { kind: 'percent', percent: '0.05' },
      riskBudget: { equityFraction: '0.01', maxEquityFraction: '0.5' },
    }).success,
  ).toBe(false);
  expect(
    backtestTradePlanSchema.safeParse({
      ...plan,
      stages: [
        {
          id: 'half',
          trigger: { kind: 'gainPercent', value: '0.1' },
          action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.5' },
        },
      ],
    }).success,
  ).toBe(false);
});
