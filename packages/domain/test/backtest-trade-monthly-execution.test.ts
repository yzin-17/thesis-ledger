import { expect, it } from 'vitest';
import { DecimalValue as D } from '../src/decimal.js';
import { runExchangeSimulation, SimulationLedger } from '../src/index.js';
import { tradingCalendarFromFact } from '../src/execution-rules.js';
import {
  exchangeRunInput,
  exchangeRules,
  exchangeBar,
  sourceSeries,
  frozenExchangeExecutionModel,
} from './backtest-simulation.fixtures.js';

const dates: string[] = [];
for (
  const cursor = new Date('2026-09-01T00:00:00Z');
  cursor <= new Date('2026-12-02T00:00:00Z');
  cursor.setUTCDate(cursor.getUTCDate() + 1)
) {
  if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6)
    dates.push(cursor.toISOString().slice(0, 10));
}
const at = (date: string) => date + 'T07:00:00.000Z';
function execute(
  options: {
    jump?: boolean;
    rejectFirst?: boolean;
    duplicate?: boolean;
    stop?: boolean;
    ordinaryExit?: boolean;
    missingCalendar?: boolean;
  } = {},
) {
  const input = exchangeRunInput();
  const prices = dates.map((date) => {
    if (date >= '2026-11-30' || (date >= '2026-11-15' && !options.stop)) return '5';
    if (date >= '2026-10-15') return '20';
    return '10';
  });
  const series = sourceSeries(
    dates.map((date, index) => ({
      occurredAt: at(date),
      availableAt: at(date),
      value: prices[index]!,
      status: 'available',
    })),
  );
  const calendar = tradingCalendarFromFact({
    market: 'CN',
    timezone: 'Asia/Shanghai',
    provider: 'fixture',
    providerRevision: '1',
    availableAt: '2026-08-01T00:00:00Z',
    range: { start: '2026-09-01', end: '2026-12-31' },
    holidays: [],
    sessions: [{ startMinute: 570, endMinute: 900 }],
    sessionOverrides: [],
  });
  const model = frozenExchangeExecutionModel(0);
  model.scope.range = { start: dates[0]!, end: dates.at(-1)! };
  for (const segment of model.segments) segment.range = { ...model.scope.range };
  const ticks = dates.map((date) => ({ occurredAt: at(date), availableAt: at(date) }));
  if (options.duplicate) ticks.splice(23, 0, ticks[22]!);
  return runExchangeSimulation({
    ...input,
    ledger: new SimulationLedger({
      executionInstrument: {
        symbol: '600519.SH',
        market: 'CN',
        assetType: 'stock',
        currency: 'CNY',
      },
      baseCurrency: 'CNY',
      initialCash: { CNY: '100000' },
      accountingBasis: 'raw-events',
    }),
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
        tradePlan: {
          version: 1,
          evaluation: 'barClose',
          stages: [],
          monthlyRebalance: {
            targetEquityFraction: '0.3',
            deviationThreshold: '0.03',
            evaluation: 'lastTradingDayClose',
          },
          ...(options.stop ? { initialStop: { kind: 'percent', percent: '0.05' } as const } : {}),
        },
      },
      ticks,
      sourceSeries: new Map([['close', series]]),
    },
    exchange: {
      ...input.exchange,
      rules: exchangeRules(calendar),
      calendar,
      tradePlanPrices: series,
      ...(!options.missingCalendar
        ? { tradePlanCalendar: { calendar, availableAt: '2026-08-01T00:00:00Z' } }
        : {}),
      executionModel: model,
      dataAsOf: '2026-12-03T00:00:00Z',
      bars: dates.map((date, index) => {
        let open = prices[Math.max(0, index - 1)]!;
        if (date === '2026-10-01' && options.jump) open = '15';
        if (date === '2026-10-01' && options.rejectFirst) open = '10.001';
        return exchangeBar(date + 'T01:30:00.000Z', at(date), open, prices[index]!);
      }),
      sizingForIntent: (intent, state) => {
        const price = prices[dates.indexOf(intent.occurredAt.slice(0, 10))]!;
        const cash = state.cash.CNY;
        const equity = D.from(cash.settled)
          .plus(cash.unsettled)
          .plus(D.from(state.position.quantity).times(price))
          .toString();
        return {
          rule:
            intent.side === 'buy'
              ? { type: 'percentOfEquity', percent: '0.5' }
              : { type: 'fixedQuantity', quantity: state.position.quantity },
          executionCurrency: 'CNY',
          currentQuantity: state.position.quantity,
          lotSize: '100',
          evaluationAt: intent.occurredAt,
          price: { value: price, occurredAt: intent.occurredAt, availableAt: intent.availableAt },
          equity: {
            amount: equity,
            currency: 'CNY',
            occurredAt: intent.occurredAt,
            availableAt: intent.availableAt,
          },
        };
      },
    },
  });
}

it('真实账本月末冻结、次月开盘增减仓；重复与全量回放保持经济结果', () => {
  const result = execute();
  expect(
    result.fills.map((fill) => [fill.side, fill.occurredAt.slice(0, 10)]),
    JSON.stringify({ signals: result.signals, rejects: result.rejects, plan: result.tradePlan }),
  ).toEqual([
    ['buy', '2026-10-01'],
    ['sell', '2026-11-02'],
    ['buy', '2026-12-01'],
  ]);
  expect(result.fills[0]?.quantity).toBe('3000');
  expect(execute().fills).toEqual(result.fills);
  const economic = (fills: typeof result.fills) =>
    fills.map((fill) => [fill.side, fill.quantity, fill.price, fill.occurredAt, fill.charges]);
  expect(economic(execute({ duplicate: true }).fills)).toEqual(economic(result.fills));
  expect(execute({ jump: true }).fills[0]).toMatchObject({ quantity: '2000', price: '15' });
});

it('拒单当月不补做，未知日历不回退普通50%仓位；已有保护与普通退出优先', () => {
  const rejected = execute({ rejectFirst: true });
  expect(rejected.rejects.length).toBeGreaterThan(0);
  expect(rejected.fills[0]?.occurredAt.slice(0, 10)).toBe('2026-11-02');
  const missing = execute({ missingCalendar: true });
  expect(missing.fills).toEqual([]);
  expect(missing.tradePlan?.diagnostics.join()).toContain('CALENDAR_MISSING');
  const stopped = execute({ stop: true });
  expect(stopped.fills.at(-1)).toMatchObject({
    reason: 'risk',
    side: 'sell',
    occurredAt: '2026-12-01T01:30:00.000Z',
  });
  const ordinary = execute({ ordinaryExit: true });
  expect(ordinary.fills[1]?.occurredAt.slice(0, 10)).toBe('2026-10-02');
});
