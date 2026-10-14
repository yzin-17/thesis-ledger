import { availabilityForDecision, type BacktestResearchClock } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';

/** 策略时钟与登记截止时钟分别生成；本函数仅投影原策略决策。 */
export function exchangeDecisionTicksV3(
  bars: readonly {
    occurredAt: string;
    availableAt: string;
    researchClock?: BacktestResearchClock;
  }[],
  timeframe: BacktestStrategy['primaryTimeframe'],
  dateAt: (at: string) => string,
) {
  return bars.map((bar) => ({
    occurredAt: availabilityForDecision(bar)!,
    tradingDate: dateAt(bar.occurredAt),
    availableAt: availabilityForDecision(bar)!,
    timeframe,
  }));
}
