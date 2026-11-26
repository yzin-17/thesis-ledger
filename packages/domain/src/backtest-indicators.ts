import { DecimalValue } from './decimal.js';
import { directionalIndicatorSteps } from './backtest-directional-indicator.js';
import { finishBacktestComputation, mapBacktestComputationItems } from './backtest-computation.js';
import type { BacktestTradePlan } from './backtest-trade-plan-contract.js';
import { tradePlanProtectionRules } from './backtest-trade-protection.js';
import { mergeBacktestAvailability } from './backtest-observation-clock.js';
import {
  type BacktestSeriesPoint,
  type BacktestSeries,
  splitWarmup,
  type WarmupResult,
} from './backtest-series.js';
import {
  type BooleanExpression,
  type Expression,
  type NumericExpression,
} from './backtest-contract.js';

export type BacktestIndicatorName =
  'MA' | 'EMA' | 'RSI' | 'MACD' | 'ATR' | 'VWAP' | 'Highest' | 'Lowest' | 'ADX';
export type BacktestIndicatorOutput =
  'value' | 'macd' | 'signal' | 'histogram' | 'adx' | 'plusDI' | 'minusDI';

export interface IndicatorPoint extends BacktestSeriesPoint {
  value?: string;
  status: 'available' | 'unavailable';
}

export interface IndicatorResult {
  name: BacktestIndicatorName;
  output: BacktestIndicatorOutput;
  period: number;
  requiredLookback: number;
  points: readonly IndicatorPoint[];
}

export interface EvaluateIndicatorOptions {
  output?: BacktestIndicatorOutput;
  startDate?: string;
}

const DIVISION_SCALE = 20;
const dateValue = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`无效时间: ${value}`);
  return parsed;
};

const periodValue = (params: Record<string, number | string>, name: string) => {
  const raw = params[name];
  const period = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(period) || period <= 0) throw new Error(`${name} 必须是正整数`);
  return period;
};

const unavailable = (point: BacktestSeriesPoint, reason: string): IndicatorPoint => {
  const rest = { ...point };
  delete rest.value;
  delete rest.status;
  delete rest.reason;
  return { ...rest, status: 'unavailable', reason };
};

const available = (
  point: BacktestSeriesPoint,
  value: DecimalValue,
  inputs: readonly BacktestSeriesPoint[],
): IndicatorPoint => {
  const rest = { ...point };
  delete rest.reason;
  return {
    ...rest,
    value: stableOutput(value).toString(),
    status: 'available',
    ...mergeBacktestAvailability(inputs.length > 0 ? inputs : [point]),
  };
};

const numeric = (point: BacktestSeriesPoint) =>
  point.status === 'unavailable' || point.value === undefined
    ? undefined
    : DecimalValue.from(point.value);

const absolute = (value: DecimalValue) => (value.isNegative() ? value.times('-1') : value);

const contiguousWindow = (points: readonly BacktestSeriesPoint[], index: number, size: number) => {
  const window = points.slice(index - size + 1, index + 1);
  return window.length === size && window.every((point) => numeric(point) !== undefined)
    ? window
    : undefined;
};

const sum = (values: readonly DecimalValue[]) =>
  values.reduce((total, value) => total.plus(value), DecimalValue.from('0'));

const average = (values: readonly DecimalValue[]) =>
  sum(values).dividedBy(String(values.length), DIVISION_SCALE);

const stableOutput = (value: DecimalValue) => {
  const rendered = value.toString();
  const [integer, fraction] = rendered.split('.');
  if (!fraction || fraction.length <= DIVISION_SCALE) return value;
  return DecimalValue.from(`${integer}.${fraction.slice(0, DIVISION_SCALE)}`);
};

function* rolling(
  points: readonly BacktestSeriesPoint[],
  period: number,
  operation: (values: readonly DecimalValue[]) => DecimalValue,
): Generator<void, IndicatorPoint[], void> {
  return yield* mapBacktestComputationItems(points, (point, index) => {
    const window = contiguousWindow(points, index, period);
    if (!window) return unavailable(point, `warmup 或输入缺失：需要连续 ${period} 个值`);
    return available(point, operation(window.map((item) => numeric(item)!)), window);
  });
}

function* ema(points: readonly BacktestSeriesPoint[], period: number): Generator<void, IndicatorPoint[], void> {
  const alpha = DecimalValue.from('2').dividedBy(String(period + 1), DIVISION_SCALE);
  const output: IndicatorPoint[] = yield* mapBacktestComputationItems(points, (point) =>
    unavailable(point, `warmup：需要 ${period} 个值`),
  );
  let previous: IndicatorPoint | undefined;
  for (let index = 0; index < points.length; index += 1) {
    yield;
    const window = contiguousWindow(points, index, period);
    if (!window) {
      previous = undefined;
      output[index] = unavailable(points[index]!, `warmup 或输入缺失：需要连续 ${period} 个值`);
      continue;
    }
    const current = numeric(points[index]!);
    if (!current) {
      previous = undefined;
      output[index] = unavailable(points[index]!, '输入值 unavailable');
      continue;
    }
    const value = previous
      ? current
          .times(alpha)
          .plus(DecimalValue.from(previous.value!).times(DecimalValue.from('1').minus(alpha)))
      : average(window.map((item) => numeric(item)!));
    output[index] = available(
      points[index]!,
      value,
      previous ? [points[index]!, previous] : window,
    );
    previous = output[index];
  }
  return output;
}

function* rsi(points: readonly BacktestSeriesPoint[], period: number): Generator<void, IndicatorPoint[], void> {
  const output: IndicatorPoint[] = yield* mapBacktestComputationItems(points, (point) =>
    unavailable(point, `warmup：需要 ${period + 1} 个值`),
  );
  let averageGain: DecimalValue | undefined;
  let averageLoss: DecimalValue | undefined;
  let previous: IndicatorPoint | undefined;
  for (let index = 0; index < points.length; index += 1) {
    yield;
    const window = points.slice(index - period, index + 1);
    if (window.length !== period + 1 || window.some((point) => numeric(point) === undefined)) {
      averageGain = undefined;
      averageLoss = undefined;
      previous = undefined;
      output[index] = unavailable(points[index]!, `warmup 或输入缺失：需要连续 ${period + 1} 个值`);
      continue;
    }
    const changes = window
      .slice(1)
      .map((point, offset) => numeric(point)!.minus(numeric(window[offset]!)!));
    const gains = changes.map((change) => (change.isPositive() ? change : DecimalValue.from('0')));
    const losses = changes.map((change) =>
      change.isNegative() ? change.times('-1') : DecimalValue.from('0'),
    );
    averageGain = averageGain
      ? averageGain
          .times(String(period - 1))
          .plus(gains.at(-1)!)
          .dividedBy(String(period), DIVISION_SCALE)
      : average(gains);
    averageLoss = averageLoss
      ? averageLoss
          .times(String(period - 1))
          .plus(losses.at(-1)!)
          .dividedBy(String(period), DIVISION_SCALE)
      : average(losses);
    const value = averageLoss.isZero()
      ? DecimalValue.from('100')
      : DecimalValue.from('100').minus(
          DecimalValue.from('100').dividedBy(
            DecimalValue.from('1').plus(averageGain.dividedBy(averageLoss, DIVISION_SCALE)),
            DIVISION_SCALE,
          ),
        );
    output[index] = available(
      points[index]!,
      value,
      previous && period > 1 ? [previous, points[index - 1]!, points[index]!] : window,
    );
    previous = output[index];
  }
  return output;
}

const trueRange = (points: readonly BacktestSeriesPoint[], index: number) => {
  const point = points[index]!;
  if (point.status === 'unavailable') return undefined;
  try {
    const high = point.high ? DecimalValue.from(point.high) : numeric(point);
    const low = point.low ? DecimalValue.from(point.low) : numeric(point);
    const close = point.close ? DecimalValue.from(point.close) : numeric(point);
    if (!high || !low || !close) return undefined;
    if (high.isNegative() || low.isNegative() || close.isNegative() || high.compareTo(low) < 0)
      return undefined;
    if (index === 0) return high.minus(low);
    const previous = points[index - 1]!;
    if (previous.status === 'unavailable') return undefined;
    const previousClose = previous.close ? DecimalValue.from(previous.close) : numeric(previous);
    if (!previousClose || previousClose.isNegative()) return undefined;
    const highLow = high.minus(low);
    const highPrevious = absolute(high.minus(previousClose));
    const lowPrevious = absolute(low.minus(previousClose));
    return [highLow, highPrevious, lowPrevious].sort((left, right) => right.compareTo(left))[0]!;
  } catch {
    return undefined;
  }
};

function* atr(points: readonly BacktestSeriesPoint[], period: number): Generator<void, IndicatorPoint[], void> {
  const ranges = yield* mapBacktestComputationItems(points, (point, index) => {
    const value = trueRange(points, index);
    return value
      ? {
          ...point,
          value: value.toString(),
          status: 'available' as const,
          ...mergeBacktestAvailability(index === 0 ? [point] : [points[index - 1]!, point]),
        }
      : unavailable(point, 'OHLC 输入 unavailable');
  });
  return yield* rolling(ranges, period, average);
}

function* vwap(points: readonly BacktestSeriesPoint[], period: number): Generator<void, IndicatorPoint[], void> {
  return yield* mapBacktestComputationItems(points, (point, index) => {
    const window = contiguousWindow(points, index, period);
    if (!window || window.some((item) => !item.volume)) {
      return unavailable(point, `warmup 或 volume 缺失：需要连续 ${period} 个值`);
    }
    const totalVolume = sum(window.map((item) => DecimalValue.from(item.volume!)));
    if (totalVolume.isZero()) return unavailable(point, 'VWAP volume 不能为零');
    const totalValue = sum(window.map((item) => numeric(item)!.times(item.volume!)));
    return available(point, totalValue.dividedBy(totalVolume, DIVISION_SCALE), window);
  });
}

function* macd(
  points: readonly BacktestSeriesPoint[],
  params: Record<string, number | string>,
  output: Exclude<BacktestIndicatorOutput, 'value'>,
): Generator<void, IndicatorPoint[], void> {
  const fastPeriod = periodValue(params, 'fastPeriod');
  const slowPeriod = periodValue(params, 'slowPeriod');
  const signalPeriod = periodValue(params, 'signalPeriod');
  if (fastPeriod >= slowPeriod) throw new Error('MACD fastPeriod 必须小于 slowPeriod');
  const fast = yield* ema(points, fastPeriod);
  const slow = yield* ema(points, slowPeriod);
  const line: IndicatorPoint[] = yield* mapBacktestComputationItems(points, (point, index) => {
    const fastPoint = fast[index];
    const slowPoint = slow[index];
    if (fastPoint?.status !== 'available' || slowPoint?.status !== 'available') {
      return unavailable(point, `warmup：需要 ${slowPeriod} 个值`);
    }
    return available(point, DecimalValue.from(fastPoint.value!).minus(slowPoint.value!), [
      fastPoint,
      slowPoint,
    ]);
  });
  const signal = yield* ema(line, signalPeriod);
  return yield* mapBacktestComputationItems(points, (point, index) => {
    const linePoint = line[index]!;
    const signalPoint = signal[index]!;
    if (linePoint.status !== 'available' || signalPoint.status !== 'available') {
      return unavailable(point, `warmup：需要 ${slowPeriod + signalPeriod - 1} 个值`);
    }
    let value: DecimalValue;
    if (output === 'macd') {
      value = DecimalValue.from(linePoint.value!);
    } else if (output === 'signal') {
      value = DecimalValue.from(signalPoint.value!);
    } else {
      value = DecimalValue.from(linePoint.value!).minus(signalPoint.value!);
    }
    return available(point, value, [linePoint, signalPoint]);
  });
};

const requiredIndicatorLookback = (
  name: BacktestIndicatorName,
  period: number,
  params: Record<string, number | string>,
) => {
  if (name === 'RSI' || name === 'ATR') return period + 1;
  if (name === 'MACD')
    return periodValue(params, 'slowPeriod') + periodValue(params, 'signalPeriod') - 1;
  return period;
};

export const indicatorRequiredLookback = (
  name: BacktestIndicatorName,
  params: Record<string, number | string>,
) => {
  if (name === 'ADX') return periodValue(params, 'period') * 2;
  if (name === 'MACD') return requiredIndicatorLookback(name, 1, params);
  return requiredIndicatorLookback(name, periodValue(params, 'period'), params);
};

export function* evaluateIndicatorSteps(
  name: BacktestIndicatorName,
  points: readonly BacktestSeriesPoint[],
  params: Record<string, number | string>,
  options: EvaluateIndicatorOptions = {},
): Generator<void, IndicatorResult, void> {
  const ordered = [...points].sort(
    (left, right) => dateValue(left.occurredAt) - dateValue(right.occurredAt),
  );
  const period =
    name === 'MACD' ? periodValue(params, 'slowPeriod') : periodValue(params, 'period');
  const output = options.output ?? 'value';
  let values: IndicatorPoint[];
  switch (name) {
    case 'ADX':
      values = yield* mapBacktestComputationItems(yield* directionalIndicatorSteps(
        ordered,
        period,
        output === 'plusDI' || output === 'minusDI' ? output : 'adx',
      ), (point) => ({ ...point, status: point.status ?? 'unavailable' }));
      break;
    case 'MA':
      values = yield* rolling(ordered, period, average);
      break;
    case 'EMA':
      values = yield* ema(ordered, period);
      break;
    case 'RSI':
      values = yield* rsi(ordered, period);
      break;
    case 'ATR':
      values = yield* atr(ordered, period);
      break;
    case 'VWAP':
      values = yield* vwap(ordered, period);
      break;
    case 'Highest':
      values = yield* rolling(ordered, period, (items) =>
        items.reduce((highest, item) => (highest.compareTo(item) >= 0 ? highest : item)),
      );
      break;
    case 'Lowest':
      values = yield* rolling(ordered, period, (items) =>
        items.reduce((lowest, item) => (lowest.compareTo(item) <= 0 ? lowest : item)),
      );
      break;
    case 'MACD': {
      const selectedOutput = output === 'value' ? 'macd' : output;
      values = yield* macd(ordered, params, selectedOutput);
      break;
    }
  }
  return {
    name,
    output,
    period,
    requiredLookback: indicatorRequiredLookback(name, params),
    points: options.startDate
      ? values.filter((point) => dateValue(point.occurredAt) >= dateValue(options.startDate!))
      : values,
  };
}

export const evaluateIndicator = (...input: Parameters<typeof evaluateIndicatorSteps>) => finishBacktestComputation(evaluateIndicatorSteps(...input));

export const evaluateIndicatorWithWarmup = (
  name: BacktestIndicatorName,
  series: BacktestSeries,
  params: Record<string, number | string>,
  startDate: string,
  options: Omit<EvaluateIndicatorOptions, 'startDate'> = {},
): WarmupResult & { indicator: IndicatorResult } => {
  const requiredLookback = indicatorRequiredLookback(name, params);
  const warmup = splitWarmup(series.points, startDate, requiredLookback);
  const indicator = evaluateIndicator(name, series.points, params, { ...options, startDate });
  return { ...warmup, outputPoints: indicator.points, indicator };
};

const expressionLookback = (expression: Expression): number => {
  if (expression.type === 'confirmedPivot')
    return (
      Math.max(
        expressionLookback(expression.input),
        expression.sample ? expressionLookback(expression.sample) : 1,
      ) +
      expression.leftBars +
      expression.rightBars +
      expression.offset * (expression.leftBars + 1)
    );
  if (expression.type === 'eventValue') return 1;
  if (expression.type === 'sequence')
    return (
      Math.max(
        temporalConditionLookback(expression.trigger),
        temporalConditionLookback(expression.confirm),
        temporalConditionLookback(expression.invalidation),
        expression.capture ? expressionLookback(expression.capture) : 1,
      ) + expression.within
    );
  if (expression.type === 'countTrue' || expression.type === 'consecutive')
    return temporalConditionLookback(expression.condition) + expression.periods - 1;
  if (expression.type === 'rolling')
    return expressionLookback(expression.input) + expression.periods - 1;
  if (expression.type === 'cumulative') return expressionLookback(expression.input);
  if (expression.type === 'arithmetic')
    return Math.max(expressionLookback(expression.left), expressionLookback(expression.right));
  if (expression.type === 'absolute') return expressionLookback(expression.input);
  if (expression.type === 'lag') return expressionLookback(expression.input) + expression.periods;
  if (
    expression.type === 'constant' ||
    expression.type === 'series' ||
    expression.type === 'positionState'
  )
    return 1;
  if (expression.type === 'corporateActionEvent' || expression.type === 'sessionValue') return 1;
  if (expression.type === 'all' || expression.type === 'any') {
    return Math.max(...expression.conditions.map(expressionLookback));
  }
  if (expression.type === 'not') return expressionLookback(expression.expression);
  if (expression.type === 'compare' || expression.type === 'cross') {
    return Math.max(expressionLookback(expression.left), expressionLookback(expression.right));
  }
  const inputLookback = expressionLookback(expression.input);
  const own = indicatorRequiredLookback(expression.name, expression.params);
  return inputLookback + own - 1;
};

export const requiredLookback = expressionLookback;
function temporalConditionLookback(expression: BooleanExpression): number {
  if (expression.type === 'cross')
    return Math.max(expressionLookback(expression.left), expressionLookback(expression.right)) + 1;
  if (expression.type === 'all' || expression.type === 'any')
    return Math.max(...expression.conditions.map(temporalConditionLookback));
  if (expression.type === 'not') return temporalConditionLookback(expression.expression);
  return expressionLookback(expression);
}
export const requiredLookbackForExpression = expressionLookback;

export interface ExpressionLookback {
  entry: number;
  exit: number;
  required: number;
}

export const strategyRequiredLookback = (strategy: {
  entry: Expression;
  exit: Expression;
  tradePlan?: BacktestTradePlan | undefined;
  execution?: unknown;
}): ExpressionLookback => {
  const entry = expressionLookback(strategy.entry);
  const exit = expressionLookback(strategy.exit);
  const stop = strategy.tradePlan?.initialStop;
  const trailing = strategy.tradePlan?.trailing;
  const conditions = tradePlanProtectionRules(strategy.tradePlan).map(({ expression }) =>
    expressionLookback(expression),
  );
  return {
    entry,
    exit,
    required: Math.max(
      entry,
      exit,
      ...conditions,
      ...dailyOrderPriceExpressions(strategy.execution).map(({ expression }) =>
        expressionLookback(expression),
      ),
      stop?.kind === 'entryAtr' ? indicatorRequiredLookback('ATR', { period: stop.period }) : 1,
      trailing?.kind === 'currentAtr'
        ? indicatorRequiredLookback('ATR', { period: trailing.period })
        : 1,
      (strategy.tradePlan?.volatilityTarget?.returnPeriods ?? 0) + 1,
    ),
  };
};

export const indicatorPointToSeriesPoint = (point: IndicatorPoint): BacktestSeriesPoint => ({
  ...point,
});

// Keep the imported BooleanExpression visible in the public type surface for
// consumers that narrow AST expressions before calling requiredLookback.
export type BacktestBooleanExpression = BooleanExpression;
export type BacktestNumericExpression = NumericExpression;
import { dailyOrderPriceExpressions } from './backtest-daily-order-expressions.js';
