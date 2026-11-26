import { expect, it } from 'vitest';
import {
  activeBacktestTradePlan, backtestTradePlanLines, runExchangeSimulation,
  type BacktestTradePlan, type ExchangeSimulationRunInput,
} from '../src/index.js';
import { exchangeRunInput } from './backtest-simulation.fixtures.js';

const empty: BacktestTradePlan = { version: 1, evaluation: 'barClose', stages: [] };

it('空壳与未设置等价；阶段和每一种显式计划功能仍启用', () => {
  expect(activeBacktestTradePlan(undefined)).toBeUndefined();
  expect(activeBacktestTradePlan(empty)).toBeUndefined();
  expect(activeBacktestTradePlan({ ...empty, trailing: undefined })).toBeUndefined();
  const features: Partial<BacktestTradePlan>[] = [
    { initialStop: { kind: 'percent', percent: '0.03' } },
    { trailing: { drawdownPercent: '0.05' } },
    { cooldown: { bars: 0, stopBars: 0 } },
    { riskBudget: { equityFraction: '0.01', maxEquityFraction: '0.5' } },
    { lossPause: { completedTrades: 2, tradingDays: 3, pnlBasis: 'fillsNetOfFees' } },
    { volatilityTarget: { returnPeriods: 20, targetAnnualVolatility: '0.1', maxEquityFraction: '0.5', annualizationPeriods: 252, returnKind: 'simple', variance: 'sample', update: 'dailyClose' } },
    { stages: [{ id: 'half', trigger: { kind: 'gainPercent', value: '0.1' }, action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.5' } }] },
  ];
  for (const feature of features) {
    const plan = { ...empty, ...feature };
    expect(activeBacktestTradePlan(plan)).toBe(plan);
  }
  expect(backtestTradePlanLines(empty)).toEqual([]);
  expect(empty).toEqual({ version: 1, evaluation: 'barClose', stages: [] });
});

it('空计划不要求额外价格／日历输入，也不替换普通信号或增加计划状态', () => {
  const absent: ExchangeSimulationRunInput = exchangeRunInput();
  const withEmpty: ExchangeSimulationRunInput = exchangeRunInput();
  withEmpty.simulation.strategy.tradePlan = empty;
  const expected = runExchangeSimulation(absent);
  expect(expected.fills).toHaveLength(1);
  expect(runExchangeSimulation(withEmpty)).toEqual(expected);
});
