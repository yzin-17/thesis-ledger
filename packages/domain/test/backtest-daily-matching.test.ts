import { expect, it } from 'vitest';
import {
  acceptBacktestOrderFill,
  createBacktestDailyOrder,
  createBacktestDailyMatchState,
  endBacktestOrder,
  matchBacktestDailyPhase,
  type BacktestDailyMatching,
  type BacktestDailyOrder,
  type BacktestDailyMatchState,
} from '../src/index.js';

const policy = (quantity?: string): BacktestDailyMatching => ({
  conflict: 'stopFirst',
  childActivation: 'openSameBarRangeNextBar',
  partialExit: 'protectRemaining',
  liquidity: quantity ? { kind: 'perBarCap', quantity } : { kind: 'unlimited' },
});
const bar = (index: number, open = '100', high = '110', low = '90') => ({
  key: `day-${index}`,
  index,
  open,
  high,
  low,
  close: '105',
});
const buy = (id = 'buy', price = '95', quantity = '27') =>
  createBacktestDailyOrder({
    id,
    templateId: id,
    cycleId: 'cycle',
    side: 'buy',
    action: { kind: 'entry' },
    quantityBasis: 'actual-units',
    quantity,
    acceptedSequence: 0,
    validity: { kind: 'bars', bars: 2 },
    price: { kind: 'limit', price },
    activatedBarIndex: 1,
    eligibleFrom: { barIndex: 1, phase: 'open' },
  });
const stop = (parent = 'buy') =>
  createBacktestDailyOrder({
    id: `stop-${parent}`,
    templateId: 'stop',
    cycleId: 'cycle',
    side: 'sell',
    action: { kind: 'stopLoss' },
    quantityBasis: 'actual-units',
    quantity: '0',
    acceptedSequence: 1,
    validity: { kind: 'position' },
    price: { kind: 'stopMarket', price: '95' },
    parent: { orderId: parent, activation: 'eachFill' },
    exitGroup: `exits-${parent}`,
  });
const profit = () => ({
  ...stop(),
  id: 'profit',
  action: { kind: 'takeProfit' as const },
  price: { kind: 'limit' as const, price: '108' },
});
const held = (id = 'buy', quantity = '10') =>
  acceptBacktestOrderFill(buy(id, '100', quantity), {
    fillId: `held-${id}`,
    quantity,
    at: { barIndex: 1, phase: 'open' },
  }).order;
const available = (o: BacktestDailyOrder) => o.remainingQuantity;
function day(
  state: BacktestDailyMatchState,
  index: number,
  options: { open?: string; high?: string; low?: string; cap?: string } = {},
) {
  const input = {
    state,
    bar: bar(index, options.open, options.high, options.low),
    policy: policy(options.cap),
    availableQuantity: available,
  };
  const open = matchBacktestDailyPhase({ ...input, phase: 'open' });
  return matchBacktestDailyPhase({ ...input, state: open, phase: 'range' });
}

it('停牌根只推进独立有效期，不触发或消耗额度', () => {
  const order = { ...buy(), validity: { kind: 'DAY' as const } };
  let state = createBacktestDailyMatchState([order, stop()]);
  for (const phase of ['open', 'range'] as const)
    state = matchBacktestDailyPhase({
      state,
      bar: bar(1, '90'),
      phase,
      policy: policy('10'),
      tradable: false,
      availableQuantity: available,
    });
  expect(state.fills).toEqual([]);
  expect(state.currentBar?.consumed).toBe('0');
  expect(state.orders[0]?.state).toBe('expired');
  expect(state.orders[1]?.state).toBe('cancelled');
});

it('昨日低价限价单未触及时留存两根，到期不改成市价', () => {
  const first = day(createBacktestDailyMatchState([buy('buy', '85')]), 1);
  expect(first.fills).toHaveLength(0);
  expect(first.orders[0]?.state).toBe('active');
  const second = day(first, 2);
  expect(second.orders[0]?.state).toBe('expired');
  expect(second.fills).toHaveLength(0);
});
it('买入限价可获得开盘改善，区间触价按限价', () => {
  expect(day(createBacktestDailyMatchState([buy()]), 1, { open: '92' }).fills[0]?.price).toBe('92');
  expect(day(createBacktestDailyMatchState([buy()]), 1).fills[0]?.price).toBe('95');
});
it('同根高低双触止损优先，但开盘已成交止盈不可被后来低价替换', () => {
  const initial = createBacktestDailyMatchState([held(), stop(), profit()]);
  const conflict = day(initial, 2);
  expect(conflict.fills.map((f) => [f.orderId, f.price])).toEqual([['stop-buy', '95']]);
  expect(conflict.conflicts).toEqual([
    { barKey: 'day-2', exitGroup: 'exits-buy', resolution: 'stopFirst' },
  ]);
  expect(day(initial, 2, { open: '110' }).fills.map((f) => [f.orderId, f.price])).toEqual([
    ['profit', '110'],
  ]);
  expect(day(initial, 2, { open: '90' }).fills[0]?.price).toBe('90');
});
it('开盘建仓的保护当根可触发，区间建仓的保护从后根开始', () => {
  const opening = day(createBacktestDailyMatchState([buy('buy', '100', '10'), stop()]), 1);
  expect(opening.fills.map((f) => f.orderId)).toEqual(['buy', 'stop-buy']);
  const intraday = day(createBacktestDailyMatchState([buy('buy', '95', '10'), stop()]), 1);
  expect(intraday.fills.map((f) => f.orderId)).toEqual(['buy']);
  expect(day(intraday, 2, { open: '94' }).fills.map((f) => f.orderId)).toEqual(['buy', 'stop-buy']);
});
it('27股首根成交10后撤余17，保护10；普通退出4后只保护6', () => {
  let state = day(createBacktestDailyMatchState([buy(), stop()]), 1, { cap: '10' });
  state.orders[0] = endBacktestOrder(state.orders[0]!, 'cancelled');
  expect(state.orders.find((o) => o.action.kind === 'stopLoss')?.remainingQuantity).toBe('10');
  const exit = createBacktestDailyOrder({
    ...buy('exit', '100', '4'),
    templateId: 'exit',
    side: 'sell',
    action: { kind: 'exit' },
    price: { kind: 'market' },
    acceptedSequence: 2,
    activatedBarIndex: 2,
    eligibleFrom: { barIndex: 2, phase: 'open' },
  });
  state.orders.push(exit);
  state = day(state, 2, { open: '105', high: '110', low: '100', cap: '4' });
  expect(state.orders.find((o) => o.action.kind === 'stopLoss')?.remainingQuantity).toBe('6');
});
it('止盈部分成交后保留6股止损；缺额度触发仍取消止盈并保留市价余单', () => {
  const initial = createBacktestDailyMatchState([held(), stop(), profit()]);
  const partial = day(initial, 2, { open: '110', low: '90', cap: '4' });
  expect(partial.fills.map((f) => [f.orderId, f.quantity])).toEqual([['profit', '4']]);
  const loss = partial.orders.find((o) => o.id === 'stop-buy')!;
  expect(loss).toMatchObject({
    remainingQuantity: '6',
    triggeredAt: { barIndex: 2, phase: 'range' },
  });
  expect(partial.orders.find((o) => o.id === 'profit')?.state).toBe('cancelled');
  const next = day(partial, 3, { open: '105', low: '100', cap: '6' });
  expect(next.fills.at(-1)).toMatchObject({ orderId: 'stop-buy', price: '105', quantity: '6' });
});
it('多单共享额度、价格优先，拒单不消耗额度，重复根不刷新', () => {
  const first = buy('lower', '95');
  const second = buy('higher', '96');
  second.acceptedSequence = 1;
  const initial = createBacktestDailyMatchState([first, second]);
  const matched = day(initial, 1, { open: '90', cap: '10' });
  expect(matched.fills.map((f) => f.orderId)).toEqual(['higher']);
  expect(day(matched, 1, { open: '90', cap: '10' })).toEqual(matched);
  const open = matchBacktestDailyPhase({
    state: initial,
    bar: bar(1, '90'),
    phase: 'open',
    policy: policy('10'),
    availableQuantity: available,
    execute: (fill, order) =>
      order.id === 'higher'
        ? { accepted: false, reason: '测试拒单' }
        : { accepted: true, quantity: fill.quantity, price: fill.price },
  });
  expect(open.fills.map((f) => f.orderId)).toEqual(['lower']);
  expect(open.currentBar?.consumed).toBe('10');
});
it('实际数量按手数向下取整，研究单位保持连续；可售为零时只触发不成交', () => {
  const initial = createBacktestDailyMatchState([buy('buy', '100', '270')]);
  const input = {
    state: initial,
    bar: bar(1),
    phase: 'open' as const,
    policy: policy('150'),
    lotSize: '100',
    availableQuantity: available,
  };
  expect(matchBacktestDailyPhase(input).fills[0]?.quantity).toBe('100');
  initial.orders[0]!.quantityBasis = 'normalized-units';
  expect(matchBacktestDailyPhase({ ...input, policy: policy('10.5') }).fills[0]?.quantity).toBe(
    '10.5',
  );
  const heldState = createBacktestDailyMatchState([held(), stop()]);
  const noSell = matchBacktestDailyPhase({
    state: heldState,
    bar: bar(2, '90'),
    phase: 'open',
    policy: policy(),
    availableQuantity: () => '0',
  });
  expect(noSell.fills).toHaveLength(0);
  expect(noSell.orders[1]?.triggeredAt).toEqual({ barIndex: 2, phase: 'open' });
});
it('保护只退出其父单份额，不取消仍持仓的另一个父单保护；完整回放稳定', () => {
  const parentA = held();
  const parentB = held('second');
  const stopB = { ...stop('second'), price: { kind: 'stopMarket' as const, price: '80' } };
  const initial = createBacktestDailyMatchState([parentA, parentB, stop(), stopB]);
  const result = day(initial, 2);
  expect(result.fills.map((f) => f.quantity)).toEqual(['10']);
  expect(result.orders.find((o) => o.id === stopB.id)?.state).toBe('active');
  expect(day(JSON.parse(JSON.stringify(initial)), 2)).toEqual(result);
});

it.each(['DAY', 'bars'] as const)('整笔限价首日未触及，次日成交取决于期限 %s', kind => {
  const entry = buy('buy', '85');
  entry.validity = kind === 'DAY' ? { kind } : { kind, bars: 2 };
  let state = createBacktestDailyMatchState([entry]);
  for (const index of [1, 2]) {
    for (const phase of ['open', 'range'] as const)
      state = matchBacktestDailyPhase({
        state, phase, bar: bar(index, index === 1 ? '100' : '80'),
        policy: { ...policy(), liquidity: { kind: 'wholeOrder' } }, availableQuantity: available,
      });
  }
  expect(state.fills.map(f => f.quantity)).toEqual(kind === 'DAY' ? [] : ['27']);
});

it('同一笔27股委托仅可付26股时，按本次冻结的成交政策撮合', () => {
  const input = {
    state: createBacktestDailyMatchState([buy()]),
    phase: 'open' as const,
    bar: bar(1, '90'),
    availableQuantity: () => '26',
  };
  const whole = matchBacktestDailyPhase({
    ...input,
    policy: { ...policy(), liquidity: { kind: 'wholeOrder' } },
  });
  expect(whole.fills).toHaveLength(0);
  expect(whole.orders[0]?.remainingQuantity).toBe('27');
  expect(matchBacktestDailyPhase({ ...input, policy: policy() }).fills[0]?.quantity).toBe('26');
  expect(matchBacktestDailyPhase({ ...input, policy: policy('10') }).fills[0]?.quantity).toBe('10');
});
