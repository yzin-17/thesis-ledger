import { expect, it } from 'vitest';
import { runDeterministicSimulation, type SimulationEngineInput } from '../src/index.js';

it('同一收盘时点先登记撮合成交再评估信号，沿原队列回放', () => {
  const at = '2026-05-18T20:00:00Z';
  const run = () => {
    let held = '0';
    const input: SimulationEngineInput = {
      runId: 'daily-test',
      strategy: {
        executionInstrument: { symbol: 'AAPL', market: 'US', assetType: 'stock' },
        primaryTimeframe: '1d',
        entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
        exit: {
          type: 'compare',
          operator: 'eq',
          left: { type: 'constant', value: '0' },
          right: { type: 'constant', value: '1' },
        },
      },
      ticks: [{ occurredAt: at, availableAt: at }],
      sourceSeries: {},
      positionStateAt: () => ({
        isOpen: held !== '0',
        quantity: held,
        averageCost: '100',
        holdingPeriods: 0,
        availableAt: at,
      }),
      execution: {
        phases: [{ key: 'day', phase: 'range', occurredAt: at, availableAt: at }],
        matchPhase: () => ({
          fills: [
            {
              fillId: 'daily-fill',
              orderId: 'daily-buy',
              executionSymbol: 'AAPL',
              side: 'buy',
              quantity: '1',
              price: '100',
              charges: [],
              occurredAt: at,
              availableAt: at,
              reason: 'signal',
            },
          ],
        }),
        applyMutation: (mutation) => {
          if (mutation.type === 'simulationFill') held = '1';
          return { accepted: true };
        },
      },
    };
    return runDeterministicSimulation(input);
  };
  const result = run();
  expect(result.fills).toHaveLength(1);
  expect(result.signals).toHaveLength(0);
  expect(result.events.findIndex((e) => e.type === 'simulationFill')).toBeLessThan(
    result.events.findIndex((e) => e.type === 'signalEvaluation'),
  );
  expect(run()).toEqual(result);
});
