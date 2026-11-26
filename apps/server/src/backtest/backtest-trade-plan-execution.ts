import type { BacktestStrategy } from '@thesis-ledger/schemas';
import type {
  BacktestSeries,
  ExecutionCalendarFact,
  runExchangeSimulation,
} from '@thesis-ledger/domain';
import { activeBacktestTradePlan, tradingCalendarFromFact } from '@thesis-ledger/domain';

/** 计划使用与正式执行相同的冻结日历来源和研究时钟。 */
export function tradePlanExecutionInput(
  strategy: BacktestStrategy,
  prices: BacktestSeries,
  fact: ExecutionCalendarFact,
  researchDataAsOf?: string,
): Pick<
  Parameters<typeof runExchangeSimulation>[0]['exchange'],
  'tradePlanPrices' | 'tradePlanCalendar'
> {
  if (!activeBacktestTradePlan(strategy.tradePlan)) return {};
  return {
    tradePlanPrices: prices,
    tradePlanCalendar: {
      calendar: tradingCalendarFromFact(fact),
      availableAt: fact.availableAt,
      ...(researchDataAsOf
        ? { research: { basis: 'fixed-provider-snapshot', dataAsOf: researchDataAsOf } as const }
        : {}),
    },
  };
}
