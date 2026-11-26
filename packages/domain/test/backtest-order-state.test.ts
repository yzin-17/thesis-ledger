import { expect, it } from 'vitest';
import {
  acceptBacktestOrderFill,
  backtestOrderCanMatch,
  createBacktestDailyOrder,
  endBacktestOrder,
  expireBacktestOrder,
  triggerBacktestOrder,
  updateBacktestProtection,
  type BacktestDailyOrder,
} from '../src/index.js';

const at = (barIndex: number, phase: 'open' | 'range' = 'open') => ({ barIndex, phase });
const buy = () =>
  createBacktestDailyOrder({
    id: 'buy',
    templateId: 'entry',
    cycleId: 'cycle',
    side: 'buy',
    action: { kind: 'entry' },
    quantityBasis: 'actual-units',
    quantity: '27',
    acceptedSequence: 0,
    validity: { kind: 'bars', bars: 2 },
    price: { kind: 'limit', price: '359.50' },
    activatedBarIndex: 1,
    eligibleFrom: at(1),
  });
const child = (activation: 'eachFill' | 'fullFill' = 'eachFill') =>
  createBacktestDailyOrder({
    id: 'stop',
    templateId: 'stop',
    cycleId: 'cycle',
    side: 'sell',
    action: { kind: 'stopLoss' },
    quantityBasis: 'actual-units',
    quantity: '0',
    acceptedSequence: 1,
    validity: { kind: 'position' },
    price: { kind: 'stopMarket', price: '355' },
    parent: { orderId: 'buy', activation },
  });
const fillBuy = (quantity = '10', point = at(1)) =>
  acceptBacktestOrderFill(buy(), { fillId: 'fill-buy', quantity, at: point }).order;

it('27股成交10后撤掉余量，保留已成交10及审计余量17', () => {
  const partial = fillBuy();
  expect(partial).toMatchObject({
    state: 'partially_filled',
    filledQuantity: '10',
    remainingQuantity: '17',
  });
  const cancelled = endBacktestOrder(partial, 'cancelled');
  expect(cancelled).toMatchObject({
    state: 'cancelled',
    filledQuantity: '10',
    remainingQuantity: '17',
  });
  expect(backtestOrderCanMatch(cancelled, at(2))).toBe(false);
  expect(updateBacktestProtection(child(), cancelled, '0', at(1))).toMatchObject({
    state: 'active',
    remainingQuantity: '10',
  });
});
it('本父单买10后退出4，仅保留6，部分止损自身成交量也守恒', () => {
  const parent = endBacktestOrder(fillBuy(), 'cancelled');
  const active = updateBacktestProtection(child(), parent, '0', at(1));
  const partial = acceptBacktestOrderFill(active, {
    fillId: 'sell-four',
    quantity: '4',
    at: at(2),
  }).order;
  expect(updateBacktestProtection(partial, parent, '4', at(2))).toMatchObject({
    quantity: '10',
    filledQuantity: '4',
    remainingQuantity: '6',
    state: 'partially_filled',
  });
  expect(updateBacktestProtection(active, parent, '4', at(2))).toMatchObject({
    quantity: '6',
    filledQuantity: '0',
    remainingQuantity: '6',
  });
});
it('全部成交后保护不会因部分成交或撤余单擅自启用', () => {
  const partial = fillBuy();
  expect(updateBacktestProtection(child('fullFill'), partial, '0', at(1)).state).toBe(
    'waiting_parent',
  );
  expect(
    updateBacktestProtection(child('fullFill'), endBacktestOrder(partial, 'cancelled'), '0', at(1))
      .state,
  ).toBe('cancelled');
  expect(
    updateBacktestProtection(child('fullFill'), fillBuy('27'), '0', at(1)).remainingQuantity,
  ).toBe('27');
});
it('父单零成交到期结束保护，不可借用其他周期持仓', () => {
  expect(
    updateBacktestProtection(child(), endBacktestOrder(buy(), 'expired'), '0', at(2)).state,
  ).toBe('cancelled');
  expect(() =>
    updateBacktestProtection(child(), { ...buy(), cycleId: 'other' }, '0', at(1)),
  ).toThrow('持仓周期');
  expect(() => updateBacktestProtection(child(), fillBuy(), '11', at(1))).toThrow('退出量');
});
it('开盘建立的保护同根区间参与，区间建立的保护从后根开盘参与', () => {
  const openChild = updateBacktestProtection(child(), fillBuy(), '0', at(1));
  expect(backtestOrderCanMatch(openChild, at(1))).toBe(false);
  expect(backtestOrderCanMatch(openChild, at(1, 'range'))).toBe(true);
  const rangeChild = updateBacktestProtection(
    child(),
    fillBuy('10', at(1, 'range')),
    '0',
    at(1, 'range'),
  );
  expect(backtestOrderCanMatch(rangeChild, at(1, 'range'))).toBe(false);
  expect(backtestOrderCanMatch(rangeChild, at(2))).toBe(true);
});
it('DAY子单按激活日结束，不因次根才可撮合而自动延期', () => {
  const sameDay = { ...child(), validity: { kind: 'DAY' as const } };
  const active = updateBacktestProtection(
    sameDay,
    fillBuy('10', at(1, 'range')),
    '0',
    at(1, 'range'),
  );
  expect(expireBacktestOrder(active, 1).state).toBe('expired');
});
it('有效两根在第二根结束到期，触价缺额度的止损保留触发事实', () => {
  expect(expireBacktestOrder(buy(), 1).state).toBe('active');
  expect(expireBacktestOrder(buy(), 2).state).toBe('expired');
  const active = updateBacktestProtection(child(), fillBuy(), '0', at(1));
  const triggered = triggerBacktestOrder(active, at(2));
  expect(triggerBacktestOrder(triggered, at(3)).triggeredAt).toEqual(at(2));
  expect(triggered.remainingQuantity).toBe('10');
});
it('序列化后重复成交仍幂等，不同数量复用标识被拒绝', () => {
  const partial: BacktestDailyOrder = JSON.parse(JSON.stringify(fillBuy()));
  expect(
    acceptBacktestOrderFill(partial, { fillId: 'fill-buy', quantity: '10', at: at(1) }).applied,
  ).toBe(false);
  expect(() =>
    acceptBacktestOrderFill(partial, { fillId: 'fill-buy', quantity: '11', at: at(1) }),
  ).toThrow('不同成交');
  expect(backtestOrderCanMatch(partial, at(1, 'range'))).toBe(false);
  expect(backtestOrderCanMatch(partial, at(2))).toBe(true);
});
it('终态不接受新成交，超量与零成交不落账', () => {
  expect(() =>
    acceptBacktestOrderFill(endBacktestOrder(buy(), 'cancelled'), {
      fillId: 'late',
      quantity: '1',
      at: at(2),
    }),
  ).toThrow('状态');
  for (const quantity of ['0', '-1', '28'])
    expect(() => acceptBacktestOrderFill(buy(), { fillId: 'bad', quantity, at: at(1) })).toThrow(
      '成交数量',
    );
});

it('不能在保护生效前成交，也不能在同根追加第二笔成交', () => {
  const parent = fillBuy();
  const active = updateBacktestProtection(child(), parent, '0', at(1));
  expect(() =>
    acceptBacktestOrderFill(active, { fillId: 'early', quantity: '1', at: at(1) }),
  ).toThrow('状态');
  expect(() =>
    acceptBacktestOrderFill(parent, { fillId: 'same-bar', quantity: '1', at: at(1, 'range') }),
  ).toThrow('状态');
});
