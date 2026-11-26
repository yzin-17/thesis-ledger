import { computeSizing, type SizingInput } from './backtest-sizing.js';
import type { SimulationTargetIntent } from './backtest-simulation.js';
import type { TradePlanAction } from './backtest-trade-plan-contract.js';
import type { TradePlanVolatilityResult } from './backtest-trade-volatility.js';

export type TradePlanSizingReader = (intent: SimulationTargetIntent) => SizingInput;

/** 读取决策时点账户投影并冻结目标差额；这里不投递订单、不读取后续开盘。 */
export function volatilityTradeAction(
  input: {
    at: string;
    executionSymbol: string;
    firstEntry: boolean;
    volatility: TradePlanVolatilityResult;
  },
  read: TradePlanSizingReader | undefined,
):
  | { status: 'available'; action: TradePlanAction }
  | { status: 'unchanged' }
  | { status: 'unavailable'; reason: string } {
  if (input.volatility.status === 'unavailable') return input.volatility;
  if (!read) return { status: 'unavailable', reason: 'TRADE_PLAN_VOLATILITY_ACCOUNT_MISSING' };
  const projection = read({
    intentId: 'trade-plan:account-projection:' + input.at,
    signalId: 'trade-plan:account-projection:' + input.at,
    executionSymbol: input.executionSymbol,
    side: 'buy',
    reason: 'signal',
    occurredAt: input.at,
    availableAt: input.at,
  });
  const targetInput = {
    ...projection,
    rule: { type: 'targetWeight' as const, weight: input.volatility.targetWeight },
  };
  delete targetInput.priceResearchReference;
  const sizing = computeSizing(targetInput);
  if (sizing.status !== 'available')
    return { status: 'unavailable', reason: 'TRADE_PLAN_VOLATILITY_' + sizing.reasonCode };
  if (sizing.side === 'none') return { status: 'unchanged' };
  return {
    status: 'available',
    action: {
      kind: input.firstEntry ? 'entry' : 'rebalance',
      side: sizing.side,
      quantity: sizing.normalizedQuantity,
      targetWeight: input.volatility.targetWeight,
      sizingFacts: [
        ...input.volatility.inputFacts,
        ...sizing.inputFacts,
        'volatility.targetQuantity=' + sizing.targetQuantity,
      ],
    },
  };
}
