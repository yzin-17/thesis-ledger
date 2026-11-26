import { expect, it } from 'vitest';
import { runExchangeSimulation, type BacktestTradePlan } from '../src/index.js';
import {
  exchangeRunInput,
  exchangeBar,
  sourceSeries,
  frozenExchangeExecutionModel,
} from './backtest-simulation.fixtures.js';

function run(dividend = false, pause = true) {
  const input = exchangeRunInput();
  const intraday = Array.from({ length: 9 }, (_, n) =>
    new Date(Date.UTC(2026, 8, 8, 1, 35 + n * 10)).toISOString(),
  );
  const dates = [
    ...intraday,
    ...[9, 10, 11].map((day) => new Date(Date.UTC(2026, 8, day, 1, 35)).toISOString()),
  ];
  const series = {
    ...sourceSeries(
      dates.map((occurredAt) => ({
        occurredAt,
        availableAt: occurredAt,
        value: '10',
        status: 'available' as const,
      })),
    ),
    timeframe: '5m' as const,
  };
  const model = frozenExchangeExecutionModel(0);
  model.scope.range.end = '2026-09-11';
  for (const segment of model.segments) {
    segment.range.end = '2026-09-11';
    segment.fees.commission = {
      treatment: 'charged',
      side: 'both',
      basis: 'turnover',
      currency: 'CNY',
      rate: '0',
      minimum: { kind: 'amount', amount: '30' },
    };
  }
  const tradePlan: BacktestTradePlan = {
    version: 1,
    evaluation: 'barClose',
    stages: [],
    ...(pause
      ? { lossPause: { completedTrades: 3, tradingDays: 2, pnlBasis: 'fillsNetOfFees' } as const }
      : {}),
  };
  return runExchangeSimulation({
    ...input,
    simulation: {
      ...input.simulation,
      strategy: {
        ...input.simulation.strategy,
        entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
        exit: { type: 'positionState', field: 'isOpen' },
        tradePlan,
      },
      ticks: dates.map((occurredAt) => ({
        occurredAt,
        availableAt: occurredAt,
        timeframe: '5m' as const,
      })),
      sourceSeries: new Map([['close', series]]),
      corporateActions: dividend
        ? [
            {
              symbol: '600519.SH',
              market: 'CN',
              instrumentType: 'STOCK',
              type: 'CASH_DIVIDEND',
              cashAmount: '1',
              currency: 'CNY',
              occurredAt: '2026-09-08T02:01:00Z',
              availableAt: '2026-09-08T02:01:00Z',
              provider: 'fixture',
              providerRevision: '1',
            },
          ]
        : [],
    },
    exchange: {
      ...input.exchange,
      tradePlanPrices: series,
      tradePlanCalendar: { calendar: input.exchange.calendar, availableAt: '2026-09-01T00:00:00Z' },
      bars: dates.map((date, n) =>
        exchangeBar(
          new Date(Date.parse(date) + 300000).toISOString(),
          new Date(Date.parse(date) + 600000).toISOString(),
          n % 2 === 0 ? '10' : '10.1',
          '10',
        ),
      ),
      executionModel: model,
      dataAsOf: '2026-09-12T00:00:00Z',
    },
  });
}

it('真实账本费用把三笔毛盈利变为净亏损；之后两个交易日不开仓，第三日重新检查', () => {
  const result = run();
  expect(result.rejects).toEqual([]);
  expect(result.fills.slice(0, 6).map((f) => [f.side, f.price])).toEqual([
    ['buy', '10'],
    ['sell', '10.1'],
    ['buy', '10'],
    ['sell', '10.1'],
    ['buy', '10'],
    ['sell', '10.1'],
  ]);
  expect(result.tradePlan?.memory.lossPause?.completedNet).toEqual(['-40', '-40', '-40']);
  expect(
    result.fills.filter((f) => f.side === 'buy').map((f) => f.occurredAt.slice(0, 10)),
  ).toEqual(['2026-09-08', '2026-09-08', '2026-09-08', '2026-09-11']);
  expect(run().fills).toEqual(result.fills);
});

it('现金分配确实改变账本现金，但不改变成交净收益窗口、暂停和成交；无暂停配置仍继续开仓', () => {
  const baseline = run(),
    withDividend = run(true),
    noPause = run(false, false);
  expect(withDividend.corporateActionResults).toMatchObject([{ applied: true }]);
  expect(withDividend.tradePlan?.memory.lossPause).toEqual(baseline.tradePlan?.memory.lossPause);
  expect(withDividend.fills).toEqual(baseline.fills);
  expect(
    Number(withDividend.ledger.cash.CNY.unsettled) - Number(baseline.ledger.cash.CNY.unsettled),
  ).toBe(200);
  expect(noPause.fills.filter((f) => f.side === 'buy').length).toBeGreaterThan(4);
});
