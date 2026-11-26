import { expect, it } from 'vitest';
import { DecimalValue as D } from '../src/decimal.js';
import { runExchangeSimulation, type BacktestTradePlan } from '../src/index.js';
import {
  exchangeRunInput,
  exchangeBar,
  sourceSeries,
  frozenExchangeExecutionModel,
} from './backtest-simulation.fixtures.js';

const dates = ['01', '02', '03', '04', '07', '08', '09', '10', '11'].map((day) => '2026-09-' + day);
const closes = ['10', '10.1', '10', '11', '9.9', '10', '9.9', '10', '9.9'];
const at = (date: string) => date + 'T07:00:00.000Z';
function execute(
  options: {
    jump?: boolean;
    stop?: boolean;
    ordinaryExit?: boolean;
    duplicate?: boolean;
    zero?: boolean;
    tPlusTwo?: boolean;
  } = {},
) {
  const input = exchangeRunInput();
  const prices = options.zero ? closes.map(() => '10') : closes;
  const series = {
    ...sourceSeries(
      dates.map((date, n) => ({
        occurredAt: at(date),
        availableAt: at(date),
        value: prices[n]!,
        status: 'available' as const,
      })),
    ),
    timeframe: '1d' as const,
  };
  const model = frozenExchangeExecutionModel(options.tPlusTwo ? 2 : 0);
  model.scope.range = { start: dates[0]!, end: dates.at(-1)! };
  for (const segment of model.segments) segment.range = { ...model.scope.range };
  const tradePlan: BacktestTradePlan = {
    version: 1,
    evaluation: 'barClose',
    stages: [],
    volatilityTarget: {
      returnPeriods: 2,
      targetAnnualVolatility: '0.1',
      maxEquityFraction: '0.5',
      annualizationPeriods: 252,
      returnKind: 'simple',
      variance: 'sample',
      update: 'dailyClose',
    },
    ...(options.stop ? { initialStop: { kind: 'percent', percent: '0.05' } as const } : {}),
  };
  const ticks = dates.map((date) => ({
    occurredAt: at(date),
    availableAt: at(date),
    timeframe: '1d' as const,
  }));
  if (options.duplicate) ticks.splice(3, 0, ticks[2]!);
  return runExchangeSimulation({
    ...input,
    simulation: {
      ...input.simulation,
      strategy: {
        ...input.simulation.strategy,
        primaryTimeframe: '1d',
        entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
        exit: options.ordinaryExit
          ? { type: 'positionState', field: 'isOpen' }
          : {
              type: 'compare',
              operator: 'eq',
              left: { type: 'constant', value: '0' },
              right: { type: 'constant', value: '1' },
            },
        tradePlan,
      },
      ticks,
      sourceSeries: new Map([['close', series]]),
    },
    exchange: {
      ...input.exchange,
      tradePlanPrices: series,
      tradePlanCalendar: { calendar: input.exchange.calendar, availableAt: '2026-08-01T00:00:00Z' },
      executionModel: model,
      dataAsOf: '2026-09-12T00:00:00Z',
      bars: dates.map((date, n) =>
        exchangeBar(
          date + 'T01:30:00.000Z',
          at(date),
          options.jump && n === 3 ? '15' : prices[Math.max(0, n - 1)]!,
          prices[n]!,
        ),
      ),
      sizingForIntent: (intent, state) => {
        const n = dates.indexOf(intent.occurredAt.slice(0, 10));
        const price = prices[n]!;
        const cash = state.cash.CNY;
        const equity = D.from(cash.settled)
          .plus(cash.unsettled)
          .plus(D.from(state.position.quantity).times(price))
          .toString();
        return {
          rule:
            intent.side === 'buy'
              ? { type: 'percentOfEquity', percent: '0.2' }
              : { type: 'fixedQuantity', quantity: state.position.quantity },
          executionCurrency: 'CNY',
          currentQuantity: state.position.quantity,
          lotSize: '100',
          evaluationAt: intent.occurredAt,
          price: { value: price, occurredAt: intent.occurredAt, availableAt: intent.occurredAt },
          equity: {
            amount: equity,
            currency: 'CNY',
            occurredAt: intent.occurredAt,
            availableAt: intent.occurredAt,
          },
        };
      },
    },
  });
}

it('实际账本每日目标差额能减仓和再增仓；下一开盘跳空受实际投入上限缩量', () => {
  const baseline = execute(),
    jump = execute({ jump: true });
  expect(baseline.fills.length, JSON.stringify(baseline.tradePlan)).toBeGreaterThan(0);
  expect(baseline.fills[0]).toMatchObject({
    side: 'buy',
    quantity: '200',
    price: '10',
    occurredAt: '2026-09-04T01:30:00.000Z',
  });
  expect(jump.fills[0]).toMatchObject({ side: 'buy', quantity: '100', price: '15' });
  expect(jump.fills.slice(0, 3).map((fill) => fill.side)).toEqual(['buy', 'sell', 'buy']);
  expect(jump.fills.every((fill) => Number(fill.quantity) % 100 === 0)).toBe(true);
  const facts = (fills: typeof jump.fills) =>
    fills.map((fill) => [
      fill.side,
      fill.quantity,
      fill.price,
      fill.occurredAt,
      fill.reason,
      fill.charges,
    ]);
  expect(facts(execute({ jump: true, duplicate: true }).fills)).toEqual(facts(jump.fills));
  expect(execute({ jump: true }).fills).toEqual(jump.fills);
});
it('已有动态保护或普通退出优先于主动调仓，零波动不从普通20%仓位补单', () => {
  const protectedRun = execute({ jump: true, stop: true });
  expect(protectedRun.fills[1]?.reason).toBe('risk');
  const ordinary = execute({ ordinaryExit: true });
  expect(ordinary.signals.find((signal) => signal.kind === 'exit')?.reason).not.toBe(
    '每日目标波动率调仓',
  );
  const zero = execute({ zero: true });
  expect(zero.fills).toEqual([]);
  expect(zero.tradePlan?.diagnostics.join()).toContain('VOLATILITY_NON_POSITIVE');
});
it('受可售持仓约束的拒单不算成交；后续收盘重算再按T+2真实卖出', () => {
  const result = execute({ jump: true, tPlusTwo: true });
  expect(result.rejects.length).toBeGreaterThan(0);
  expect(result.fills[1]).toMatchObject({ side: 'sell', occurredAt: '2026-09-08T01:30:00.000Z' });
  expect(result.fills[1]?.quantity).toBe(result.fills[0]?.quantity);
});
