import { alignSeriesAt, type BacktestSeries, type BacktestSeriesPoint } from './backtest-series.js';
import { type BooleanExpression, type NumericExpression } from './backtest-v2.js';
import { DecimalValue } from './decimal.js';
import type {
  AvailableEvaluation,
  BooleanEvaluation,
  NumericEvaluation,
  SimulationExpressionContext,
  UnavailableEvaluation,
} from './backtest-simulation.js';

const instant = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`无效时间: ${value}`);
  return parsed;
};

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
};

export const numericExpressionKey = (expression: NumericExpression) => stableSerialize(expression);

export const getSeries = (
  collection: ReadonlyMap<string, BacktestSeries> | Readonly<Record<string, BacktestSeries>> | undefined,
  sourceId: string,
) => {
  if (collection && typeof (collection as ReadonlyMap<string, BacktestSeries>).get === 'function') {
    return (collection as ReadonlyMap<string, BacktestSeries>).get(sourceId);
  }
  if (!collection) return undefined;
  return (collection as Readonly<Record<string, BacktestSeries>>)[sourceId];
};

const unavailable = (occurredAt: string, reason: string): UnavailableEvaluation => ({
  status: 'unavailable',
  occurredAt,
  reason,
});

const pointEvaluation = (point: BacktestSeriesPoint, occurredAt: string): NumericEvaluation => {
  if (point.value === undefined || point.status === 'unavailable') {
    return unavailable(occurredAt, point.reason ?? 'Series value unavailable');
  }
  return {
    status: 'available',
    value: point.value,
    occurredAt,
    availableAt: point.availableAt,
  };
};

const maxAvailableAt = (values: readonly AvailableEvaluation<unknown>[]) =>
  values.reduce(
    (latest, value) => (instant(value.availableAt) > instant(latest) ? value.availableAt : latest),
    values[0]?.availableAt ?? '1970-01-01T00:00:00.000Z',
  );

export const evaluateNumericExpression = (
  expression: NumericExpression,
  context: SimulationExpressionContext,
): NumericEvaluation => {
  const occurredAt = context.tick.occurredAt;
  if (expression.type === 'constant') {
    return { status: 'available', value: expression.value, occurredAt, availableAt: occurredAt };
  }
  if (expression.type === 'positionState') {
    const position = context.positionState;
    if (!position) return unavailable(occurredAt, 'PositionState unavailable');
    return {
      status: 'available',
      value: String(position[expression.field]),
      occurredAt,
      availableAt: position.availableAt,
    };
  }
  if (expression.type === 'series') {
    const series = getSeries(context.sourceSeries, expression.sourceId);
    if (!series) return unavailable(occurredAt, `未知 Source: ${expression.sourceId}`);
    const aligned = alignSeriesAt(series, [occurredAt])[0];
    return aligned?.point
      ? pointEvaluation(aligned.point, occurredAt)
      : unavailable(occurredAt, aligned?.reason ?? 'Series unavailable');
  }
  const indicatorSeries = getSeries(context.indicatorSeries, numericExpressionKey(expression));
  if (!indicatorSeries) return unavailable(occurredAt, `Indicator 尚未可用: ${expression.name}`);
  const aligned = alignSeriesAt(indicatorSeries, [occurredAt])[0];
  return aligned?.point
    ? pointEvaluation(aligned.point, occurredAt)
    : unavailable(occurredAt, aligned?.reason ?? 'Indicator unavailable');
};

const evaluateNumericBoolean = (
  expression: Extract<BooleanExpression, { type: 'compare' | 'cross' }>,
  context: SimulationExpressionContext,
): BooleanEvaluation => {
  const occurredAt = context.tick.occurredAt;
  const left = evaluateNumericExpression(expression.left, context);
  const right = evaluateNumericExpression(expression.right, context);
  if (left.status !== 'available' || right.status !== 'available') {
    return unavailable(occurredAt, '比较输入 unavailable');
  }
  if (expression.type === 'compare') {
    const comparison = DecimalValue.from(left.value).compareTo(right.value);
    let result: boolean;
    switch (expression.operator) {
      case 'eq': result = comparison === 0; break;
      case 'neq': result = comparison !== 0; break;
      case 'gt': result = comparison > 0; break;
      case 'gte': result = comparison >= 0; break;
      case 'lt': result = comparison < 0; break;
      case 'lte': result = comparison <= 0; break;
    }
    return { status: 'available', value: result, occurredAt, availableAt: maxAvailableAt([left, right]) };
  }
  const previousLeft = context.previousNumeric?.get(numericExpressionKey(expression.left));
  const previousRight = context.previousNumeric?.get(numericExpressionKey(expression.right));
  if (previousLeft?.status !== 'available' || previousRight?.status !== 'available') {
    return unavailable(occurredAt, 'cross 前一 evaluation unavailable');
  }
  const currentComparison = DecimalValue.from(left.value).compareTo(right.value);
  const previousComparison = DecimalValue.from(previousLeft.value).compareTo(previousRight.value);
  const crossed = expression.direction === 'above'
    ? previousComparison <= 0 && currentComparison > 0
    : previousComparison >= 0 && currentComparison < 0;
  return {
    status: 'available',
    value: crossed,
    occurredAt,
    availableAt: maxAvailableAt([left, right, previousLeft, previousRight]),
  };
};

export const evaluateBooleanExpression = (
  expression: BooleanExpression,
  context: SimulationExpressionContext,
): BooleanEvaluation => {
  const occurredAt = context.tick.occurredAt;
  if (expression.type === 'positionState') {
    const position = context.positionState;
    if (!position) return unavailable(occurredAt, 'PositionState unavailable');
    return { status: 'available', value: position.isOpen, occurredAt, availableAt: position.availableAt };
  }
  if (expression.type === 'not') {
    const value = evaluateBooleanExpression(expression.expression, context);
    return value.status === 'available' ? { ...value, value: !value.value } : value;
  }
  if (expression.type === 'all' || expression.type === 'any') {
    const values = expression.conditions.map((condition) => evaluateBooleanExpression(condition, context));
    const unavailableValue = values.find((value) => value.status === 'unavailable');
    if (unavailableValue) return unavailableValue;
    const availableValues = values as AvailableEvaluation<boolean>[];
    const booleans = availableValues.map((value) => value.value);
    const result = expression.type === 'all' ? booleans.every(Boolean) : booleans.some(Boolean);
    return { status: 'available', value: result, occurredAt, availableAt: maxAvailableAt(availableValues) };
  }
  return evaluateNumericBoolean(expression, context);
};
