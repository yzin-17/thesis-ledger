import type {
  NumericEvaluation, SimulationEngineInput, SimulationExpressionContext, SimulationPositionState, SimulationTick,
} from './backtest-simulation.js';

/** 两条求值路径复用相同的价格、持仓和事件上下文。 */
export function simulationExpressionContext(
  input: SimulationEngineInput, tick: SimulationTick, positionState: SimulationPositionState | undefined,
  previousNumeric?: ReadonlyMap<string, NumericEvaluation>,
): SimulationExpressionContext {
  return {
    tick, sourceSeries: input.sourceSeries,
    ...(positionState ? { positionState } : {}),
    ...(input.indicatorSeries ? { indicatorSeries: input.indicatorSeries } : {}),
    ...(previousNumeric ? { previousNumeric } : {}),
    ...(input.corporateActionSignalFacts ? { corporateActionSignals: {
      facts: input.corporateActionSignalFacts, symbol: input.strategy.executionInstrument.symbol,
      market: input.strategy.executionInstrument.market,
    } } : {}),
  };
}
