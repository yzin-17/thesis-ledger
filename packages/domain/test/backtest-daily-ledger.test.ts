import { expect, it } from 'vitest';
import {
  BacktestDailyLedger,
  BacktestTradePlanRuntime,
  SimulationLedger,
  createBacktestDailyOrder,
  type BacktestDailyOrder,
  type BacktestDailyLedgerBar,
} from '../src/index.js';

const at = (n: number) => `2026-05-${18 + n}T13:30:00Z`;
const bar = (n: number, open = '100', low = '100'): BacktestDailyLedgerBar => ({
  index: n,
  key: `day-${n}`,
  open,
  high: '110',
  low,
  close: '105',
  openedAt: at(n),
  completedAt: `2026-05-${18 + n}T20:00:00Z`,
});
const order = (id: string, side: 'buy' | 'sell', quantity: string): BacktestDailyOrder =>
  createBacktestDailyOrder({
    id,
    templateId: id,
    cycleId: 'cycle',
    side,
    action: { kind: side === 'buy' ? 'entry' : 'exit' },
    quantityBasis: 'actual-units',
    quantity,
    acceptedSequence: side === 'buy' ? 0 : 3,
    validity: { kind: 'bars', bars: 2 },
    price: { kind: 'limit', price: '100' },
    activatedBarIndex: 0,
    eligibleFrom: { barIndex: 0, phase: 'open' },
  });
const stop = () =>
  createBacktestDailyOrder({
    ...order('stop', 'sell', '1'),
    quantity: '0',
    action: { kind: 'stopLoss' },
    validity: { kind: 'position' },
    price: { kind: 'stopMarket', price: '95' },
    acceptedSequence: 1,
    activatedBarIndex: undefined,
    eligibleFrom: undefined,
    parent: { orderId: 'buy', activation: 'eachFill' },
    exitGroup: 'protect',
  });
function setup(cap: string | null = '10', positionAt?: string) {
  const ledger = new SimulationLedger({
    executionInstrument: { symbol: 'AAPL', market: 'US', assetType: 'stock', currency: 'USD' },
    baseCurrency: 'USD',
    initialCash: { USD: '10000' },
  });
  const plan = new BacktestTradePlanRuntime(
    { version: 1, evaluation: 'barClose', stages: [] },
    {
      sourceId: 'main',
      symbol: 'AAPL',
      market: 'US',
      assetType: 'stock',
      field: 'close',
      timeframe: '1d',
      points: [],
    },
    [],
  );
  const book = new BacktestDailyLedger({
    ledger,
    symbol: 'AAPL',
    currency: 'USD',
    lotSize: '1',
    policy: {
      conflict: 'stopFirst',
      childActivation: 'openSameBarRangeNextBar',
      partialExit: 'protectRemaining',
      liquidity: cap === null ? { kind: 'wholeOrder' } : { kind: 'perBarCap', quantity: cap },
    },
    costs: {
      version: 'test',
      slippageRate: '0',
      commissionRate: '0.001',
      minimumCommission: { amount: '5', currency: 'USD' },
    },
    validateFill: () => ({ accepted: true }),
    settlementFor: (fill) => ({
      cashAt: fill.occurredAt,
      positionAt: positionAt ?? fill.occurredAt,
    }),
    tradePlan: plan,
  });
  return { book, ledger, plan };
}
const day = (book: BacktestDailyLedger, n: number, open = '100', low = '100') => {
  book.phase(bar(n, open, low), 'open');
  return book.phase(bar(n, open, low), 'range');
};

it('新父单尚未交收时，保护不能借用同标的原有可售持仓', () => {
  const { book, ledger } = setup('10', at(1));
  const old = {
    eventId: 'old',
    fillId: 'old-fill',
    orderId: 'old-order',
    executionSymbol: 'AAPL',
    currency: 'USD' as const,
    side: 'buy' as const,
    quantity: '10',
    price: '100',
    charges: [],
    occurredAt: at(0),
    availableAt: at(0),
  };
  expect(ledger.applyEvent({ type: 'fill', payload: old }).applied).toBe(true);
  expect(
    ledger.applyEvent({
      type: 'settlement',
      payload: {
        eventId: 'old-settled',
        sourceEventId: 'old',
        kind: 'position',
        currency: 'USD',
        symbol: 'AAPL',
        occurredAt: at(0),
        availableAt: at(0),
      },
    }).applied,
  ).toBe(true);
  book.submit(order('buy', 'buy', '1'), { budget: '200' });
  book.submit(stop());
  day(book, 0, '100', '90');
  expect(book.fills.map((fill) => fill.side)).toEqual(['buy']);
  expect(ledger.snapshot().position).toMatchObject({
    quantity: '11',
    settledQuantity: '10',
    unsettledQuantity: '1',
  });
  day(book, 1);
  expect(book.fills.map((fill) => [fill.side, fill.quantity])).toEqual([
    ['buy', '1'],
    ['sell', '1'],
  ]);
  expect(ledger.snapshot().position).toMatchObject({ quantity: '10', settledQuantity: '10' });
});

it('区间成交只在完成行情实际可见后入账，结算不早于该可见时间', () => {
  const { book, ledger } = setup();
  book.submit(
    { ...order('buy', 'buy', '1'), price: { kind: 'limit', price: '95' } },
    { budget: '100' },
  );
  const point = { ...bar(0, '100', '90'), completedAvailableAt: '2026-05-18T20:05:00Z' };
  book.phase(point, 'open');
  book.phase(point, 'range');
  expect(book.fills[0]).toMatchObject({
    occurredAt: point.completedAt,
    availableAt: point.completedAvailableAt,
    price: '95',
  });
  expect(book.settlementEvents.every((e) => e.availableAt === point.completedAvailableAt)).toBe(
    true,
  );
  expect(ledger.snapshot().position.settledQuantity).toBe('1');
});

it('撮合连实际账本及计划：成交10撤余17，再退出4只保护6', () => {
  const { book, ledger, plan } = setup();
  book.submit(order('buy', 'buy', '27'), { budget: '2705' });
  book.submit(stop());
  day(book, 0);
  expect(ledger.snapshot().position).toMatchObject({ quantity: '10', settledQuantity: '10' });
  expect(ledger.availableCash('USD')).toBe('7295');
  expect(plan.snapshot().initialQuantity).toBe('10');
  book.cancel('buy');
  expect(ledger.availableCash('USD')).toBe('8995');
  book.submit({
    ...order('exit', 'sell', '4'),
    price: { kind: 'market' },
    activatedBarIndex: 1,
    eligibleFrom: { barIndex: 1, phase: 'open' },
  });
  day(book, 1, '105');
  expect(ledger.snapshot().position.quantity).toBe('6');
  expect(book.state.orders.find((o) => o.id === 'stop')?.remainingQuantity).toBe('6');
  expect(plan.snapshot().initialQuantity).toBe('10');
  const cash = ledger.availableCash('USD');
  day(book, 1, '105');
  expect(ledger.availableCash('USD')).toBe(cash);
  expect(book.fills).toHaveLength(2);
  const split = {
    eventId: 'split',
    executionSymbol: 'AAPL',
    ratio: '2',
    occurredAt: at(2),
    availableAt: at(2),
  };
  expect(book.applySplit(split).applied).toBe(true);
  expect(ledger.snapshot().position.quantity).toBe('12');
  expect(book.state.orders.find((o) => o.id === 'stop')).toMatchObject({
    remainingQuantity: '12',
    price: { price: '47.5' },
  });
  expect(plan.snapshot().initialQuantity).toBe('20');
  expect(book.applySplit(split).applied).toBe(false);
  expect(book.state.orders.find((o) => o.id === 'stop')?.remainingQuantity).toBe('12');
});
it('资金不足以全量成交时按含费预算缩量，不把整张订单拒绝', () => {
  const { book, ledger } = setup('100');
  book.submit(order('buy', 'buy', '27'), { budget: '1005' });
  day(book, 0);
  expect(book.fills[0]?.quantity).toBe('10');
  expect(ledger.snapshot().position.quantity).toBe('10');
  expect(book.state.orders[0]?.state).toBe('partially_filled');
  expect(book.state.rejects).toHaveLength(0);
});
it('止盈部分成交后剩余止损继续退出，实际完整平仓才重置计划', () => {
  const { book, ledger, plan } = setup('4');
  book.submit(
    { ...order('buy', 'buy', '10'), validity: { kind: 'bars', bars: 3 } },
    { budget: '1005' },
  );
  book.submit(stop());
  book.submit({
    ...stop(),
    id: 'profit',
    action: { kind: 'takeProfit' },
    acceptedSequence: 2,
    price: { kind: 'limit', price: '108' },
  });
  day(book, 0);
  day(book, 1);
  day(book, 2);
  // 第三根买完余下两份后，区间额度还可止盈两份。
  expect(ledger.snapshot().position.quantity).toBe('8');
  day(book, 3, '110', '90');
  expect(ledger.snapshot().position.quantity).toBe('4');
  expect(plan.snapshot().initialQuantity).toBe('10');
  expect(book.state.orders.find((o) => o.id === 'stop')?.remainingQuantity).toBe('4');
  day(book, 4, '105', '100');
  expect(ledger.snapshot().position.quantity).toBe('0');
  expect(plan.snapshot().initialQuantity).toBe('0');
  expect(book.state.orders.find((o) => o.id === 'stop')?.state).toBe('filled');
});
it('同一买单跨根部分成交，最低佣金不重复，初始基数累计实际成交', () => {
  const { book, ledger, plan } = setup('10');
  book.submit(order('buy', 'buy', '27'), { budget: '2705' });
  day(book, 0);
  day(book, 1);
  expect(book.fills.map((f) => f.charges.reduce((sum, c) => sum + Number(c.amount), 0))).toEqual([
    5, 0,
  ]);
  expect(ledger.snapshot().position.quantity).toBe('20');
  expect(plan.snapshot().initialQuantity).toBe('20');
  expect(book.state.orders[0]?.state).toBe('expired');
  expect(ledger.availableCash('USD')).toBe('7995');
});
it('CN未结算份额不会因保护触发当日卖出，结算后触发余单不需重新穿价', () => {
  const ledger = new SimulationLedger({
    executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock', currency: 'CNY' },
    baseCurrency: 'CNY',
    initialCash: { CNY: '100000' },
  });
  const book = new BacktestDailyLedger({
    ledger,
    symbol: '600519.SH',
    currency: 'CNY',
    lotSize: '100',
    policy: {
      conflict: 'stopFirst',
      childActivation: 'openSameBarRangeNextBar',
      partialExit: 'protectRemaining',
      liquidity: { kind: 'perBarCap', quantity: '100' },
    },
    costs: { version: 'test', commissionRate: '0', slippageRate: '0' },
    validateFill: () => ({ accepted: true }),
    settlementFor: (fill) => ({ cashAt: fill.occurredAt, positionAt: at(1) }),
  });
  book.submit(order('buy', 'buy', '100'), { budget: '10000' });
  book.submit(stop());
  day(book, 0, '100', '90');
  expect(book.fills.map((f) => f.side)).toEqual(['buy']);
  expect(ledger.snapshot().position.settledQuantity).toBe('0');
  expect(book.state.orders.find((o) => o.id === 'stop')?.triggeredAt).toEqual({
    barIndex: 0,
    phase: 'range',
  });
  day(book, 1, '105', '100');
  expect(book.fills.at(-1)).toMatchObject({ side: 'sell', price: '105', quantity: '100' });
  expect(ledger.snapshot().position.quantity).toBe('0');
});

it('整笔买单差一个单位时不入账，下一根能全额支付时才一次成交', () => {
  const { book, ledger } = setup(null);
  book.submit(order('buy', 'buy', '10'), { budget: '905' });
  day(book, 0);
  expect(book.fills).toEqual([]);
  expect(ledger.snapshot().position.quantity).toBe('0');
  day(book, 1, '90', '90');
  expect(book.fills.map(f => [f.quantity, f.price])).toEqual([['10', '90']]);
});
it('整笔模式的已触发保护等待父单交收后才能卖出', () => {
  const { book } = setup(null, at(1));
  book.submit(order('buy', 'buy', '10'), { budget: '1005' });
  book.submit(stop());
  day(book, 0, '100', '90');
  expect(book.fills.map(f => f.side)).toEqual(['buy']);
  day(book, 1);
  expect(book.fills.map(f => [f.side, f.quantity])).toEqual([['buy', '10'], ['sell', '10']]);
});
