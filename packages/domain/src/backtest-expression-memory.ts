import type { BooleanExpression, NumericExpression } from './backtest-strategy.js';
import type { BacktestSeries } from './backtest-series.js';
import type { NumericEvaluation, SimulationExpressionContext } from './backtest-simulation.js';
import {
  evaluateNumericExpression,
  getSeries,
  numericExpressionKey,
} from './backtest-simulation-evaluator.js';
import { isAvailableForDecisionAt } from './backtest-observation-clock.js';

const numericExpressionsIn = (expression: BooleanExpression): NumericExpression[] => {
  if (expression.type === 'compare' || expression.type === 'cross') {
    return [expression.left, expression.right];
  }
  if (expression.type === 'not') return numericExpressionsIn(expression.expression);
  if (expression.type === 'all' || expression.type === 'any') {
    return expression.conditions.flatMap(numericExpressionsIn);
  }
  return [];
};

export const futureFactForUnavailable = (
  expression: BooleanExpression,
  context: SimulationExpressionContext,
) => {
  const facts: string[] = [];
  for (const numeric of numericExpressionsIn(expression)) {
    let series: BacktestSeries | undefined;
    if (numeric.type === 'series') {
      series = getSeries(context.sourceSeries, numeric.sourceId, numeric.field);
    } else if (numeric.type !== 'constant' && numeric.type !== 'positionState') {
      series = getSeries(context.indicatorSeries, numericExpressionKey(numeric));
    }
    if (!series || evaluateNumericExpression(numeric, context).status === 'available') continue;
    const latest = [...series.points]
      .filter((point) => Date.parse(point.occurredAt) <= Date.parse(context.tick.occurredAt))
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0];
    if (
      latest &&
      latest.status !== 'unavailable' &&
      latest.value !== undefined &&
      !isAvailableForDecisionAt(latest, context.tick.occurredAt)
    ) {
      facts.push(`${series.sourceId}:${latest.occurredAt}:availableAt=${latest.availableAt}`);
    }
  }
  return facts;
};

export const rememberNumericExpressions = (
  expression: BooleanExpression,
  context: SimulationExpressionContext,
  previousNumeric: Map<string, NumericEvaluation>,
) => {
  for (const numeric of numericExpressionsIn(expression)) {
    const value = evaluateNumericExpression(numeric, context);
    if (value.status === 'available') previousNumeric.set(numericExpressionKey(numeric), value);
  }
};
