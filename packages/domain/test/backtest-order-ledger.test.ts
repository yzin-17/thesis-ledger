import { expect, it } from 'vitest';
import {
  SimulationLedger,
  BacktestTradePlanRuntime,
  type SimulationExpressionContext,
  type SimulationFillRecord,
  type FrozenExecutionModelFees,
} from '../src/index.js';
import {
  emptyBacktestOrderCharges,
  quoteBacktestOrderCharges,
} from '../src/backtest-order-charges.js';

const createLedger = () =>
  new SimulationLedger({
    executionInstrument: { symbol: 'AAPL', market: 'US', assetType: 'stock', currency: 'USD' },
    baseCurrency: 'USD',
    initialCash: { USD: '1000' },
  });
const at = (n: number) => `2026-05-${String(18 + n).padStart(2, '0')}T13:30:00Z`;
const buyFill = (id: string, quantity: string, remaining: string) => ({
  eventId: id,
  fillId: id,
  executionSymbol: 'AAPL',
  side: 'buy' as const,
  quantity,
  price: '10',
  currency: 'USD' as const,
  charges: [{ amount: '5', currency: 'USD' as const }],
  occurredAt: at(0),
  availableAt: at(0),
  cashReservationId: 'buy-budget',
  cashReservationRemaining: remaining,
});

it('实际账本成交10后保留17股余单预算，取消释放余款而不撤回已买持仓', () => {
  const ledger = createLedger();
  expect(ledger.reserveCash('buy-budget', 'USD', '275').accepted).toBe(true);
  const fill = buyFill('first-ten', '10', '170');
  expect(ledger.applyFill(fill).applied).toBe(true);
  expect(ledger.snapshot().position.quantity).toBe('10');
  expect(ledger.availableCash('USD')).toBe('725');
  expect(ledger.applyFill(fill)).toMatchObject({ applied: false, code: 'DUPLICATE_EVENT' });
  ledger.releaseCash('buy-budget');
  expect(ledger.availableCash('USD')).toBe('895');
  expect(ledger.snapshot().position.quantity).toBe('10');
});
it('扣款和余单占款超预算时不改变预留或持仓，后续合法成交仍可用', () => {
  const ledger = createLedger();
  ledger.reserveCash('buy-budget', 'USD', '275');
  expect(ledger.applyFill(buyFill('bad', '10', '171'))).toMatchObject({
    applied: false,
    code: 'INSUFFICIENT_CASH',
  });
  expect(ledger.availableCash('USD')).toBe('725');
  expect(ledger.snapshot().position.quantity).toBe('0');
  expect(ledger.applyFill(buyFill('good', '10', '170')).applied).toBe(true);
});
it('同一订单分两根成交只收一次最低佣金，账本第二笔仅扣增量', () => {
  const ledger = createLedger();
  ledger.reserveCash('buy-budget', 'USD', '275');
  const costs = {
    version: 'test',
    slippageRate: '0',
    commissionRate: '0.001',
    minimumCommission: { amount: '5', currency: 'USD' as const },
  };
  const first = quoteBacktestOrderCharges({
    previous: emptyBacktestOrderCharges(),
    side: 'buy',
    quantity: '10',
    price: '10',
    currency: 'USD',
    quantityBasis: 'actual-units',
    costs,
  });
  const second = quoteBacktestOrderCharges({
    previous: first.memory,
    side: 'buy',
    quantity: '17',
    price: '10',
    currency: 'USD',
    quantityBasis: 'actual-units',
    costs,
  });
  expect([first.total, second.total]).toEqual(['5', '0']);
  expect(
    ledger.applyFill({ ...buyFill('first', '10', '170'), charges: first.charges }).applied,
  ).toBe(true);
  expect(
    ledger.applyFill({
      ...buyFill('second', '17', '0'),
      occurredAt: at(1),
      availableAt: at(1),
      charges: second.charges,
    }).applied,
  ).toBe(true);
  expect(ledger.snapshot().position.quantity).toBe('27');
  expect(ledger.availableCash('USD')).toBe('725');
});

it('冻结费用中佣金按订单累计，税费仍按本笔金额计算', () => {
  const none = { treatment: 'notApplicable' as const, reason: '独立样本' };
  const fees: FrozenExecutionModelFees = {
    currency: 'USD',
    collection: 'perFillPerCharge',
    rounding: { mode: 'halfUp', decimalPlaces: 2 },
    commission: {
      treatment: 'charged',
      side: 'both',
      basis: 'turnover',
      currency: 'USD',
      rate: '0.001',
      minimum: { kind: 'amount', amount: '5' },
    },
    stampDuty: {
      treatment: 'charged',
      side: 'sell',
      basis: 'turnover',
      currency: 'USD',
      rate: '0.001',
      minimum: { kind: 'none' },
    },
    transferFee: none,
    regulatoryFee: none,
    handlingFee: none,
  };
  const input = {
    side: 'sell' as const,
    price: '100',
    currency: 'USD' as const,
    quantityBasis: 'actual-units' as const,
    costs: { version: 'test', commissionRate: '0', slippageRate: '0' },
    fees,
  };
  const first = quoteBacktestOrderCharges({
    ...input,
    previous: emptyBacktestOrderCharges(),
    quantity: '10',
  });
  const second = quoteBacktestOrderCharges({ ...input, previous: first.memory, quantity: '17' });
  expect(first.charges.map((c) => [c.code, c.amount])).toEqual([
    ['commission', '5'],
    ['stampDuty', '1'],
  ]);
  expect(second.charges.map((c) => [c.code, c.amount])).toEqual([
    ['commission', '0'],
    ['stampDuty', '1.7'],
  ]);
});

function runtime() {
  const points = ['100', '110', '90'].map((value, n) => ({
    occurredAt: at(n),
    availableAt: at(n),
    value,
    status: 'available' as const,
  }));
  const plan = new BacktestTradePlanRuntime(
    {
      version: 1,
      evaluation: 'barClose',
      initialStop: { kind: 'percent', percent: '0.05' },
      stages: [
        {
          id: 'half',
          trigger: { kind: 'gainPercent', value: '0.05' },
          action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.5' },
        },
      ],
    },
    {
      sourceId: 'main',
      symbol: 'AAPL',
      market: 'US',
      assetType: 'stock',
      field: 'close',
      timeframe: '1d',
      points,
    },
    points.map((p) => p.occurredAt),
  );
  plan.actions.set('entry', { kind: 'entry' });
  plan.registerOrder('buy', 'entry');
  return plan;
}
const fill = (id: string, quantity: string): SimulationFillRecord => ({
  fillId: id,
  orderId: 'buy',
  executionSymbol: 'AAPL',
  side: 'buy',
  quantity,
  price: '100',
  charges: [],
  occurredAt: at(0),
  availableAt: at(0),
  reason: 'signal',
});
const context = (n: number, quantity: string): SimulationExpressionContext => ({
  tick: { occurredAt: at(n) },
  sourceSeries: {},
  positionState: {
    isOpen: true,
    quantity,
    averageCost: '100',
    holdingPeriods: n,
    availableAt: at(n),
  },
});
const selection = (n: number) => ({
  state: {},
  entry: { status: 'available' as const, value: false, occurredAt: at(n), availableAt: at(n) },
  exit: { status: 'available' as const, value: false, occurredAt: at(n), availableAt: at(n) },
});
it('计划初始基数累计同一首单成交，取消后才按最终数量冻结阶段', () => {
  const plan = runtime();
  plan.accept(fill('ten', '10'), '10', undefined, { terminal: false });
  plan.accept(fill('seven', '7'), '17', undefined, { terminal: false });
  expect(plan.snapshot().initialQuantity).toBe('17');
  plan.reject('buy');
  const signal = plan.select(context(1, '17'), selection(1));
  expect(plan.actions.get(signal!.signalId)).toMatchObject({ kind: 'reduce', quantity: '8.5' });
});
it('首单部分成交期间不启动分批阶段，但收盘止损仍可触发', () => {
  const plan = runtime();
  plan.accept(fill('ten', '10'), '10', undefined, { terminal: false });
  expect(plan.select(context(1, '10'), selection(1))).toBeUndefined();
  const signal = plan.select(context(2, '10'), selection(2));
  expect(plan.actions.get(signal!.signalId)?.kind).toBe('stop');
});
