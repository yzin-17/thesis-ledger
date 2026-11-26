import type { BacktestSeries } from './backtest-series.js';
import type { TradePlanCalendar } from './backtest-trade-plan-calendar.js';
import type { BacktestTradePlan, TradePlanAction } from './backtest-trade-plan-contract.js';
import { monthlyTradeAction } from './backtest-trade-monthly-action.js';
import { tradePlanMonthEnd } from './backtest-trade-month-end.js';
import { BacktestTradeVolatility } from './backtest-trade-volatility.js';
import {
  volatilityTradeAction,
  type TradePlanSizingReader,
} from './backtest-trade-volatility-action.js';

type AllocationConfiguration = Pick<BacktestTradePlan, 'volatilityTarget' | 'monthlyRebalance'>;
export type TradePlanAllocationResult =
  | { status: 'available'; action: TradePlanAction; description: string }
  | { status: 'unchanged' }
  | { status: 'unavailable'; reason: string };

/** 账户投影和调仓节奏独立于订单记忆；结果仍由主状态机投递和接受成交。 */
export class BacktestTradePlanAllocation {
  private readonly volatility: BacktestTradeVolatility | undefined;
  private readonly evaluatedMonths = new Set<string>();
  readonly enabled: boolean;
  constructor(
    private readonly config: AllocationConfiguration,
    private readonly prices: BacktestSeries,
    private readonly calendar: TradePlanCalendar | undefined,
    private readonly readSizing: TradePlanSizingReader | undefined,
  ) {
    if (config.volatilityTarget && config.monthlyRebalance)
      throw new Error('TRADE_PLAN_ALLOCATION_CONFLICT');
    this.enabled = Boolean(config.volatilityTarget || config.monthlyRebalance);
    this.volatility = config.volatilityTarget
      ? new BacktestTradeVolatility(config.volatilityTarget, prices, calendar)
      : undefined;
  }

  at(at: string, firstEntry: boolean): TradePlanAllocationResult {
    const input = { at, executionSymbol: this.prices.symbol, firstEntry };
    if (this.config.monthlyRebalance) {
      const monthEnd = tradePlanMonthEnd(this.calendar, at);
      if (monthEnd.status === 'unavailable') return monthEnd;
      if (!monthEnd.due) return { status: 'unchanged' };
      const month = monthEnd.date.slice(0, 7);
      if (this.evaluatedMonths.has(month)) return { status: 'unchanged' };
      this.evaluatedMonths.add(month);
      const result = monthlyTradeAction(
        { ...input, config: this.config.monthlyRebalance },
        this.calendar,
        this.readSizing,
      );
      return result.status === 'available'
        ? { ...result, description: '月末目标仓位调仓' }
        : result;
    }
    if (!this.volatility) return { status: 'unchanged' };
    const result = volatilityTradeAction(
      { ...input, volatility: this.volatility.at(at) },
      this.readSizing,
    );
    return result.status === 'available'
      ? { ...result, description: '每日目标波动率调仓' }
      : result;
  }
}
