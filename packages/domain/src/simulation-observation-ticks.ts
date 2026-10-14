import type {
  SimulationEngineInput,
  SimulationPhase,
  SimulationEventType,
  SimulationTick,
  createSimulationEvent,
} from './backtest-simulation.js';

/** 观察事件与策略决策独立；登记截止观察在同刻成交与结算之后执行。 */
export function simulationObservationEvents(
  input: SimulationEngineInput,
  sequence: number,
  createEvent: typeof createSimulationEvent,
) {
  const observations: {
    tick: SimulationTick;
    type: SimulationEventType;
    phase: SimulationPhase;
  }[] = [
    ...(input.portfolioValuation?.ticks ?? []).map((tick) => ({
      tick,
      type: 'portfolioValuation' as const,
      phase: 'PortfolioValuation' as const,
    })),
    ...(input.positionCheckpoint?.ticks ?? []).map((tick) => ({
      tick,
      type: 'positionCheckpoint' as const,
      phase: 'PositionCheckpoint' as const,
    })),
  ];
  return observations.map(({ tick, type, phase }, index) =>
    createEvent({
      runId: input.runId,
      sequence: sequence + index,
      type,
      phase,
      occurredAt: tick.occurredAt,
      availableAt: tick.availableAt ?? tick.occurredAt,
      payload: tick,
    }),
  );
}
