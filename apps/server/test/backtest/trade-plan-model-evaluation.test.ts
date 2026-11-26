import { expect, it } from 'vitest';
import { booleanExpressionSchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { modelPlanConforms } from './trade-plan-model-evaluation.fixture.js';
import { fixedVolatilityPlan } from './volatility-target.fixture.js';

const base: BacktestStrategy = {
  schemaVersion: 'strategy-definition-v1',
  name: '独立模型语义样本',
  executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
  primaryTimeframe: '1d',
  signalSources: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0', slippageRate: '0' },
  entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
  exit: {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '0' },
    right: { type: 'constant', value: '1' },
  },
  sizing: { type: 'percentOfEquity', percent: '0.2' },
  risk: [],
  tradePlan: {
    version: 1,
    evaluation: 'barClose',
    initialStop: { kind: 'percent', percent: '0.05' },
    cooldown: { bars: 10, stopBars: 10 },
    stages: [],
  },
};

it('保护参数相同也不能掩盖模型额外添加的退出、风险仓位或错误入场', () => {
  expect(modelPlanConforms('fixed-stop', base)).toBe(true);
  expect(
    modelPlanConforms('fixed-stop', { ...base, risk: [{ type: 'fixedStop', percent: '0.05' }] }),
  ).toBe(false);
  expect(
    modelPlanConforms('fixed-stop', { ...base, exit: { type: 'positionState', field: 'isOpen' } }),
  ).toBe(false);
  expect(
    modelPlanConforms('fixed-stop', { ...base, entry: { type: 'positionState', field: 'isOpen' } }),
  ).toBe(false);
  expect(
    modelPlanConforms('fixed-stop', {
      ...base,
      tradePlan: {
        ...base.tradePlan!,
        riskBudget: { equityFraction: '0.2', maxEquityFraction: '0.2' },
      },
    }),
  ).toBe(false);
  expect(
    modelPlanConforms('fixed-stop', {
      ...base,
      risk: [{ type: 'fixedTakeProfit', percent: '0.1' }],
    }),
  ).toBe(false);
});

it('每日与固定仓位按语义验收，接受等价空仓许可但拒绝恒假入场和额外调仓', () => {
  const daily = fixedVolatilityPlan(true),
    fixed = fixedVolatilityPlan(false);
  expect(modelPlanConforms('daily-volatility', daily)).toBe(true);
  expect(modelPlanConforms('fixed-allocation', fixed)).toBe(true);
  expect(modelPlanConforms('fixed-allocation', daily)).toBe(false);
  expect(
    modelPlanConforms('daily-volatility', {
      ...daily,
      sizing: { type: 'percentOfEquity', percent: '0.25' },
    }),
  ).toBe(true);
  const unconditional = {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '1' },
    right: { type: 'constant', value: '1' },
  } as const;
  expect(modelPlanConforms('fixed-allocation', { ...fixed, entry: unconditional })).toBe(true);
  expect(modelPlanConforms('daily-volatility', { ...daily, entry: unconditional })).toBe(true);
  const flatEntry = booleanExpressionSchema.parse(fixed.entry),
    neverExit = booleanExpressionSchema.parse(fixed.exit);
  expect(
    modelPlanConforms('fixed-allocation', {
      ...fixed,
      entry: { type: 'all', conditions: [flatEntry, flatEntry] },
    }),
  ).toBe(true);
  expect(
    modelPlanConforms('fixed-allocation', {
      ...fixed,
      entry: { type: 'all', conditions: [flatEntry, neverExit] },
    }),
  ).toBe(false);
  expect(modelPlanConforms('daily-volatility', { ...daily, entry: daily.exit })).toBe(false);
  expect(
    modelPlanConforms('daily-volatility', {
      ...daily,
      exit: { type: 'positionState', field: 'isOpen' },
    }),
  ).toBe(false);
});
