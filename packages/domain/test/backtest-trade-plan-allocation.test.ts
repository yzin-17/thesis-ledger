import { expect, it } from 'vitest';
import { BacktestTradePlanAllocation } from '../src/backtest-trade-plan-allocation.js';
import { tradingCalendarFromFact } from '../src/execution-rules.js';
import { sourceSeries } from './backtest-simulation.fixtures.js';

const calendar = {
  calendar: tradingCalendarFromFact({
    market: 'CN',
    timezone: 'Asia/Shanghai',
    provider: 'fixture',
    providerRevision: '1',
    availableAt: '2026-06-01T00:00:00Z',
    range: { start: '2026-07-01', end: '2026-08-31' },
    holidays: [],
    sessions: [{ startMinute: 570, endMinute: 900 }],
    sessionOverrides: [],
  }),
  availableAt: '2026-06-01T00:00:00Z',
};

it('月末只评价一次，不同时间戳的重复观察和拒单后观察不重算；次月重新判断', () => {
  let reads = 0;
  const allocation = new BacktestTradePlanAllocation(
    {
      monthlyRebalance: {
        targetEquityFraction: '0.30',
        deviationThreshold: '0.03',
        evaluation: 'lastTradingDayClose',
      },
    },
    sourceSeries([]),
    calendar,
    (intent) => {
      reads += 1;
      return {
        rule: { type: 'percentOfEquity', percent: '0.5' },
        currentQuantity: '2700',
        executionCurrency: 'CNY',
        lotSize: '100',
        evaluationAt: intent.occurredAt,
        price: { value: '10', occurredAt: intent.occurredAt, availableAt: intent.availableAt },
        equity: {
          amount: '100000',
          currency: 'CNY',
          occurredAt: intent.occurredAt,
          availableAt: intent.availableAt,
        },
      };
    },
  );
  expect(allocation.at('2026-07-30T07:00:00Z', false)).toEqual({ status: 'unchanged' });
  expect(allocation.at('2026-07-31T06:59:59Z', false)).toMatchObject({ status: 'unavailable' });
  expect(reads).toBe(0);
  expect(allocation.at('2026-07-31T07:00:00Z', false)).toMatchObject({
    status: 'available',
    action: { kind: 'rebalance', side: 'buy', quantity: '300' },
    description: '月末目标仓位调仓',
  });
  expect(allocation.at('2026-07-31T07:00:00Z', false)).toEqual({ status: 'unchanged' });
  expect(allocation.at('2026-07-31T08:00:00Z', false)).toEqual({ status: 'unchanged' });
  expect(allocation.at('2026-08-03T07:00:00Z', false)).toEqual({ status: 'unchanged' });
  expect(reads).toBe(1);
  expect(allocation.at('2026-08-31T07:00:00Z', false)).toMatchObject({ status: 'available' });
  expect(reads).toBe(2);
});
