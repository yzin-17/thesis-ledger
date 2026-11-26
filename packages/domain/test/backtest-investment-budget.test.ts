import { expect, it } from 'vitest';
import { DecimalValue as D } from '../src/decimal.js';
import { ExchangeMarketSimulation, type ExchangeOrderRequest } from '../src/backtest-exchange.js';
import { computeSizing, type SizingInput } from '../src/backtest-sizing.js';
import { fitBuyToInvestmentBudget } from '../src/backtest-investment-budget.js';
import { exchangeRunInput } from './backtest-simulation.fixtures.js';

function sample({
  held = '0',
  fraction = '0.5',
  open = '110',
  cash = '100000',
  side = 'buy' as 'buy' | 'sell',
} = {}) {
  const source = exchangeRunInput();
  const at = '2026-09-08T01:35:00.000Z';
  const openedAt = '2026-09-08T01:40:00.000Z';
  const input: SizingInput = {
    rule: { type: 'percentOfEquity', percent: fraction },
    executionCurrency: 'CNY',
    lotSize: '100',
    currentQuantity: held,
    evaluationAt: at,
    price: { value: '100', occurredAt: at, availableAt: at },
    equity: { amount: '100000', currency: 'CNY', occurredAt: at, availableAt: at },
    executionProjection: {
      evaluationAt: openedAt,
      price: { value: open, occurredAt: openedAt, availableAt: openedAt },
      equity: { amount: '100000', currency: 'CNY', occurredAt: openedAt, availableAt: openedAt },
    },
  };
  const sizing = computeSizing(input);
  if (sizing.status !== 'available') throw Error('fixture sizing');
  const order: ExchangeOrderRequest = {
    orderId: 'budget-order',
    intentId: 'budget-intent',
    signalId: 'budget-signal',
    executionSymbol: '600519.SH',
    market: 'CN',
    side,
    reason: 'signal',
    occurredAt: at,
    availableAt: at,
    quantity: sizing.normalizedQuantity,
  };
  const market = {
    ...source.exchange,
    currency: 'CNY' as const,
    account: { settledCash: cash, availableQuantity: '1000' },
    bars: [{ ...source.exchange.bars[1]!, open, previousClose: open }],
    costs: {
      version: 'budget-cost',
      slippageRate: '0.01',
      commissionRate: '0.001',
      minimumCommission: { amount: '100', currency: 'CNY' as const },
    },
  };
  return { input, sizing, order, market };
}

it('原始手数按实际滑点及全部费用封顶，现金和比例分别收紧且不向上取整', () => {
  for (const cash of ['100000', '30000']) {
    const s = sample({ cash });
    const result = fitBuyToInvestmentBudget(
      s.order,
      s.sizing,
      s.input,
      () => s.market,
      new ExchangeMarketSimulation(),
    );
    expect(result.order.quantity).toBe(cash === '100000' ? '400' : '200');
    const plan = new ExchangeMarketSimulation().plan({ ...s.market, order: result.order });
    expect(plan.status).toBe('filled');
    if (plan.status !== 'filled') return;
    expect(D.from(plan.cashReservation!.amount).compareTo('50000')).toBeLessThanOrEqual(0);
    expect(D.from(plan.cashReservation!.amount).compareTo(cash)).toBeLessThanOrEqual(0);
  }
});

it('持仓额度先扣执行开盘估值，超额及不足一手拒绝，低开不扩大已冻结数量', () => {
  const s = sample({ held: '300' });
  s.sizing.investmentLimit = { fraction: '0.5', scope: 'position' };
  const fit = () =>
    fitBuyToInvestmentBudget(
      s.order,
      s.sizing,
      s.input,
      () => s.market,
      new ExchangeMarketSimulation(),
    );
  expect(fit().order.quantity).toBe('100');
  s.input.currentQuantity = '450';
  expect(fit().sizing).toMatchObject({ status: 'rejected', reasonCode: 'QUANTITY_BELOW_LOT' });
  s.input.currentQuantity = '500';
  expect(fit().order.quantity).toBe('0');
  const low = sample({ open: '50' });
  expect(
    fitBuyToInvestmentBudget(
      low.order,
      low.sizing,
      low.input,
      () => low.market,
      new ExchangeMarketSimulation(),
    ).order.quantity,
  ).toBe(low.order.quantity);
});

it('执行投影不可用不能回退收盘权益；卖出不受买入预算限制', () => {
  const s = sample();
  s.input.executionProjection = { evaluationAt: '2026-09-08T01:40:00.000Z' };
  expect(
    fitBuyToInvestmentBudget(
      s.order,
      s.sizing,
      s.input,
      () => s.market,
      new ExchangeMarketSimulation(),
    ).sizing,
  ).toMatchObject({ status: 'unavailable', reasonCode: 'PRICE_UNAVAILABLE' });
  const sale = sample({ side: 'sell' });
  expect(
    fitBuyToInvestmentBudget(
      sale.order,
      sale.sizing,
      sale.input,
      () => sale.market,
      new ExchangeMarketSimulation(),
    ),
  ).toEqual({ order: sale.order, sizing: sale.sizing });
});
