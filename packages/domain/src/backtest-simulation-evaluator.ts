import { alignSeriesAt, type BacktestSeries, type BacktestSeriesPoint } from './backtest-series.js';
import { type BooleanExpression, type NumericExpression } from './backtest-contract.js';
import { DecimalValue } from './decimal.js';
import {
  mergeBacktestAvailability,
  isAvailableForDecisionAt,
} from './backtest-observation-clock.js';
import { evaluateCorporateActionSignal } from './backtest-event-signal.js';
import { evaluateScalarOperation, isScalarOperation } from './backtest-numeric-operations.js';
import { latestExpressionObservation } from './backtest-expression-observations.js';
import type {
  AvailableEvaluation,
  BooleanEvaluation,
  NumericEvaluation,
  SimulationExpressionContext,
  UnavailableEvaluation,
} from './backtest-simulation.js';

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
};

export const numericExpressionKey = (expression: NumericExpression | BooleanExpression) =>
  stableSerialize(expression);

export const sourceSeriesKey = (sourceId: string, field: BacktestSeries['field']) =>
  `${sourceId}:${field}`;

export const getSeries = (
  collection:
    ReadonlyMap<string, BacktestSeries> | Readonly<Record<string, BacktestSeries>> | undefined,
  sourceId: string,
  field?: BacktestSeries['field'],
) => {
  if (collection && typeof (collection as ReadonlyMap<string, BacktestSeries>).get === 'function') {
    const values = collection as ReadonlyMap<string, BacktestSeries>;
    const exact = field === undefined ? undefined : values.get(sourceSeriesKey(sourceId, field));
    if (exact) return exact;
    const legacy = values.get(sourceId);
    return field === undefined || legacy?.field === field ? legacy : undefined;
  }
  if (!collection) return undefined;
  const values = collection as Readonly<Record<string, BacktestSeries>>;
  const exact = field === undefined ? undefined : values[sourceSeriesKey(sourceId, field)];
  if (exact) return exact;
  const legacy = values[sourceId];
  return field === undefined || legacy?.field === field ? legacy : undefined;
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
    ...(point.researchClock ? { researchClock: point.researchClock } : {}),
  };
};

const corporateActionEventType = (expression: BooleanExpression): string | undefined => {
  const candidate = expression as unknown as { type?: unknown; eventType?: unknown };
  if (candidate.type !== 'corporateActionEvent') return undefined;
  return typeof candidate.eventType === 'string' ? candidate.eventType : 'unknown';
};

export const evaluateNumericExpression = (
  expression: NumericExpression,
  context: SimulationExpressionContext,
  options: { strict?: boolean; materialize?: boolean } = {},
): NumericEvaluation => {
  const occurredAt = context.tick.occurredAt;
  if (expression.type === 'eventValue')
    return context.eventValue ?? unavailable(occurredAt, '当前事件没有冻结取值');
  if (isScalarOperation(expression))
    return evaluateScalarOperation(expression, occurredAt, (input) =>
      evaluateNumericExpression(input, context, { ...options, strict: true }),
    );
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
    const series = getSeries(context.sourceSeries, expression.sourceId, expression.field);
    if (!series) return unavailable(occurredAt, `未知 Source: ${expression.sourceId}`);
    if (options.strict) {
      const point = latestExpressionObservation(series, occurredAt);
      return point && (options.materialize || isAvailableForDecisionAt(point, occurredAt))
        ? pointEvaluation(point, occurredAt)
        : unavailable(occurredAt, '当前观测不可用');
    }
    const aligned = alignSeriesAt(series, [occurredAt])[0];
    return aligned?.point
      ? pointEvaluation(aligned.point, occurredAt)
      : unavailable(occurredAt, aligned?.reason ?? 'Series unavailable');
  }
  const indicatorSeries = getSeries(context.indicatorSeries, numericExpressionKey(expression));
  if (!indicatorSeries) return unavailable(occurredAt, '指标或会话数值尚未可用');
  if (
    options.strict ||
    ['lag', 'rolling', 'cumulative', 'countTrue', 'confirmedPivot'].includes(expression.type)
  ) {
    const point = latestExpressionObservation(indicatorSeries, occurredAt);
    return point && (options.materialize || isAvailableForDecisionAt(point, occurredAt))
      ? pointEvaluation(point, occurredAt)
      : unavailable(occurredAt, '历史或窗口观测不可用');
  }
  if (expression.type === 'sessionValue') {
    const point = indicatorSeries.points.find(
      (item) => Date.parse(item.occurredAt) === Date.parse(occurredAt),
    );
    return point && isAvailableForDecisionAt(point, occurredAt)
      ? pointEvaluation(point, occurredAt)
      : unavailable(occurredAt, '当前会话数值不可用');
  }
  const aligned = alignSeriesAt(indicatorSeries, [occurredAt])[0];
  return aligned?.point
    ? pointEvaluation(aligned.point, occurredAt)
    : unavailable(occurredAt, aligned?.reason ?? 'Indicator unavailable');
};

const evaluateNumericBoolean = (
  expression: Extract<BooleanExpression, { type: 'compare' | 'cross' }>,
  context: SimulationExpressionContext,
  options: { strict?: boolean; materialize?: boolean } = {},
): BooleanEvaluation => {
  const occurredAt = context.tick.occurredAt;
  const left = evaluateNumericExpression(expression.left, context, options);
  const right = evaluateNumericExpression(expression.right, context, options);
  if (left.status !== 'available') return left;
  if (right.status !== 'available') return right;
  if (expression.type === 'compare') {
    const comparison = DecimalValue.from(left.value).compareTo(right.value);
    let result: boolean;
    switch (expression.operator) {
      case 'eq':
        result = comparison === 0;
        break;
      case 'neq':
        result = comparison !== 0;
        break;
      case 'gt':
        result = comparison > 0;
        break;
      case 'gte':
        result = comparison >= 0;
        break;
      case 'lt':
        result = comparison < 0;
        break;
      case 'lte':
        result = comparison <= 0;
        break;
    }
    return {
      status: 'available',
      value: result,
      occurredAt,
      ...mergeBacktestAvailability([left, right]),
    };
  }
  const previousLeft = context.previousNumeric?.get(numericExpressionKey(expression.left));
  const previousRight = context.previousNumeric?.get(numericExpressionKey(expression.right));
  if (previousLeft?.status !== 'available' || previousRight?.status !== 'available') {
    return unavailable(occurredAt, 'cross 前一 evaluation unavailable');
  }
  const currentComparison = DecimalValue.from(left.value).compareTo(right.value);
  const previousComparison = DecimalValue.from(previousLeft.value).compareTo(previousRight.value);
  const crossed =
    expression.direction === 'above'
      ? previousComparison <= 0 && currentComparison > 0
      : previousComparison >= 0 && currentComparison < 0;
  return {
    status: 'available',
    value: crossed,
    occurredAt,
    ...mergeBacktestAvailability([left, right, previousLeft, previousRight]),
  };
};

export const evaluateBooleanExpression = (
  expression: BooleanExpression,
  context: SimulationExpressionContext,
  options: { strict?: boolean; materialize?: boolean } = {},
): BooleanEvaluation => {
  const occurredAt = context.tick.occurredAt;
  if (expression.type === 'consecutive' || expression.type === 'sequence') {
    const series = getSeries(context.indicatorSeries, numericExpressionKey(expression));
    const point = series ? latestExpressionObservation(series, occurredAt) : undefined;
    if (!point || (!options.materialize && !isAvailableForDecisionAt(point, occurredAt)))
      return unavailable(occurredAt, '连续确认窗口不可用');
    const value = pointEvaluation(point, occurredAt);
    return value.status === 'available' ? { ...value, value: value.value === '1' } : value;
  }
  const actionEventType = corporateActionEventType(expression);
  if (actionEventType !== undefined) {
    return evaluateCorporateActionSignal(actionEventType, context);
  }
  if (expression.type === 'positionState') {
    const position = context.positionState;
    if (!position) return unavailable(occurredAt, 'PositionState unavailable');
    return {
      status: 'available',
      value: position.isOpen,
      occurredAt,
      availableAt: position.availableAt,
    };
  }
  if (expression.type === 'not') {
    const value = evaluateBooleanExpression(expression.expression, context, options);
    return value.status === 'available' ? { ...value, value: !value.value } : value;
  }
  if (expression.type === 'all' || expression.type === 'any') {
    const values: BooleanEvaluation[] = [];
    const decisive = expression.type === 'any';
    for (const condition of expression.conditions) {
      const value = evaluateBooleanExpression(condition, context, options);
      if (value.status === 'available' && value.value === decisive &&
          isAvailableForDecisionAt(value, occurredAt)) return value;
      values.push(value);
    }
    const unavailableValue = values.find((value) => value.status === 'unavailable');
    if (unavailableValue) return unavailableValue;
    const availableValues = values as AvailableEvaluation<boolean>[];
    const booleans = availableValues.map((value) => value.value);
    const result = expression.type === 'all' ? booleans.every(Boolean) : booleans.some(Boolean);
    return {
      status: 'available',
      value: result,
      occurredAt,
      ...mergeBacktestAvailability(availableValues),
    };
  }
  if (expression.type === 'compare' || expression.type === 'cross') {
    return evaluateNumericBoolean(expression, context, options);
  }
  return unavailable(occurredAt, 'Boolean expression 的执行语义尚未实现');
};
