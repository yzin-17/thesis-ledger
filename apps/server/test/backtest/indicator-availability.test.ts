import { describe, expect, it } from 'vitest';
import {
  numericExpressionKey,
  type BacktestSeries,
  type NumericExpression,
} from '@thesis-ledger/domain';
import { buildPointInTimeIndicatorSeries } from '../../src/backtest/backtest-adjusted-indicators.js';

describe('真实 Server 指标消费者的时钟', () => {
  const source = (values: number[]): BacktestSeries => ({
    sourceId: 'execution',
    symbol: 'TEST',
    market: 'CN',
    assetType: 'stock',
    field: 'close',
    timeframe: '1d',
    adjusted: false,
    points: values.map((value, index) => ({
      occurredAt: `2025-01-0${index + 1}T00:00:00Z`,
      availableAt: index === 0 ? '2025-01-10T00:00:00Z' : `2025-01-0${index + 1}T00:00:00Z`,
      value: String(value),
      close: String(value),
      high: String(value + 1),
      low: String(value - 1),
      status: 'available',
    })),
  });
  const expression = (name: 'RSI' | 'ATR' | 'EMA', period: number): NumericExpression => ({
    type: 'indicator',
    name,
    params: { period },
    input: { type: 'series', sourceId: 'execution', field: 'close' },
  });

  it.each(['RSI', 'EMA'] as const)('%s 不因批量预计算提前放行延迟种子', (name) => {
    const series = source([100, 90, 91, 92, 93]);
    const expr = expression(name, 2);
    const ticks = [...series.points, { occurredAt: '2025-01-10T00:00:00Z' }];
    const result = buildPointInTimeIndicatorSeries({
      expressions: [expr],
      sourceSeries: new Map([['execution:close', series]]),
      corporateActions: [],
      ticks: ticks.map((point) => ({
        occurredAt: point.occurredAt,
        availableAt: point.occurredAt,
      })),
    });
    expect(result.get(numericExpressionKey(expr))!.points[4]!.status).toBe('unavailable');
  });

  it('ATR 实际消费前收时钟，逐 tick 与整段计算一致', () => {
    const series = source([100, 11]);
    const expr = expression('ATR', 1);
    const tick = series.points.at(-1)!;
    for (const prefix of [series.points, [tick]]) {
      const ticks = [...prefix, { occurredAt: '2025-01-10T00:00:00Z' }];
      const result = buildPointInTimeIndicatorSeries({
        expressions: [expr],
        sourceSeries: new Map([['execution:close', series]]),
        corporateActions: [],
        ticks: ticks.map((point) => ({
          occurredAt: point.occurredAt,
          availableAt: point.occurredAt,
        })),
      });
      expect(result.get(numericExpressionKey(expr))!.points.at(-2)!.status).toBe('unavailable');
    }
  });
});
