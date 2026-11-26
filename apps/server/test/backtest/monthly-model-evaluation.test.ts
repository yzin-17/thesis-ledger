import { expect, it } from 'vitest';
import { fixedMonthlyPlan, monthlyPlanConforms } from './monthly-rebalance.fixture.js';

it('月末与首次投入的语义判定区分调仓时点、百分点和额外退出', () => {
  const monthly = fixedMonthlyPlan(true);
  const initial = fixedMonthlyPlan(false);
  expect(monthlyPlanConforms('month-end-rebalance', monthly)).toBe(true);
  expect(monthlyPlanConforms('initial-allocation', initial)).toBe(true);
  expect(monthlyPlanConforms('initial-allocation', monthly)).toBe(false);
  expect(monthlyPlanConforms('month-end-rebalance', initial)).toBe(false);
  expect(
    monthlyPlanConforms('month-end-rebalance', {
      ...monthly,
      tradePlan: {
        ...monthly.tradePlan,
        monthlyRebalance: {
          ...monthly.tradePlan.monthlyRebalance!,
          deviationThreshold: '0.3',
        },
      },
    }),
  ).toBe(false);
  expect(
    monthlyPlanConforms('month-end-rebalance', {
      ...monthly,
      exit: { type: 'positionState', field: 'isOpen' },
    }),
  ).toBe(false);
  expect(
    monthlyPlanConforms('month-end-rebalance', {
      ...monthly,
      risk: [{ type: 'fixedStop', percent: '0.05' }],
    }),
  ).toBe(false);
});
