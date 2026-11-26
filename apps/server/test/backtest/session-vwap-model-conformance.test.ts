import { expect, it } from 'vitest';
import { fixedSessionPlan } from './session-vwap-snapshot.fixture.js';
import { sessionVwapPlanConforms } from './session-vwap-model.fixture.js';

it.each([true, false])('时间验收须区分恰好第31分钟与之后的分钟（累计=%s）', (cumulative) => {
  const strategy = fixedSessionPlan(cumulative);
  const id = cumulative ? 'session-vwap' : 'rolling-vwap';
  expect(sessionVwapPlanConforms(id, strategy)).toBe(true);
  if (strategy.entry.type !== 'all') throw new Error('缺少固定条件');
  const minute = strategy.entry.conditions[2]!;
  if (minute.type !== 'compare') throw new Error('缺少固定时间比较');
  minute.operator = 'gte';
  expect(sessionVwapPlanConforms(id, strategy)).toBe(false);
});

it('普通退出始终不触发须覆盖已持仓，不能只在空仓判断', () => {
  const strategy = fixedSessionPlan(true);
  strategy.exit = { type: 'positionState', field: 'isOpen' };
  expect(sessionVwapPlanConforms('session-vwap', strategy)).toBe(false);
});

it('空仓入场须在已持仓反例下为假，不能只验证空仓输入', () => {
  const strategy = fixedSessionPlan(true);
  if (strategy.entry.type !== 'all') throw new Error('缺少固定条件');
  strategy.entry.conditions.pop();
  expect(sessionVwapPlanConforms('session-vwap', strategy)).toBe(false);
});
