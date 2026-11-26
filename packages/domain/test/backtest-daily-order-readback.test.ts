import { expect, it } from 'vitest';
import { backtestStrategyPlanReadback } from '../src/backtest-strategy-plan-readback.js';
import { dailyInput } from './backtest-daily-engine.fixtures.js';

const configuration = () => ({
  ...dailyInput().simulation.strategy,
  sizing: { type: 'percentOfEquity' as const, percent: '0.3' },
  risk: [],
  execution: dailyInput().exchange.dailyOrders!.execution,
});
it('回读区分触价附属止损与原有收盘保护，说明跨夜与同根激活', () => {
  const input = configuration();
  const readback = backtestStrategyPlanReadback(input).join('\n');
  expect(readback).toContain('止损（stop）：触发后市价委托');
  expect(readback).toContain('每次成交后按量保护');
  expect(readback).toContain('可跨夜');
  expect(readback).toContain('从下一根开盘参与');
  expect(readback).toContain('同组止损、止盈在区间同时触及时止损优先');
  expect(readback).toContain('委托时可见权益');
  expect(readback).not.toContain('成交方式：收盘判断、下一可交易开盘市价成交');
  const child = input.execution.orders.find((order) => order.id === 'stop')!;
  child.parent!.activation = 'fullFill';
  child.validity = { kind: 'DAY' };
  const full = backtestStrategyPlanReadback(input).join('\n');
  expect(full).toContain('全部成交后才启用；部分成交后撤余单不启用');
  expect(full).toContain('激活当根结束到期，不跨夜');
});
it('含阶段及收盘保护的委托计划，中文不把全部动作写成下个开盘市价', () => {
  const input = {
    ...configuration(),
    tradePlan: {
      version: 1 as const,
      evaluation: 'barClose' as const,
      stages: [],
      initialStop: { kind: 'percent' as const, percent: '0.05' },
    },
  };
  const text = backtestStrategyPlanReadback(input).join('\n');
  expect(text).toContain('收盘保护仍在后续开盘市价退出');
  expect(text).toContain('附属触价保护按自己的价格与激活时点撮合');
  expect(text).not.toContain('触发后于下一可交易开盘市价成交');
});
it('原有市价委托回读明确当日有效及整笔撮合，便于识别计划改动', () => {
  const input = {
    ...configuration(),
    execution: { mode: 'exchange' as const, orderType: 'market' as const, timeInForce: 'DAY' as const, timing: 'nextEligibleBarOpen' as const },
  };
  const text = backtestStrategyPlanReadback(input).join('\n');
  expect(text).toContain('委托有效期：当日有效；市价委托按现有整笔撮合规则成交或拒绝。');
  expect(text).not.toContain('每次成交后按量保护');
});
