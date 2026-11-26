import { expect, it } from 'vitest';
import { backtestOrderTemplateSchema } from '../src/backtest-daily-orders.js';
import { numericExpressionSchema, orderPriceExpressionSchema } from '../src/backtest-expression.js';

const price = { type: 'constant', value: '9' };
const parent = { templateId: 'buy', activation: 'eachFill' };
const ordinary = { id: 'exit', action: { kind: 'exit' }, order: { kind: 'market' }, validity: { kind: 'DAY' } };
const stop = { id: 'stop', action: { kind: 'stopLoss' }, order: { kind: 'stopMarket', price }, validity: { kind: 'position' }, parent };

it.each([
  ['普通退出', ordinary],
  ['建仓', { ...ordinary, action: { kind: 'entry' }, order: { kind: 'limit', price } }],
  ['阶段', { ...ordinary, action: { kind: 'stage', stageId: 'reduce' }, validity: { kind: 'bars', bars: 2 } }],
  ['按量止损', stop],
  ['全成止损', { ...stop, parent: { ...parent, activation: 'fullFill' } }],
  ['当日止损', { ...stop, validity: { kind: 'DAY' } }],
  ['止盈', { ...stop, action: { kind: 'takeProfit' }, order: { kind: 'limit', price } }],
])('合法组合 %s 原样往返', (_name, value) => {
  expect(backtestOrderTemplateSchema.parse(value)).toEqual(value);
});

it.each([
  ['普通退出父单', { ...ordinary, parent }],
  ['建仓父单', { ...ordinary, action: { kind: 'entry' }, parent }],
  ['阶段父单', { ...ordinary, action: { kind: 'stage', stageId: 'reduce' }, parent }],
  ['普通退出组', { ...ordinary, exitGroup: 'oco' }],
  ['普通持仓期限', { ...ordinary, validity: { kind: 'position' } }],
  ['止损缺父单', { ...stop, parent: undefined }],
  ['止损错订单', { ...stop, order: { kind: 'limit', price } }],
  ['止盈错订单', { ...stop, action: { kind: 'takeProfit' } }],
])('错误组合 %s 在共同结构合同拒绝', (_name, value) => {
  expect(backtestOrderTemplateSchema.safeParse(value).success).toBe(false);
});

it.each(['0', '-1', '0.0000', '', 'AAPL'])('委托直接常量 %s 拒绝，通用数值合同保持原值', value => {
  expect(orderPriceExpressionSchema.safeParse({ type: 'constant', value }).success).toBe(false);
  expect(numericExpressionSchema.safeParse({ type: 'constant', value }).success).toBe(['0', '-1', '0.0000'].includes(value));
});

it.each(['0.00000000000000000001', '99999999999999999999.123456789', '9'])('正价格 %s 原样保留精度', value => {
  const expression = { type: 'constant', value };
  expect(orderPriceExpressionSchema.parse(expression)).toEqual(expression);
});
