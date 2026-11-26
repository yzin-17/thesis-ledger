import { DecimalValue as D } from './decimal.js';
import type { Expression, NumericExpression } from './backtest-strategy.js';
import type { BacktestSeries, BacktestSeriesPoint } from './backtest-series.js';
import { expressionSourceIds } from './backtest-expression-observations.js';
import {
  evaluateNumericExpression,
  numericExpressionKey,
} from './backtest-simulation-evaluator.js';
import { mergeBacktestAvailability } from './backtest-observation-clock.js';
import { finishBacktestComputation, mapBacktestComputationItems } from './backtest-computation.js';

/** 严格摆动点只在右侧窗口完成后产生；sample 在摆动点而非确认日取样。 */
export function* buildConfirmedPivotSeriesSteps(
  expression: Extract<NumericExpression, { type: 'confirmedPivot' }>,
  sources: ReadonlyMap<string, BacktestSeries>,
  output: Map<string, BacktestSeries>,
  build: (node: Expression) => Generator<void, void, void>,
): Generator<void, void, void> {
  yield* build(expression.input);
  if (expression.sample) yield* build(expression.sample);
  const anchor = [...sources.values()].find(
    (source) => source.sourceId === expressionSourceIds(expression)[0],
  );
  if (!anchor) return;
  const observations = [...anchor.points].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const read = (input: NumericExpression, point: BacktestSeriesPoint) =>
    evaluateNumericExpression(
      input,
      {
        tick: { occurredAt: point.occurredAt },
        sourceSeries: sources,
        indicatorSeries: output,
      },
      { strict: true, materialize: true },
    );
  const values = yield* mapBacktestComputationItems(observations, (point) => read(expression.input, point));
  const confirmed: BacktestSeriesPoint[] = [];
  const points = yield* mapBacktestComputationItems(observations, (point, index): BacktestSeriesPoint => {
    const center = index - expression.rightBars;
    const window = values.slice(Math.max(0, center - expression.leftBars), index + 1);
    const candidate = values[center];
    if (
      center >= expression.leftBars &&
      candidate?.status === 'available' &&
      window.every((value) => value.status === 'available')
    ) {
      const candidateValue = D.from(candidate.value);
      const extreme = window.every((value, offset) => {
        if (offset === expression.leftBars || value.status !== 'available') return true;
        const comparison = candidateValue.compareTo(value.value);
        return expression.side === 'low' ? comparison < 0 : comparison > 0;
      });
      const sample = expression.sample ? read(expression.sample, observations[center]!) : candidate;
      if (extreme && sample.status === 'available')
        confirmed.push({
          occurredAt: point.occurredAt,
          valueOccurredAt: observations[center]!.occurredAt,
          status: 'available',
          value: sample.value,
          ...mergeBacktestAvailability([
            ...window.filter((value) => value.status === 'available'),
            sample,
          ]),
        });
    }
    const selected = confirmed.at(-1 - expression.offset);
    return selected
      ? { ...selected, occurredAt: point.occurredAt }
      : {
          occurredAt: point.occurredAt,
          availableAt: point.availableAt,
          status: 'unavailable',
          reason: '尚无足够已确认摆动点',
        };
  });
  output.set(numericExpressionKey(expression), {
    ...anchor,
    strictObservations: true,
    sourceId: numericExpressionKey(expression),
    points,
  });
}

export function buildConfirmedPivotSeries(expression: Extract<NumericExpression, { type: 'confirmedPivot' }>, sources: ReadonlyMap<string, BacktestSeries>, output: Map<string, BacktestSeries>, build: (node: Expression) => void): void {
  finishBacktestComputation(buildConfirmedPivotSeriesSteps(expression, sources, output, function* (node) { build(node); yield; }));
}
