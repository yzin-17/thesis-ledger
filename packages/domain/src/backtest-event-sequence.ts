import type { Expression, BooleanExpression, NumericExpression } from './backtest-strategy.js';
import type { BacktestSeries, BacktestSeriesPoint } from './backtest-series.js';
import type { NumericEvaluation } from './backtest-simulation.js';
import { finishBacktestComputation, mapBacktestComputationItems } from './backtest-computation.js';
import { expressionSourceIds } from './backtest-expression-observations.js';
import { materializeBoolean } from './backtest-temporal-series.js';
import {
  evaluateNumericExpression,
  numericExpressionKey,
} from './backtest-simulation-evaluator.js';
import {
  mergeBacktestAvailability,
  type BacktestAvailability,
} from './backtest-observation-clock.js';

/** 纯预计算的有限事件状态；全量冻结重放得到相同状态与取值。 */
export function* buildEventSequenceSeriesSteps(
  expression: Extract<BooleanExpression, { type: 'sequence' }>,
  sources: ReadonlyMap<string, BacktestSeries>,
  output: Map<string, BacktestSeries>,
  build: (node: Expression) => Generator<void, void, void>,
): Generator<void, void, void> {
  for (const node of [expression.trigger, expression.confirm, expression.invalidation, expression.capture])
    if (node) yield* build(node);
  const anchor = [...sources.values()].find(
    (source) => source.sourceId === expressionSourceIds(expression)[0],
  );
  if (!anchor) return;
  const observations = [...anchor.points].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  let active:
    { index: number; capture?: NumericEvaluation; clock: BacktestAvailability } | undefined;
  let consumed = false;
  let replayClock: BacktestAvailability | undefined;
  const points = yield* mapBacktestComputationItems(observations, (point, index): BacktestSeriesPoint => {
    if (active && index - active.index > expression.within) active = undefined;
    const read = (input: BooleanExpression) =>
      materializeBoolean(
        input,
        point,
        observations[index - 1],
        { sources, output },
        active?.capture,
      );
    const trigger = read(expression.trigger);
    // 无冻结值时，引用事件值的失效／确认条件尚未激活。
    const clocks: BacktestAvailability[] = replayClock ? [replayClock, point] : [point];
    const missing = (reason: string): BacktestSeriesPoint => {
      active = undefined;
      replayClock = mergeBacktestAvailability(clocks);
      return {
        occurredAt: point.occurredAt,
        availableAt: point.availableAt,
        status: 'unavailable',
        reason,
      };
    };
    if (trigger.status !== 'available') return missing('事件开始条件不可用，等待失效');
    clocks.push(trigger);
    if (!active && trigger.value && (!consumed || expression.repeat)) {
      const capture = expression.capture
        ? evaluateNumericExpression(
            expression.capture,
            {
              tick: { occurredAt: point.occurredAt },
              sourceSeries: sources,
              indicatorSeries: output,
            },
            { strict: true, materialize: true },
          )
        : undefined;
      if (capture?.status === 'unavailable') return missing('事件冻结取值不可用');
      active = {
        index,
        ...(capture ? { capture } : {}),
        clock: mergeBacktestAvailability(capture ? [trigger, capture] : [trigger]),
      };
      clocks.push(active.clock);
    }
    let result = false;
    if (active) {
      const invalidation = read(expression.invalidation);
      if (invalidation.status !== 'available') return missing('事件失效条件不可用，等待失效');
      clocks.push(active.clock, invalidation);
      if (invalidation.value) active = undefined;
      else if (index > active.index || expression.allowSameBar) {
        const confirm = read(expression.confirm);
        if (confirm.status !== 'available') return missing('事件确认条件不可用，等待失效');
        clocks.push(confirm);
        if (confirm.value) {
          result = true;
          consumed = true;
          active = undefined;
        }
      }
      if (active) active.clock = mergeBacktestAvailability(clocks);
    }
    replayClock = mergeBacktestAvailability(clocks);
    return {
      occurredAt: point.occurredAt,
      valueOccurredAt: point.occurredAt,
      status: 'available',
      value: result ? '1' : '0',
      ...replayClock,
    };
  });
  output.set(numericExpressionKey(expression), {
    ...anchor,
    strictObservations: true,
    sourceId: numericExpressionKey(expression),
    points,
  });
}

export function buildEventSequenceSeries(expression: Extract<BooleanExpression, { type: 'sequence' }>, sources: ReadonlyMap<string, BacktestSeries>, output: Map<string, BacktestSeries>, build: (node: Expression) => void): void {
  finishBacktestComputation(buildEventSequenceSeriesSteps(expression, sources, output, function* (node) { build(node); yield; }));
}

/** 单位检查绑定的是捕获表达式的单位，执行绑定的是触发时冻结的数值。 */
export function bindEventValue(input: unknown, capture: NumericExpression | undefined): unknown {
  if (Array.isArray(input)) return input.map((value) => bindEventValue(value, capture));
  if (!input || typeof input !== 'object') return input;
  const node = input as Record<string, unknown>;
  if (node.type === 'eventValue' && capture) return capture;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, bindEventValue(value, capture)]),
  );
}
