import { expect, it } from 'vitest';
import {
  evaluateNumericExpression,
  numericExpressionKey,
} from '../src/backtest-simulation-evaluator.js';
import type { NumericExpression } from '../src/backtest-strategy.js';
import type { BacktestSeries } from '../src/backtest-series.js';
import type { SimulationExpressionContext } from '../src/backtest-simulation.js';

it('不可用或缺少当前会话值时不回退到旧统计，避免缺量和跨日后继续发信号', () => {
  const expression: NumericExpression = { type: 'sessionValue', sourceId: 'main', field: 'vwap' };
  const series: BacktestSeries = {
    sourceId: numericExpressionKey(expression),
    symbol: 'AAPL.US',
    market: 'US',
    assetType: 'stock',
    field: 'close',
    timeframe: '1m',
    adjusted: false,
    points: [
      { occurredAt: '2026-07-01T13:31:00Z', availableAt: '2026-07-01T13:31:00Z', value: '100' },
      {
        occurredAt: '2026-07-01T13:32:00Z',
        availableAt: '2026-07-01T13:32:00Z',
        status: 'unavailable',
        reason: '缺量',
      },
    ],
  };
  const context = (at: string): SimulationExpressionContext => ({
    tick: { occurredAt: at, availableAt: at, tradingDate: at.slice(0, 10), timeframe: '1m' },
    sourceSeries: new Map(),
    indicatorSeries: new Map([[numericExpressionKey(expression), series]]),
  });
  expect(evaluateNumericExpression(expression, context('2026-07-01T13:31:00Z'))).toMatchObject({
    value: '100',
  });
  for (const at of ['2026-07-01T13:32:00Z', '2026-07-01T13:33:00Z', '2026-07-02T13:31:00Z']) {
    expect(evaluateNumericExpression(expression, context(at))).toMatchObject({
      status: 'unavailable',
    });
  }
});
