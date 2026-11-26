import { expect, it } from 'vitest';
import { runExchangeSimulation } from '../src/backtest-engine.js';
import { daily, dailyInput } from './backtest-daily-engine.fixtures.js';

it('正式事件引擎中，区间限价父单建立保护，下一根才撮合；完整重跑一致', () => {
  const create = () => {
    const input = dailyInput([
      daily('2026-09-08'),
      daily('2026-09-09', '10', '8.8'),
      daily('2026-09-10', '8.7', '8.5'),
    ]);
    return runExchangeSimulation(input);
  };
  const result = create();
  expect(result.fills.map((fill) => [fill.side, fill.price, fill.occurredAt])).toEqual([
    ['buy', '9.5', '2026-09-09T07:00:00.000Z'],
    ['sell', '8.7', '2026-09-10T01:30:00.000Z'],
  ]);
  expect(result.dailyOrders?.orders.find((order) => order.templateId === 'stop')).toMatchObject({
    filledQuantity: '200',
    eligibleFrom: { barIndex: 2, phase: 'open' },
  });
  expect(result.ledger.position.quantity).toBe('0');
  expect(result.rejects).toEqual([]);
  expect(create()).toEqual(result);
});

it('开盘买入后当根区间可保护，同触止损／止盈按确认政策处理', () => {
  const result = runExchangeSimulation(
    dailyInput([daily('2026-09-08'), daily('2026-09-09', '9.4', '8.8'), daily('2026-09-10')]),
  );
  expect(result.fills.map((fill) => [fill.side, fill.price, fill.occurredAt])).toEqual([
    ['buy', '9.4', '2026-09-09T01:30:00.000Z'],
    ['sell', '9', '2026-09-09T07:00:00.000Z'],
  ]);
  expect(result.dailyOrders?.conflicts).toEqual([
    { barKey: '2026-09-09T01:30:00.000Z', exitGroup: expect.any(String), resolution: 'stopFirst' },
  ]);
  expect(result.dailyOrders?.orders.find((order) => order.templateId === 'profit')?.state).toBe(
    'cancelled',
  );
});

it('冻结 T+1 先交收再开盘，已触发止损不要求再次跌穿', () => {
  const result = runExchangeSimulation(
    dailyInput([daily('2026-09-08'), daily('2026-09-09', '9.4', '8.8'), daily('2026-09-10')], 1),
  );
  expect(result.fills.map((fill) => [fill.side, fill.price, fill.occurredAt])).toEqual([
    ['buy', '9.4', '2026-09-09T01:30:00.000Z'],
    ['sell', '10', '2026-09-10T01:30:00.000Z'],
  ]);
  const events = result.events.filter((event) => event.occurredAt === '2026-09-10T01:30:00.000Z');
  expect(events.findIndex((event) => event.type === 'cashSettlement')).toBeLessThan(
    events.findIndex((event) => event.type === 'executionPhase'),
  );
  expect(result.ledger.position.quantity).toBe('0');
  expect(result.rejects).toEqual([]);
});

it('未触价两根到期，不因持续为真的入场条件重新挂单', () => {
  const input = dailyInput([
    daily('2026-09-08'),
    daily('2026-09-09', '10', '9.8'),
    daily('2026-09-10', '10', '9.8'),
  ]);
  const result = runExchangeSimulation(input);
  expect(result.fills).toEqual([]);
  expect(result.targetIntents).toHaveLength(1);
  expect(result.dailyOrders?.orders.find((order) => order.templateId === 'buy')).toMatchObject({
    state: 'expired',
    filledQuantity: '0',
    remainingQuantity: '200',
  });
  expect(result.dailyOrders?.orders.find((order) => order.templateId === 'stop')?.state).toBe(
    'cancelled',
  );
  expect(input.ledger.availableCash('CNY')).toBe('5000');
});

it('普通退出从原信号提交，取消建仓余量且不反向新增买单', () => {
  const input = dailyInput([
    daily('2026-09-08'),
    daily('2026-09-09', '9.4', '9.4', '10.5'),
    daily('2026-09-10'),
  ]);
  input.exchange.dailyOrders!.matching.liquidity = { kind: 'perBarCap', quantity: '100' };
  input.simulation.strategy.exit = { type: 'positionState', field: 'isOpen' };
  const result = runExchangeSimulation(input);
  expect(result.fills.map((fill) => [fill.side, fill.quantity])).toEqual([
    ['buy', '100'],
    ['sell', '100'],
  ]);
  expect(result.dailyOrders?.orders.find((order) => order.templateId === 'buy')).toMatchObject({
    state: 'cancelled',
    filledQuantity: '100',
    remainingQuantity: '100',
  });
  expect(result.ledger.position.quantity).toBe('0');
  expect(result.rejects).toEqual([]);
});
