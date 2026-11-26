import { expect, it } from 'vitest';
import { changeStrategyEditorVariant, strategyEditorVariant, strategyEditorFields, appendStrategyEditorItem, editStrategyDefinition } from '../src/strategy-definition-editor.js';
import { dailyInput } from './backtest-daily-engine.fixtures.js';

it('已有日线委托在可视／JSON 往返保持价格精度、父单、激活与独立有效期', () => {
  const execution = dailyInput().exchange.dailyOrders!.execution;
  const original = { execution, extension: { value: '0.000000000000000001' } };
  const copy = structuredClone(original);
  expect(strategyEditorVariant('execution', execution)).toBe('dailyBarOrders');
  expect(strategyEditorFields('execution', execution).map(field => field.key)).toEqual(['orders']);
  let next = editStrategyDefinition(original, ['execution', 'orders', 0, 'id'], 'entry-renamed');
  const rows = (next.execution as typeof execution).orders;
  expect(rows.filter(row => row.parent).every(row => row.parent!.templateId === 'entry-renamed')).toBe(true);
  next = editStrategyDefinition(next, ['execution', 'orders', 2, 'parent', 'activation'], 'fullFill');
  next = editStrategyDefinition(next, ['execution', 'orders', 2, 'order', 'price', 'value'], '9.123456789012345678');
  expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  expect((next.execution as typeof execution).orders[2]).toMatchObject({ parent: { activation: 'fullFill' }, validity: { kind: 'position' }, order: { price: { value: '9.123456789012345678' } } });
  expect(next.extension).toBe(original.extension);
  expect(original).toEqual(copy);
  expect(() => editStrategyDefinition(next, ['execution', 'orders', 0], undefined)).toThrow('引用');
});
it('新增模板有独立标识，明确切换执行方式才替换已知结构', () => {
  const original = { execution: dailyInput().exchange.dailyOrders!.execution };
  const next = appendStrategyEditorItem(appendStrategyEditorItem(original, ['execution', 'orders'], 'orderTemplate'), ['execution', 'orders'], 'orderTemplate');
  const ids = (next.execution as typeof original.execution).orders.map(row => row.id);
  expect(new Set(ids).size).toBe(ids.length);
  const market = changeStrategyEditorVariant('execution', { ...original.execution, extension: 'keep' }, 'exchange');
  expect(market).toEqual({ extension: 'keep', mode: 'exchange', timing: 'nextEligibleBarOpen', orderType: 'market', timeInForce: 'DAY' });
  const daily = changeStrategyEditorVariant('execution', market, 'dailyBarOrders');
  expect(strategyEditorVariant('execution', daily)).toBe('dailyBarOrders');
  expect(daily).not.toHaveProperty('orderType');
});

it('显式重命名阶段同步委托引用，未调整关联前不能删除阶段', () => {
  const execution = dailyInput().exchange.dailyOrders!.execution;
  const original = {
    tradePlan: { stages: [{ id: 'reduce', extension: '保留' }] },
    execution: { ...execution, orders: [...execution.orders, { id: 'reduce-order', action: { kind: 'stage', stageId: 'reduce' }, order: { kind: 'market' }, validity: { kind: 'DAY' } }] },
  };
  const next = editStrategyDefinition(original, ['tradePlan', 'stages', 0, 'id'], 'reduce-renamed');
  const expected = structuredClone(original);
  expected.tradePlan.stages[0]!.id = 'reduce-renamed';
  const action = expected.execution.orders.at(-1)!.action;
  if (action.kind === 'stage') action.stageId = 'reduce-renamed';
  expect(next).toEqual(expected);
  expect(original.tradePlan.stages[0]!.id).toBe('reduce');
  expect(() => editStrategyDefinition(next, ['tradePlan', 'stages', 0], undefined)).toThrow('引用');
});
