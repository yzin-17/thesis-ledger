import { type BacktestSeries } from './backtest-series.js';
import {
  type BooleanExpression,
  type NumericExpression,
  type StrategySchemaV2,
} from './backtest-v2.js';
import {
  evaluateBooleanExpression,
  evaluateNumericExpression,
  getSeries,
  numericExpressionKey,
} from './backtest-simulation-evaluator.js';
import {
  corporateActionEventId,
  type BacktestCorporateActionFact,
  type CorporateActionPort,
  type CorporateActionResult,
} from './backtest-corporate-actions.js';

export {
  evaluateBooleanExpression,
  evaluateNumericExpression,
} from './backtest-simulation-evaluator.js';

export const simulationPhases = [
  'SessionSettlementState',
  'CorporateAction',
  'DataAvailable',
  'SeriesIndicatorUpdate',
  'RiskSignalEvaluation',
  'TargetIntent',
  'OrderValidation',
  'FillOrReject',
  'NavConfirmationSettlement',
  'PortfolioValuation',
  'ResultEmission',
] as const;

export type SimulationPhase = (typeof simulationPhases)[number];
export type SimulationEventType =
  | 'sessionState'
  | 'corporateAction'
  | 'dataAvailable'
  | 'seriesIndicatorUpdate'
  | 'signalEvaluation'
  | 'targetIntent'
  | 'orderValidation'
  | 'simulationFill'
  | 'simulationReject'
  | 'navConfirmation'
  | 'cashSettlement'
  | 'portfolioValuation'
  | 'resultEmission';

export interface SimulationEvent<TPayload = unknown> {
  eventId: string;
  runId: string;
  type: SimulationEventType;
  phase: SimulationPhase;
  occurredAt: string;
  availableAt: string;
  sequence: number;
  payload: TPayload;
}

export type EvaluationStatus = 'available' | 'unavailable';

export interface AvailableEvaluation<T> {
  status: 'available';
  value: T;
  occurredAt: string;
  availableAt: string;
}

export interface UnavailableEvaluation {
  status: 'unavailable';
  occurredAt: string;
  reason: string;
}

export type Evaluation<T> = AvailableEvaluation<T> | UnavailableEvaluation;
export type NumericEvaluation = Evaluation<string>;
export type BooleanEvaluation = Evaluation<boolean>;

export interface SimulationTick {
  occurredAt: string;
  availableAt?: string;
  timeframe?: StrategySchemaV2['primaryTimeframe'];
}

export interface SimulationPositionState {
  isOpen: boolean;
  quantity: string;
  averageCost: string;
  holdingPeriods: number;
  availableAt: string;
}

export interface SimulationExpressionContext {
  tick: SimulationTick;
  sourceSeries: ReadonlyMap<string, BacktestSeries> | Readonly<Record<string, BacktestSeries>>;
  indicatorSeries?: ReadonlyMap<string, BacktestSeries> | Readonly<Record<string, BacktestSeries>>;
  positionState?: SimulationPositionState;
  previousNumeric?: ReadonlyMap<string, NumericEvaluation>;
}

export interface SimulationSignal {
  signalId: string;
  source: 'BACKTEST';
  kind: 'entry' | 'exit' | 'risk';
  occurredAt: string;
  availableAt: string;
  executionSymbol: string;
  reason: string;
}

export interface SimulationTargetIntent {
  intentId: string;
  signalId: string;
  executionSymbol: string;
  side: 'buy' | 'sell';
  reason: 'signal' | 'risk';
  occurredAt: string;
  availableAt: string;
}

export interface SimulationOrderRequest extends SimulationTargetIntent {
  orderId: string;
}

export interface SimulationFillRecord {
  fillId: string;
  orderId: string;
  executionSymbol: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  charges: readonly { amount: string; currency: 'CNY' | 'HKD' | 'USD' }[];
  occurredAt: string;
  availableAt: string;
  reason: 'signal' | 'risk';
}

export interface SimulationReject {
  rejectionId: string;
  orderId?: string;
  code: 'RULE_REJECTED' | 'FUTURE_DATA' | 'DUPLICATE_EVENT' | 'CANCELLED';
  reason: string;
  ruleVersion?: string;
  occurredAt: string;
  availableAt: string;
  inputFacts: readonly string[];
}

export interface SimulationMutationCommand {
  type: 'simulationFill' | 'navConfirmation' | 'cashSettlement' | 'corporateAction';
  eventId: string;
  payload: Record<string, unknown>;
}

export interface SimulationExecutionPort {
  toOrder?: (intent: SimulationTargetIntent) => SimulationOrderRequest;
  validateOrder?: (order: SimulationOrderRequest) =>
    | { accepted: true; ruleVersion: string; inputFacts?: readonly string[] }
    | {
        accepted: false;
        code: string;
        reason: string;
        ruleVersion: string;
        inputFacts?: readonly string[];
      };
  createFill?: (order: SimulationOrderRequest) => SimulationFillRecord | undefined;
  scheduledMutationsForFill?: (fill: SimulationFillRecord) => readonly {
    type: 'cashSettlement';
    eventId: string;
    occurredAt: string;
    availableAt: string;
    payload: Record<string, unknown>;
  }[];
  onMutation?: (command: SimulationMutationCommand) => void;
}

export interface SimulationEngineInput {
  runId: string;
  strategy: Pick<StrategySchemaV2, 'entry' | 'exit' | 'executionInstrument' | 'primaryTimeframe'>;
  ticks: readonly SimulationTick[];
  sourceSeries: ReadonlyMap<string, BacktestSeries> | Readonly<Record<string, BacktestSeries>>;
  indicatorSeries?: ReadonlyMap<string, BacktestSeries> | Readonly<Record<string, BacktestSeries>>;
  positionState?: SimulationPositionState;
  positionStateAt?: (tick: SimulationTick) => SimulationPositionState | undefined;
  corporateActions?: readonly BacktestCorporateActionFact[];
  corporateActionPort?: CorporateActionPort;
  risk?: (context: SimulationExpressionContext) => BooleanEvaluation;
  execution?: SimulationExecutionPort;
}

export interface SimulationRunResult {
  events: readonly SimulationEvent[];
  signals: readonly SimulationSignal[];
  targetIntents: readonly SimulationTargetIntent[];
  fills: readonly SimulationFillRecord[];
  rejects: readonly SimulationReject[];
  mutations: readonly SimulationMutationCommand[];
  corporateActionResults: readonly CorporateActionResult[];
}

export class SimulationEngineError extends Error {
  constructor(
    readonly code: 'FUTURE_DATA' | 'INVALID_EVENT' | 'DUPLICATE_EVENT',
    message: string,
  ) {
    super(message);
    this.name = 'SimulationEngineError';
  }
}

const phaseOrder = new Map<SimulationPhase, number>(
  simulationPhases.map((phase, index) => [phase, index]),
);

const instant = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new SimulationEngineError('INVALID_EVENT', `无效时间: ${value}`);
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

const eventIdFor = (runId: string, sequence: number, type: SimulationEventType, payload: unknown) =>
  `${runId}:${sequence}:${type}:${stableSerialize(payload)}`;

export const simulationEventTime = (event: Pick<SimulationEvent, 'occurredAt' | 'availableAt'>) =>
  instant(event.availableAt) > instant(event.occurredAt) ? event.availableAt : event.occurredAt;

export const compareSimulationEvents = (left: SimulationEvent, right: SimulationEvent) => {
  const occurred = instant(simulationEventTime(left)) - instant(simulationEventTime(right));
  if (occurred !== 0) return occurred;
  const phase = phaseOrder.get(left.phase)! - phaseOrder.get(right.phase)!;
  if (phase !== 0) return phase;
  return left.sequence - right.sequence || left.eventId.localeCompare(right.eventId);
};

export const createSimulationEvent = <T>(input: {
  runId: string;
  sequence: number;
  type: SimulationEventType;
  phase: SimulationPhase;
  occurredAt: string;
  availableAt?: string;
  payload: T;
}): SimulationEvent<T> => {
  instant(input.occurredAt);
  const availableAt = input.availableAt ?? input.occurredAt;
  instant(availableAt);
  const eventId = eventIdFor(input.runId, input.sequence, input.type, input.payload);
  return { ...input, availableAt, eventId };
};

export class SimulationEventQueue {
  private readonly pending = new Map<string, SimulationEvent>();
  private readonly cancelled = new Set<string>();
  private readonly processed = new Set<string>();

  enqueue(event: SimulationEvent) {
    if (this.pending.has(event.eventId) || this.processed.has(event.eventId)) return false;
    this.pending.set(event.eventId, event);
    return true;
  }

  cancel(eventId: string) {
    if (!this.pending.has(eventId) || this.processed.has(eventId) || this.cancelled.has(eventId))
      return false;
    this.cancelled.add(eventId);
    return true;
  }

  retry(eventId: string) {
    if (this.processed.has(eventId) || this.cancelled.has(eventId)) return false;
    return this.pending.has(eventId);
  }

  nextEligibleEvent(until?: string) {
    const untilTime = until === undefined ? Number.POSITIVE_INFINITY : instant(until);
    return [...this.pending.values()]
      .filter(
        (event) =>
          !this.cancelled.has(event.eventId) && instant(simulationEventTime(event)) <= untilTime,
      )
      .sort(compareSimulationEvents)[0];
  }

  dequeue(until?: string) {
    const untilTime = until === undefined ? Number.POSITIVE_INFINITY : instant(until);
    for (const [eventId, event] of this.pending) {
      if (this.cancelled.has(eventId) && instant(simulationEventTime(event)) <= untilTime) {
        this.pending.delete(eventId);
      }
    }
    let event = this.nextEligibleEvent(until);
    while (event && this.cancelled.has(event.eventId)) {
      this.pending.delete(event.eventId);
      event = this.nextEligibleEvent(until);
    }
    if (!event) return undefined;
    this.pending.delete(event.eventId);
    this.processed.add(event.eventId);
    return event;
  }

  drain(until?: string) {
    const result: SimulationEvent[] = [];
    let event = this.dequeue(until);
    while (event) {
      result.push(event);
      event = this.dequeue(until);
    }
    return result;
  }

  get size() {
    return this.pending.size;
  }
}

export interface EdgeState {
  entry?: boolean;
  exit?: boolean;
}

export interface SignalEvaluationResult {
  state: EdgeState;
  signal?: SimulationSignal;
  entry: BooleanEvaluation;
  exit: BooleanEvaluation;
  risk?: BooleanEvaluation;
}

const edgeSignal = (
  kind: 'entry' | 'exit' | 'risk',
  value: BooleanEvaluation,
  previous: boolean | undefined,
  strategy: SimulationEngineInput['strategy'],
  sequence: number,
): SimulationSignal | undefined => {
  if (value.status !== 'available' || !value.value) return undefined;
  if (instant(value.availableAt) > instant(value.occurredAt)) return undefined;
  if (kind !== 'risk' && previous === true) return undefined;
  return {
    signalId: `${strategy.executionInstrument.symbol}:${kind}:${value.occurredAt}:${sequence}`,
    source: 'BACKTEST',
    kind,
    occurredAt: value.occurredAt,
    availableAt: value.availableAt,
    executionSymbol: strategy.executionInstrument.symbol,
    reason: `${kind} edge`,
  };
};

export const evaluateSignalAt = (
  input: SimulationEngineInput,
  tick: SimulationTick,
  state: EdgeState,
  sequence: number,
  previousNumeric?: ReadonlyMap<string, NumericEvaluation>,
): SignalEvaluationResult => {
  const positionState = positionStateFor(input, tick);
  const context: SimulationExpressionContext = {
    tick,
    sourceSeries: input.sourceSeries,
    ...(positionState ? { positionState } : {}),
    ...(input.indicatorSeries ? { indicatorSeries: input.indicatorSeries } : {}),
    ...(previousNumeric ? { previousNumeric } : {}),
  };
  const entry = evaluateBooleanExpression(input.strategy.entry as BooleanExpression, context);
  const exit = evaluateBooleanExpression(input.strategy.exit as BooleanExpression, context);
  const risk = input.risk?.(context);
  const nextState: EdgeState = { ...state };
  let signal = risk ? edgeSignal('risk', risk, undefined, input.strategy, sequence) : undefined;
  if (risk?.status === 'available' && !risk.value) signal = undefined;
  if (!signal) signal = edgeSignal('exit', exit, state.exit, input.strategy, sequence);
  if (!signal) signal = edgeSignal('entry', entry, state.entry, input.strategy, sequence);
  if (entry.status === 'available') nextState.entry = entry.value;
  if (exit.status === 'available') nextState.exit = exit.value;
  return {
    state: nextState,
    entry,
    exit,
    ...(signal ? { signal } : {}),
    ...(risk ? { risk } : {}),
  };
};

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

const futureFactForUnavailable = (
  expression: BooleanExpression,
  context: SimulationExpressionContext,
) => {
  const facts: string[] = [];
  for (const numeric of numericExpressionsIn(expression)) {
    let series: BacktestSeries | undefined;
    if (numeric.type === 'series') {
      series = getSeries(context.sourceSeries, numeric.sourceId);
    } else if (numeric.type === 'indicator') {
      series = getSeries(context.indicatorSeries, numericExpressionKey(numeric));
    }
    if (!series || evaluateNumericExpression(numeric, context).status === 'available') continue;
    const latest = [...series.points]
      .filter((point) => instant(point.occurredAt) <= instant(context.tick.occurredAt))
      .sort((left, right) => instant(right.occurredAt) - instant(left.occurredAt))[0];
    if (
      latest &&
      latest.status !== 'unavailable' &&
      latest.value !== undefined &&
      instant(latest.availableAt) > instant(context.tick.occurredAt)
    ) {
      facts.push(`${series.sourceId}:${latest.occurredAt}:availableAt=${latest.availableAt}`);
    }
  }
  return facts;
};

const rememberNumericExpressions = (
  expression: BooleanExpression,
  context: SimulationExpressionContext,
  previousNumeric: Map<string, NumericEvaluation>,
) => {
  for (const numeric of numericExpressionsIn(expression)) {
    const value = evaluateNumericExpression(numeric, context);
    if (value.status === 'available') previousNumeric.set(numericExpressionKey(numeric), value);
  }
};

const eventAvailableAt = (event: SimulationEvent) => simulationEventTime(event);

const positionStateFor = (input: SimulationEngineInput, tick: SimulationTick) =>
  input.positionStateAt?.(tick) ?? input.positionState;

const laterTime = (left: string, right: string) => (instant(left) >= instant(right) ? left : right);

interface SimulationOrchestratorState {
  input: SimulationEngineInput;
  queue: SimulationEventQueue;
  signals: SimulationSignal[];
  intents: SimulationTargetIntent[];
  fills: SimulationFillRecord[];
  rejects: SimulationReject[];
  mutations: SimulationMutationCommand[];
  corporateActionResults: CorporateActionResult[];
  edgeState: EdgeState;
  previousNumeric: Map<string, NumericEvaluation>;
  sequence: number;
}

const enqueueFutureDataReject = (
  state: SimulationOrchestratorState,
  event: SimulationEvent,
  inputFacts: readonly string[],
) => {
  const facts = [...new Set(inputFacts)].sort();
  const reject: SimulationReject = {
    rejectionId: `${state.input.runId}:future:${event.eventId}`,
    code: 'FUTURE_DATA',
    reason: '事实 availableAt 晚于 evaluation time',
    ruleVersion: 'simulation-time-v1',
    occurredAt: eventAvailableAt(event),
    availableAt: eventAvailableAt(event),
    inputFacts: facts,
  };
  state.rejects.push(reject);
  state.queue.enqueue(
    createSimulationEvent({
      runId: state.input.runId,
      sequence: state.sequence++,
      type: 'simulationReject',
      phase: 'FillOrReject',
      occurredAt: reject.occurredAt,
      availableAt: reject.availableAt,
      payload: reject,
    }),
  );
};

const processSignalEvent = (state: SimulationOrchestratorState, event: SimulationEvent) => {
  const { input } = state;
  const tick = (event.payload as { tick: SimulationTick }).tick;
  if (instant(event.availableAt) > instant(event.occurredAt)) {
    enqueueFutureDataReject(state, event, [`tick.availableAt=${event.availableAt}`]);
    return;
  }
  const positionState = positionStateFor(input, tick);
  const context: SimulationExpressionContext = {
    tick,
    sourceSeries: input.sourceSeries,
    ...(positionState ? { positionState } : {}),
    ...(input.indicatorSeries ? { indicatorSeries: input.indicatorSeries } : {}),
    previousNumeric: state.previousNumeric,
  };
  const evaluation = evaluateSignalAt(
    input,
    tick,
    state.edgeState,
    event.sequence,
    state.previousNumeric,
  );
  const delayedFacts = [
    ...futureFactForUnavailable(input.strategy.entry as BooleanExpression, context),
    ...futureFactForUnavailable(input.strategy.exit as BooleanExpression, context),
    ...[evaluation.entry, evaluation.exit, evaluation.risk]
      .filter(
        (value): value is AvailableEvaluation<boolean> =>
          value?.status === 'available' && instant(value.availableAt) > instant(value.occurredAt),
      )
      .map((value) => `availableAt=${value.availableAt}`),
  ];
  if (delayedFacts.length > 0) {
    enqueueFutureDataReject(state, event, delayedFacts);
    return;
  }
  state.edgeState = evaluation.state;
  rememberNumericExpressions(
    input.strategy.entry as BooleanExpression,
    context,
    state.previousNumeric,
  );
  rememberNumericExpressions(
    input.strategy.exit as BooleanExpression,
    context,
    state.previousNumeric,
  );
  if (!evaluation.signal) return;
  state.signals.push(evaluation.signal);
  const intent: SimulationTargetIntent = {
    intentId: `${input.runId}:intent:${event.sequence}`,
    signalId: evaluation.signal.signalId,
    executionSymbol: evaluation.signal.executionSymbol,
    side: evaluation.signal.kind === 'entry' ? 'buy' : 'sell',
    reason: evaluation.signal.kind === 'risk' ? 'risk' : 'signal',
    occurredAt: event.occurredAt,
    availableAt: evaluation.signal.availableAt,
  };
  state.intents.push(intent);
  state.queue.enqueue(
    createSimulationEvent({
      runId: input.runId,
      sequence: state.sequence++,
      type: 'targetIntent',
      phase: 'TargetIntent',
      occurredAt: event.occurredAt,
      availableAt: intent.availableAt,
      payload: intent,
    }),
  );
};

const processTargetIntentEvent = (state: SimulationOrchestratorState, event: SimulationEvent) => {
  const execution = state.input.execution;
  if (!execution?.toOrder) return;
  const order = execution.toOrder(event.payload as SimulationTargetIntent);
  const occurredAt = eventAvailableAt(event);
  state.queue.enqueue(
    createSimulationEvent({
      runId: state.input.runId,
      sequence: state.sequence++,
      type: 'orderValidation',
      phase: 'OrderValidation',
      occurredAt,
      availableAt: occurredAt,
      payload: order,
    }),
  );
};

const enqueueReject = (
  state: SimulationOrchestratorState,
  event: SimulationEvent,
  reject: SimulationReject,
) => {
  state.rejects.push(reject);
  state.queue.enqueue(
    createSimulationEvent({
      runId: state.input.runId,
      sequence: state.sequence++,
      type: 'simulationReject',
      phase: 'FillOrReject',
      occurredAt: event.occurredAt,
      availableAt: event.availableAt,
      payload: reject,
    }),
  );
};

const processOrderValidationEvent = (
  state: SimulationOrchestratorState,
  event: SimulationEvent,
) => {
  const order = event.payload as SimulationOrderRequest;
  const execution = state.input.execution;
  const validation = execution?.validateOrder;
  if (!validation) return;
  if (order.executionSymbol !== state.input.strategy.executionInstrument.symbol) {
    enqueueReject(state, event, {
      rejectionId: `${state.input.runId}:reject:${order.orderId}`,
      orderId: order.orderId,
      code: 'RULE_REJECTED',
      reason: 'Order execution instrument 与策略不一致',
      ruleVersion: 'simulation-instrument-v1',
      occurredAt: event.occurredAt,
      availableAt: event.availableAt,
      inputFacts: [
        `strategy.executionInstrument=${state.input.strategy.executionInstrument.symbol}`,
        `order.executionSymbol=${order.executionSymbol}`,
      ],
    });
    return;
  }
  const decision = validation(order);
  if (!decision.accepted) {
    enqueueReject(state, event, {
      rejectionId: `${state.input.runId}:reject:${order.orderId}`,
      orderId: order.orderId,
      code: 'RULE_REJECTED',
      reason: decision.reason,
      ruleVersion: decision.ruleVersion,
      occurredAt: event.occurredAt,
      availableAt: event.availableAt,
      inputFacts: decision.inputFacts ?? [],
    });
    return;
  }
  const fill = execution.createFill?.(order);
  if (!fill || state.fills.some((item) => item.fillId === fill.fillId)) return;
  state.queue.enqueue(
    createSimulationEvent({
      runId: state.input.runId,
      sequence: state.sequence++,
      type: 'simulationFill',
      phase: 'FillOrReject',
      occurredAt: laterTime(eventAvailableAt(event), fill.availableAt),
      availableAt: fill.availableAt,
      payload: fill,
    }),
  );
};

const processFillEvent = (state: SimulationOrchestratorState, event: SimulationEvent) => {
  const fill = event.payload as SimulationFillRecord;
  if (state.fills.some((item) => item.fillId === fill.fillId)) return;
  state.fills.push(fill);
  const mutation: SimulationMutationCommand = {
    type: 'simulationFill',
    eventId: event.eventId,
    payload: fill as unknown as Record<string, unknown>,
  };
  state.mutations.push(mutation);
  state.input.execution?.onMutation?.(mutation);
  const scheduled = state.input.execution?.scheduledMutationsForFill?.(fill) ?? [];
  for (const item of scheduled) {
    const settlementEvent = createSimulationEvent({
      runId: state.input.runId,
      sequence: state.sequence++,
      type: item.type,
      phase: 'NavConfirmationSettlement',
      occurredAt: item.occurredAt,
      availableAt: item.availableAt,
      payload: item.payload,
    });
    state.queue.enqueue({ ...settlementEvent, eventId: item.eventId });
  }
};

const processCashSettlementEvent = (state: SimulationOrchestratorState, event: SimulationEvent) => {
  const mutation: SimulationMutationCommand = {
    type: 'cashSettlement',
    eventId: event.eventId,
    payload: event.payload as Record<string, unknown>,
  };
  state.mutations.push(mutation);
  state.input.execution?.onMutation?.(mutation);
};

const processCorporateActionEvent = (
  state: SimulationOrchestratorState,
  event: SimulationEvent,
) => {
  const fact = event.payload as BacktestCorporateActionFact;
  const result = state.input.corporateActionPort
    ? state.input.corporateActionPort.apply(fact, eventAvailableAt(event))
    : {
        applied: false as const,
        published: false as const,
        eventId: corporateActionEventId(fact, state.input.runId),
        code: 'RULE_REJECTED' as const,
        reason: '公司行动需要显式 corporateActionPort 才能接入 SimulationLedger',
      };
  state.corporateActionResults.push(result);
  if (!result.applied) {
    const code: SimulationReject['code'] =
      result.code === 'FUTURE_DATA' || result.code === 'DUPLICATE_EVENT'
        ? result.code
        : 'RULE_REJECTED';
    enqueueReject(state, event, {
      rejectionId: `${state.input.runId}:corporate-action:${result.eventId}`,
      code,
      reason: result.reason,
      ruleVersion: 'corporate-action-v1',
      occurredAt: event.occurredAt,
      availableAt: event.availableAt,
      inputFacts: [result.eventId],
    });
    return;
  }
  const mutation: SimulationMutationCommand = {
    type: 'corporateAction',
    eventId: result.eventId,
    payload: result.mutation as unknown as Record<string, unknown>,
  };
  state.mutations.push(mutation);
  state.input.execution?.onMutation?.(mutation);
};

const processSimulationEvent = (state: SimulationOrchestratorState, event: SimulationEvent) => {
  if (event.type === 'corporateAction') return processCorporateActionEvent(state, event);
  if (event.type === 'signalEvaluation') return processSignalEvent(state, event);
  if (event.type === 'targetIntent') return processTargetIntentEvent(state, event);
  if (event.type === 'orderValidation') return processOrderValidationEvent(state, event);
  if (event.type === 'simulationFill') return processFillEvent(state, event);
  if (event.type === 'cashSettlement') return processCashSettlementEvent(state, event);
};

export class DeterministicSimulationEngine {
  run(input: SimulationEngineInput): SimulationRunResult {
    const state: SimulationOrchestratorState = {
      input,
      queue: new SimulationEventQueue(),
      signals: [],
      intents: [],
      fills: [],
      rejects: [],
      mutations: [],
      corporateActionResults: [],
      edgeState: {},
      previousNumeric: new Map(),
      sequence: 0,
    };
    const ticks = input.ticks
      .map((tick, index) => ({ tick, index }))
      .filter(({ tick }) => !tick.timeframe || tick.timeframe === input.strategy.primaryTimeframe)
      .sort(
        (left, right) =>
          instant(left.tick.occurredAt) - instant(right.tick.occurredAt) ||
          left.index - right.index,
      );
    for (const { tick } of ticks) {
      state.queue.enqueue(
        createSimulationEvent({
          runId: input.runId,
          sequence: state.sequence++,
          type: 'signalEvaluation',
          phase: 'RiskSignalEvaluation',
          occurredAt: tick.occurredAt,
          availableAt: tick.availableAt ?? tick.occurredAt,
          payload: { tick },
        }),
      );
    }
    const corporateActions = [...(input.corporateActions ?? [])].sort((left, right) =>
      corporateActionEventId(left, input.runId).localeCompare(
        corporateActionEventId(right, input.runId),
      ),
    );
    for (const fact of corporateActions) {
      const event = createSimulationEvent({
        runId: input.runId,
        sequence: state.sequence++,
        type: 'corporateAction',
        phase: 'CorporateAction',
        occurredAt: fact.occurredAt,
        availableAt: fact.availableAt,
        payload: fact,
      });
      state.queue.enqueue({ ...event, eventId: corporateActionEventId(fact, input.runId) });
    }
    const processed: SimulationEvent[] = [];
    while (state.queue.size > 0) {
      const event = state.queue.dequeue();
      if (!event) break;
      processed.push(event);
      processSimulationEvent(state, event);
    }
    return {
      events: processed.sort(compareSimulationEvents),
      signals: state.signals,
      targetIntents: state.intents,
      fills: state.fills,
      rejects: state.rejects,
      mutations: state.mutations,
      corporateActionResults: state.corporateActionResults,
    };
  }
}

export const runDeterministicSimulation = (input: SimulationEngineInput) =>
  new DeterministicSimulationEngine().run(input);
