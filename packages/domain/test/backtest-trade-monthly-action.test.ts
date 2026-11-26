import { expect, it } from 'vitest';
import { monthlyTradeAction } from '../src/backtest-trade-monthly-action.js';
import { tradingCalendarFromFact } from '../src/execution-rules.js';
import type { SizingInput } from '../src/backtest-sizing.js';

const at = '2026-07-31T07:00:00Z';
const config = {
  targetEquityFraction: '0.30',
  deviationThreshold: '0.03',
  evaluation: 'lastTradingDayClose' as const,
};
const calendar = {
  calendar: tradingCalendarFromFact({
    market: 'CN',
    timezone: 'Asia/Shanghai',
    provider: 'fixture',
    providerRevision: '1',
    availableAt: '2026-06-01T00:00:00Z',
    range: { start: '2026-07-01', end: '2026-07-31' },
    holidays: [],
    sessions: [{ startMinute: 570, endMinute: 900 }],
    sessionOverrides: [],
  }),
  availableAt: '2026-06-01T00:00:00Z',
};
const account = (quantity: string): SizingInput => ({
  rule: { type: 'percentOfEquity', percent: '0.5' },
  currentQuantity: quantity,
  executionCurrency: 'CNY',
  lotSize: '100',
  evaluationAt: at,
  price: { value: '10', occurredAt: at, availableAt: at },
  equity: { amount: '100000', currency: 'CNY', occurredAt: at, availableAt: at },
});
const action = (quantity: string, patch: Partial<SizingInput> = {}) =>
  monthlyTradeAction(
    { at, executionSymbol: '159516.SZ', firstEntry: quantity === '0', config },
    calendar,
    () => ({ ...account(quantity), ...patch }),
  );

it('偏离恰好3个百分点执行，2.99个百分点跳过；双向偏离使用同一精确阈值', () => {
  expect(action('2700')).toMatchObject({
    status: 'available',
    action: { kind: 'rebalance', side: 'buy', quantity: '300', targetWeight: '0.30' },
  });
  expect(action('2701')).toEqual({ status: 'unchanged' });
  expect(action('3300')).toMatchObject({
    status: 'available',
    action: { side: 'sell', quantity: '300' },
  });
  expect(action('3299')).toEqual({ status: 'unchanged' });
  expect(action('3000')).toEqual({ status: 'unchanged' });
  expect(action('2999')).toEqual({ status: 'unchanged' });
  expect(action('3001')).toEqual({ status: 'unchanged' });
  expect(action('0')).toMatchObject({
    status: 'available',
    action: { kind: 'entry', quantity: '3000' },
  });
});
it('非月末不读取账户；月份覆盖未知不猜测，未来价格与缺账户不生成动作', () => {
  expect(
    monthlyTradeAction(
      { at: '2026-07-30T07:00:00Z', executionSymbol: '159516.SZ', firstEntry: true, config },
      calendar,
      () => {
        throw new Error('非月末不读账户');
      },
    ),
  ).toEqual({ status: 'unchanged' });
  expect(
    monthlyTradeAction(
      { at, executionSymbol: '159516.SZ', firstEntry: true, config },
      undefined,
      () => account('0'),
    ),
  ).toMatchObject({ status: 'unavailable' });
  expect(
    monthlyTradeAction(
      { at, executionSymbol: '159516.SZ', firstEntry: true, config },
      calendar,
      undefined,
    ),
  ).toMatchObject({ reason: 'TRADE_PLAN_MONTHLY_ACCOUNT_MISSING' });
  expect(
    action('2700', { price: { value: '10', occurredAt: at, availableAt: '2026-08-01T00:00:00Z' } }),
  ).toMatchObject({ status: 'unavailable' });
});
