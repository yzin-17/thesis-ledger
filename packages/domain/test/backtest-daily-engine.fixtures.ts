import type { ExchangeSimulationRunInput } from '../src/backtest-engine.js';
import {
  exchangeRunInput,
  exchangeBar,
  sourceSeries,
  strategy,
  frozenExchangeExecutionModel,
} from './backtest-simulation.fixtures.js';

export const daily = (date: string, open = '10', low = '9.4', high = '11') => ({
  ...exchangeBar(`${date}T01:30:00.000Z`, `${date}T07:00:00.000Z`, open, '10'),
  high,
  low,
  close: '10.5',
});
export function dailyInput(
  bars = [daily('2026-09-08'), daily('2026-09-09'), daily('2026-09-10')],
  settlement = 0,
): ExchangeSimulationRunInput {
  const input = exchangeRunInput(),
    executionModel = frozenExchangeExecutionModel(settlement);
  const points = bars.map((bar) => ({
    occurredAt: bar.occurredAt,
    availableAt: bar.availableAt,
    status: 'available' as const,
    value: bar.close,
  }));
  return {
    ...input,
    simulation: {
      ...input.simulation,
      strategy: strategy(),
      ticks: points.map((point) => ({ ...point, timeframe: '1d' })),
      sourceSeries: new Map([['close', sourceSeries(points)]]),
    },
    exchange: {
      ...input.exchange,
      bars,
      executionModel,
      dataAsOf: '2026-09-11T00:00:00.000Z',
      dailyOrders: {
        execution: {
          mode: 'exchange',
          timing: 'dailyBarOrders',
          orders: [
            {
              id: 'buy',
              action: { kind: 'entry' },
              order: { kind: 'limit', price: { type: 'constant', value: '9.5' } },
              validity: { kind: 'bars', bars: 2 },
            },
            {
              id: 'exit',
              action: { kind: 'exit' },
              order: { kind: 'market' },
              validity: { kind: 'DAY' },
            },
            {
              id: 'stop',
              action: { kind: 'stopLoss' },
              order: { kind: 'stopMarket', price: { type: 'constant', value: '9' } },
              validity: { kind: 'position' },
              parent: { templateId: 'buy', activation: 'eachFill' },
              exitGroup: 'protect',
            },
            {
              id: 'profit',
              action: { kind: 'takeProfit' },
              order: { kind: 'limit', price: { type: 'constant', value: '10.8' } },
              validity: { kind: 'position' },
              parent: { templateId: 'buy', activation: 'eachFill' },
              exitGroup: 'protect',
            },
          ],
        },
        matching: {
          conflict: 'stopFirst',
          childActivation: 'openSameBarRangeNextBar',
          partialExit: 'protectRemaining',
          liquidity: { kind: 'unlimited' },
        },
      },
    },
  };
}
