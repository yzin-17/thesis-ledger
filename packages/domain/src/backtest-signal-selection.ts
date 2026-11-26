import type { BooleanExpression } from './backtest-contract.js';
import { availabilityForDecision, isAvailableForDecisionAt } from './backtest-observation-clock.js';
import { simulationExpressionContext } from './backtest-expression-context.js';
import { evaluateBooleanExpression } from './backtest-simulation-evaluator.js';
import type {
  BooleanEvaluation,
  EdgeState,
  NumericEvaluation,
  SignalEvaluationResult,
  SimulationEngineInput,
  SimulationSignal,
  SimulationTick,
} from './backtest-simulation.js';

function edgeSignal(
  kind: SimulationSignal['kind'],
  value: BooleanEvaluation,
  previous: boolean | undefined,
  input: SimulationEngineInput,
  sequence: number,
): SimulationSignal | undefined {
  if (
    value.status !== 'available' ||
    !value.value ||
    !isAvailableForDecisionAt(value, value.occurredAt)
  )
    return;
  if (kind !== 'risk' && previous === true) return;
  return {
    signalId: `${input.strategy.executionInstrument.symbol}:${kind}:${value.occurredAt}:${sequence}`,
    source: 'BACKTEST',
    kind,
    occurredAt: value.occurredAt,
    availableAt: availabilityForDecision(value)!,
    executionSymbol: input.strategy.executionInstrument.symbol,
    reason: kind === 'entry' && input.strategy.entryTrigger === 'while-flat' ? 'entry while-flat' : `${kind} edge`,
  };
}

/** 普通策略保留原边沿语义；交易计划显式选择生命周期动作。 */
export function evaluateSignalAt(
  input: SimulationEngineInput,
  tick: SimulationTick,
  state: EdgeState,
  sequence: number,
  previousNumeric?: ReadonlyMap<string, NumericEvaluation>,
): SignalEvaluationResult {
  const position = input.positionStateAt?.(tick) ?? input.positionState;
  const context = simulationExpressionContext(input, tick, position, previousNumeric);
  const entry = evaluateBooleanExpression(input.strategy.entry as BooleanExpression, context);
  const exit = evaluateBooleanExpression(input.strategy.exit as BooleanExpression, context);
  const risk = input.risk?.(context);
  const entryEligible = position?.isOpen !== true && (input.entryEligible?.(context) ?? true);
  input.observeRule?.({ ruleId: 'entry', evaluation: entry, applicable: entryEligible, tick });
  input.observeRule?.({ ruleId: 'exit', evaluation: exit, applicable: position?.isOpen === true, tick });
  if (risk) input.observeRule?.({ ruleId: 'risk', evaluation: risk, applicable: position?.isOpen === true, tick });
  const nextState = { ...state };
  let signal: SimulationSignal | undefined;
  if (position?.isOpen !== false) {
    signal = risk ? edgeSignal('risk', risk, undefined, input, sequence) : undefined;
    if (!signal) signal = edgeSignal('exit', exit, state.exit, input, sequence);
  }
  if (!signal && entryEligible)
    signal = edgeSignal('entry', entry, input.strategy.entryTrigger === 'while-flat' ? undefined : state.entry, input, sequence);
  if (entry.status === 'available' && isAvailableForDecisionAt(entry, tick.occurredAt))
    nextState.entry = entry.value;
  if (exit.status === 'available' && isAvailableForDecisionAt(exit, tick.occurredAt))
    nextState.exit = exit.value;
  const selection = {
    state: nextState,
    entry,
    exit,
    ...(risk ? { risk } : {}),
    ...(signal ? { signal } : {}),
  };
  return selection;
}
