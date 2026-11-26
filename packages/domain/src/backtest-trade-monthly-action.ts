import { DecimalValue as D } from './decimal.js';
import { computeSizing, readSizingEquity } from './backtest-sizing.js';
import { tradePlanMonthEnd } from './backtest-trade-month-end.js';
import type { TradePlanCalendar } from './backtest-trade-plan-calendar.js';
import type { BacktestTradePlan, TradePlanAction } from './backtest-trade-plan-contract.js';
import type { TradePlanSizingReader } from './backtest-trade-volatility-action.js';

export type TradePlanMonthlyConfig = NonNullable<BacktestTradePlan['monthlyRebalance']>;

/** 收盘权益权重的绝对偏离，按精确乘积比较百分点阈值，不舍入浮点权重。 */
export function monthlyTradeAction(
  input: {
    at: string;
    executionSymbol: string;
    firstEntry: boolean;
    config: TradePlanMonthlyConfig;
  },
  calendar: TradePlanCalendar | undefined,
  read: TradePlanSizingReader | undefined,
):
  | { status: 'available'; action: TradePlanAction }
  | { status: 'unchanged' }
  | { status: 'unavailable'; reason: string } {
  const monthEnd = tradePlanMonthEnd(calendar, input.at);
  if (monthEnd.status === 'unavailable') return monthEnd;
  if (!monthEnd.due) return { status: 'unchanged' };
  const unavailable = (reason: string) => ({
    status: 'unavailable' as const,
    reason: 'TRADE_PLAN_MONTHLY_' + reason,
  });
  if (!read) return unavailable('ACCOUNT_MISSING');
  const projection = read({
    intentId: 'trade-plan:account-projection:' + input.at,
    signalId: 'trade-plan:account-projection:' + input.at,
    executionSymbol: input.executionSymbol,
    side: 'buy',
    reason: 'signal',
    occurredAt: input.at,
    availableAt: input.at,
  });
  const sizingInput = {
    ...projection,
    rule: { type: 'targetWeight' as const, weight: input.config.targetEquityFraction },
  };
  delete sizingInput.priceResearchReference;
  const sizing = computeSizing(sizingInput);
  if (sizing.status !== 'available' && sizing.reasonCode !== 'QUANTITY_BELOW_LOT')
    return unavailable(sizing.reasonCode);
  const equity = readSizingEquity(sizingInput);
  if (!(equity instanceof D)) return unavailable(equity.reasonCode);
  const currentValue = D.from(projection.currentQuantity).times(sizingInput.price!.value);
  const targetValue = equity.times(input.config.targetEquityFraction);
  let difference = targetValue.minus(currentValue);
  if (difference.isNegative()) difference = difference.times('-1');
  if (difference.compareTo(equity.times(input.config.deviationThreshold)) < 0)
    return { status: 'unchanged' };
  if (sizing.status !== 'available') return unavailable(sizing.reasonCode);
  if (sizing.side === 'none') return { status: 'unchanged' };
  return {
    status: 'available',
    action: {
      kind: input.firstEntry ? 'entry' : 'rebalance',
      side: sizing.side,
      quantity: sizing.normalizedQuantity,
      targetWeight: input.config.targetEquityFraction,
      sizingFacts: [
        ...sizing.inputFacts,
        'monthly.lastTradingDate=' + monthEnd.lastTradingDate,
        'monthly.targetWeight=' + input.config.targetEquityFraction,
        'monthly.deviationThreshold=' + input.config.deviationThreshold,
        'monthly.absoluteValueDifference=' + difference.toString(),
      ],
    },
  };
}
