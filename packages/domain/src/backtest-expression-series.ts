import type { BacktestSeries, BacktestSeriesPoint } from './backtest-series.js';
import type { NumericExpression, Expression } from './backtest-strategy.js';
import {
  evaluateNumericExpression,
  numericExpressionKey,
} from './backtest-simulation-evaluator.js';
import { buildTemporalSeriesSteps } from './backtest-temporal-series.js';
import { buildEventSequenceSeriesSteps } from './backtest-event-sequence.js';
import { buildConfirmedPivotSeriesSteps } from './backtest-confirmed-pivot.js';
import { finishBacktestComputation, mapBacktestComputationItems } from './backtest-computation.js';

import { expressionSourceIds } from './backtest-expression-observations.js';
export {
  expressionSourceIds,
  expressionCumulativeAnchor,
  latestExpressionObservation,
} from './backtest-expression-observations.js';

/** 新节点按来源观测物化；显式缺值保留原位，历史引用不跳点或借用旧结果。 */
export function* buildNumericOperationSeriesSteps(
  expression: Expression,
  sources: ReadonlyMap<string, BacktestSeries>,
  output: Map<string, BacktestSeries>,
  build: (node: Expression) => Generator<void, void, void>,
): Generator<void, boolean, void> {
  if (expression.type === 'confirmedPivot') {
    yield* buildConfirmedPivotSeriesSteps(expression, sources, output, build);
    return true;
  }
  if (expression.type === 'sequence') {
    yield* buildEventSequenceSeriesSteps(expression, sources, output, build);
    return true;
  }
  if (yield* buildTemporalSeriesSteps(expression, sources, output, build)) return true;
  if (
    expression.type !== 'arithmetic' &&
    expression.type !== 'absolute' &&
    expression.type !== 'lag'
  )
    return false;
  const children =
    expression.type === 'arithmetic' ? [expression.left, expression.right] : [expression.input];
  for (const child of children) yield* build(child);
  const sourceId = expressionSourceIds(expression)[0];
  const anchor = [...sources.values()].find((series) => series.sourceId === sourceId);
  if (!anchor) return true;
  const observations = [...anchor.points].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const points = yield* mapBacktestComputationItems(observations, (point, index): BacktestSeriesPoint => {
    let selected = point;
    let input: NumericExpression = expression;
    if (expression.type === 'lag') {
      const history = observations[index - expression.periods];
      if (!history)
        return {
          occurredAt: point.occurredAt,
          availableAt: point.availableAt,
          status: 'unavailable',
          reason: '历史观测不足',
        };
      selected = history;
      input = expression.input;
    }
    const evaluated = evaluateNumericExpression(
      input,
      { tick: { occurredAt: selected.occurredAt }, sourceSeries: sources, indicatorSeries: output },
      { strict: true, materialize: true },
    );
    if (evaluated.status !== 'available')
      return {
        occurredAt: point.occurredAt,
        availableAt: point.availableAt,
        status: 'unavailable',
        reason: evaluated.reason,
      };
    return { ...evaluated, occurredAt: point.occurredAt, valueOccurredAt: selected.occurredAt };
  });
  output.set(numericExpressionKey(expression), {
    ...anchor,
    strictObservations: true,
    sourceId: numericExpressionKey(expression),
    points,
  });
  return true;
}

export function buildNumericOperationSeries(expression: Expression, sources: ReadonlyMap<string, BacktestSeries>, output: Map<string, BacktestSeries>, build: (node: Expression) => void): boolean {
  return finishBacktestComputation(buildNumericOperationSeriesSteps(expression, sources, output, function* (node) { build(node); yield; }));
}
