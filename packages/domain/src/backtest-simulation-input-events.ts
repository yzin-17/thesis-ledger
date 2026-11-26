import { simulationObservationEvents } from './simulation-observation-ticks.js';
import type {
  createSimulationEvent,
  SimulationEngineInput,
  SimulationEvent,
  SimulationEventQueue,
  SimulationExecutionPhase,
  SimulationReject,
} from './backtest-simulation.js';

export function simulationInputEvents(
  input: SimulationEngineInput,
  sequence: number,
  createEvent: typeof createSimulationEvent,
): SimulationEvent[] {
  const ticks = input.ticks
    .map((tick, index) => ({ tick, index }))
    .filter(({ tick }) => !tick.timeframe || tick.timeframe === input.strategy.primaryTimeframe)
    .sort(
      (a, b) => Date.parse(a.tick.occurredAt) - Date.parse(b.tick.occurredAt) || a.index - b.index,
    );
  const events: SimulationEvent[] = ticks.map(({ tick }) =>
    createEvent({
      runId: input.runId,
      sequence: sequence++,
      type: 'signalEvaluation',
      phase: 'RiskSignalEvaluation',
      occurredAt: tick.occurredAt,
      availableAt: tick.availableAt ?? tick.occurredAt,
      payload: { tick },
    }),
  );
  const observations = simulationObservationEvents(input, sequence, createEvent);
  sequence += observations.length;
  events.push(...observations);
  for (const point of input.execution?.phases ?? [])
    events.push(
      createEvent({
        runId: input.runId,
        sequence: sequence++,
        type: 'executionPhase',
        phase: 'OrderMatch',
        occurredAt: point.occurredAt,
        availableAt: point.availableAt,
        payload: point,
      }),
    );
  return events;
}

export function enqueueExecutionPhaseFills(
  state: { input: SimulationEngineInput; queue: SimulationEventQueue; sequence: number },
  event: SimulationEvent,
  createEvent: typeof createSimulationEvent,
  reject: (value: SimulationReject) => void,
) {
  const point = event.payload as SimulationExecutionPhase;
  const result = state.input.execution?.matchPhase?.(point);
  for (const value of result?.rejects ?? []) reject(value);
  for (const fill of result?.fills ?? [])
    state.queue.enqueue(
      createEvent({
        runId: state.input.runId,
        sequence: state.sequence++,
        type: 'simulationFill',
        phase: 'OrderMatch',
        occurredAt: fill.occurredAt,
        availableAt: fill.availableAt,
        payload: fill,
      }),
    );
}
