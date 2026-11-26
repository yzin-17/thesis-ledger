import { DecimalValue as D } from './decimal.js';
import type { Expression, NumericExpression, BooleanExpression } from './backtest-strategy.js';
import type { BacktestSeries, BacktestSeriesPoint } from './backtest-series.js';
import type { BooleanEvaluation, NumericEvaluation } from './backtest-simulation.js';
import {
  evaluateNumericExpression,
  evaluateBooleanExpression,
  numericExpressionKey,
} from './backtest-simulation-evaluator.js';
import { expressionSourceIds } from './backtest-expression-observations.js';
import { mergeBacktestAvailability } from './backtest-observation-clock.js';
import { calculateWindowStatistic } from './backtest-window-statistics.js';
import { finishBacktestComputation, mapBacktestComputationItems } from './backtest-computation.js';

type Collections = {
  sources: ReadonlyMap<string, BacktestSeries>;
  output: Map<string, BacktestSeries>;
};

export function materializeBoolean(
  expression: BooleanExpression,
  point: BacktestSeriesPoint,
  previous: BacktestSeriesPoint | undefined,
  { sources, output }: Collections,
  eventValue?: NumericEvaluation,
): BooleanEvaluation {
  const previousNumeric = new Map<string, NumericEvaluation>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'cross' && previous) {
      for (const input of [node.left, node.right] as NumericExpression[])
        previousNumeric.set(
          numericExpressionKey(input),
          evaluateNumericExpression(
            input,
            {
              tick: { occurredAt: previous.occurredAt },
              sourceSeries: sources,
              indicatorSeries: output,
            },
            { strict: true, materialize: true },
          ),
        );
    }
    Object.values(node).forEach(visit);
  };
  visit(expression);
  return evaluateBooleanExpression(
    expression,
    {
      tick: { occurredAt: point.occurredAt },
      sourceSeries: sources,
      indicatorSeries: output,
      previousNumeric,
      ...(eventValue ? { eventValue } : {}),
    },
    { strict: true, materialize: true },
  );
}

export function* buildTemporalSeriesSteps(
  expression: Expression,
  sources: ReadonlyMap<string, BacktestSeries>,
  output: Map<string, BacktestSeries>,
  build: (expression: Expression) => Generator<void, void, void>,
): Generator<void, boolean, void> {
  if (
    expression.type !== 'rolling' &&
    expression.type !== 'cumulative' &&
    expression.type !== 'countTrue' &&
    expression.type !== 'consecutive'
  )
    return false;
  const input = 'input' in expression ? expression.input : expression.condition;
  yield* build(input);
  const anchor = [...sources.values()].find(
    (source) => source.sourceId === expressionSourceIds(input)[0],
  );
  if (!anchor) return true;
  const observations = [...anchor.points].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const values = yield* mapBacktestComputationItems(observations, (point, index): NumericEvaluation | BooleanEvaluation =>
    'input' in expression
      ? evaluateNumericExpression(
          expression.input,
          {
            tick: { occurredAt: point.occurredAt },
            sourceSeries: sources,
            indicatorSeries: output,
          },
          { strict: true, materialize: true },
        )
      : materializeBoolean(expression.condition, point, observations[index - 1], {
          sources,
          output,
        }),
  );
  const anchorIndex =
    expression.type === 'cumulative'
      ? observations.findIndex(
          (point) => Date.parse(point.occurredAt) >= Date.parse(expression.anchorAt),
        )
      : -1;
  const points = yield* mapBacktestComputationItems(observations, (point, index): BacktestSeriesPoint => {
    const start = expression.type === 'cumulative' ? anchorIndex : index - expression.periods + 1;
    const history = values.slice(Math.max(0, start), index + 1);
    const invalid =
      start < 0 ||
      start > index ||
      (expression.type === 'cumulative' &&
        Date.parse(observations[0]!.occurredAt) > Date.parse(expression.anchorAt));
    if (invalid || history.some((value) => value.status !== 'available'))
      return {
        occurredAt: point.occurredAt,
        availableAt: point.availableAt,
        status: 'unavailable',
        reason: '窗口未填满、锚点未覆盖或窗口输入不可用',
      };
    const available = history.filter((value) => value.status === 'available');
    let value: string;
    if (expression.type === 'countTrue' || expression.type === 'consecutive') {
      const count = available.filter((item) => item.value === true).length;
      value =
        expression.type === 'countTrue'
          ? String(count)
          : String(Number(count === expression.periods));
    } else
      value = calculateWindowStatistic(
        expression.statistic,
        available.map((item) => D.from(String(item.value))),
        expression.type === 'rolling' ? expression : {},
      );
    return {
      occurredAt: point.occurredAt,
      valueOccurredAt: point.occurredAt,
      status: 'available',
      value,
      ...mergeBacktestAvailability(available),
    };
  });
  output.set(numericExpressionKey(expression), {
    ...anchor,
    strictObservations: true,
    sourceId: numericExpressionKey(expression),
    points,
  });
  return true;
}

export function buildTemporalSeries(expression: Expression, sources: ReadonlyMap<string, BacktestSeries>, output: Map<string, BacktestSeries>, build: (node: Expression) => void): boolean {
  return finishBacktestComputation(buildTemporalSeriesSteps(expression, sources, output, function* (node) { build(node); yield; }));
}
