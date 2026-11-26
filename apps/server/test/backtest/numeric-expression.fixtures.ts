import { readFileSync } from 'node:fs';
import {
  type BacktestSeries,
  type BacktestSeriesPoint,
  type NumericExpression,
  type BooleanExpression,
} from '@thesis-ledger/domain';
import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { buildPointInTimeIndicatorSeries } from '../../src/backtest/backtest-adjusted-indicators.js';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/schemas/fixtures/strategy-authoring.exchange.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const seed = {
  ...fixture,
  schemaVersion: 'strategy-definition-v1',
  signalSources: fixture.signalSources.map((source: Record<string, unknown>) => ({
    ...source,
    priceCoordinate: 'actual',
  })),
};
export const at = (index: number) => new Date(Date.UTC(2026, 2, 2 + index * 2, 7)).toISOString();
export const series = (field: 'high' | 'low' | 'close' | 'open' | 'volume'): NumericExpression => ({
  type: 'series',
  sourceId: 'primary',
  field,
});
export const constant = (value: string): NumericExpression => ({ type: 'constant', value });
export const highest: NumericExpression = {
  type: 'indicator',
  name: 'Highest',
  input: series('high'),
  params: { period: 20 },
};
export const priorHighest: NumericExpression = { type: 'lag', periods: 1, input: highest };
export const breakout: BooleanExpression = {
  type: 'compare',
  operator: 'gt',
  left: series('close'),
  right: priorHighest,
};
export const definition = (entry: BooleanExpression) =>
  strategySchema.parse({ ...seed, entry }) as BacktestStrategy;
export const inputPoints = (count: number): BacktestSeriesPoint[] =>
  Array.from({ length: count }, (_, index) => ({
    occurredAt: at(index),
    availableAt: at(index),
    value: '100',
    high: '100',
    close: '100',
    status: 'available',
  }));

export function context(
  expression: NumericExpression | BooleanExpression,
  points: BacktestSeriesPoint[],
  close = '105',
  overrides: Partial<
    Record<'high' | 'low' | 'close' | 'open' | 'volume', readonly BacktestSeriesPoint[]>
  > = {},
) {
  const sources = new Map<string, BacktestSeries>();
  for (const field of ['high', 'low', 'close', 'open', 'volume'] as const)
    sources.set(`primary:${field}`, {
      sourceId: 'primary',
      symbol: '510300.SH',
      market: 'CN',
      assetType: 'etf',
      field,
      timeframe: '1d',
      adjusted: false,
      points:
        overrides[field] ??
        points.map((point, index) =>
          field === 'close' && index === points.length - 1
            ? { ...point, value: close }
            : { ...point },
        ),
    });
  const ticks = points.map((point) => ({
    occurredAt: point.occurredAt,
    availableAt: point.occurredAt,
  }));
  return {
    tick: ticks.at(-1)!,
    sourceSeries: sources,
    indicatorSeries: buildPointInTimeIndicatorSeries({
      expressions: [expression],
      sourceSeries: sources,
      corporateActions: [],
      ticks,
    }),
  };
}
