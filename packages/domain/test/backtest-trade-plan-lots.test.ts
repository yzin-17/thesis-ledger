import { expect, it } from 'vitest';
import { runExchangeSimulation, type BacktestTradePlan } from '../src/index.js';
import {
  exchangeRunInput,
  exchangeBar,
  sourceSeries,
  compare,
  frozenExchangeExecutionModel,
} from './backtest-simulation.fixtures.js';

it('原始股数阶段按手数冻结：零手不阻塞，半手余量不重复拒单，下一阶段仍执行', () => {
  const at = (n: number) => new Date(Date.UTC(2026, 8, 8, 1, 35 + n * 10)).toISOString();
  const values = ['10', '10', '11', '12', '12', '12'];
  const series = {
    ...sourceSeries(
      values.map((value, n) => ({
        occurredAt: at(n),
        availableAt: at(n),
        value,
        status: 'available' as const,
      })),
    ),
    timeframe: '5m' as const,
  };
  const plan: BacktestTradePlan = {
    version: 1,
    evaluation: 'barClose',
    stages: [
      {
        id: 'too-small',
        trigger: { kind: 'gainPercent', value: '0.08' },
        action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.25' },
      },
      {
        id: 'initial-half',
        trigger: { kind: 'gainPercent', value: '0.08' },
        action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.5' },
      },
      {
        id: 'remaining-half',
        trigger: { kind: 'gainPercent', value: '0.15' },
        action: { kind: 'reduce', basis: 'remainingQuantity', fraction: '0.5' },
      },
    ],
  };
  const run = () => {
    const input = exchangeRunInput();
    return runExchangeSimulation({
      ...input,
      simulation: {
        ...input.simulation,
        strategy: { ...input.simulation.strategy, entry: compare('gt', '0'), tradePlan: plan },
        ticks: values.map((_, n) => ({
          occurredAt: at(n),
          availableAt: at(n),
          timeframe: '5m' as const,
        })),
        sourceSeries: new Map([['close', series]]),
      },
      exchange: {
        ...input.exchange,
        tradePlanPrices: series,
        sizingForIntent: (intent, state) => ({
          ...input.exchange.sizingForIntent(intent, state),
          rule: {
            type: 'fixedQuantity',
            quantity: intent.side === 'buy' ? '300' : state.position.quantity,
          },
        }),
        bars: values.map((v, n) =>
          exchangeBar(
            new Date(Date.parse(at(n)) - 300000).toISOString(),
            at(n),
            v,
            values[Math.max(0, n - 1)]!,
          ),
        ),
        executionModel: frozenExchangeExecutionModel(0),
        dataAsOf: '2026-09-09T00:00:00.000Z',
      },
    });
  };
  const result = run();
  expect(result.fills.map((f) => [f.side, f.quantity, f.price])).toEqual([
    ['buy', '300', '10'],
    ['sell', '100', '12'],
    ['sell', '100', '12'],
  ]);
  expect(result.rejects).toEqual([]);
  expect(result.tradePlan!.memory.stageTargets).toEqual({
    'too-small': '0',
    'initial-half': '100',
    'remaining-half': '100',
  });
  expect(result.ledger.position.quantity).toBe('100');
  expect(run()).toEqual(result);
});
