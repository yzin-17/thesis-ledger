import { marketPeriodBuckets, marketPeriodTradingDays } from './market-period-calendar.js';
import type { MarketPeriodAggregationInput } from './market-period-types.js';

export { marketPeriodCivilBucket } from './market-period-calendar.js';

export interface MarketPeriodCalendarBucket {
  startDate: string;
  endDate: string;
  endAt: string;
  tradingDates: readonly string[];
  calendarComplete: boolean;
}

/** 规划与聚合共用桶算法；此处不读取行情，也不决定服务端窗口与预算。 */
export function planMarketPeriodCalendarBuckets(
  input: Pick<MarketPeriodAggregationInput, 'calendar' | 'timeframe' | 'anchorTradingDate'>,
): readonly MarketPeriodCalendarBucket[] {
  return marketPeriodBuckets(input, marketPeriodTradingDays(input.calendar)).map((bucket) => ({
    startDate: bucket.startDate,
    endDate: bucket.endDate,
    endAt: new Date(bucket.days.at(-1)!.endAt).toISOString(),
    tradingDates: bucket.days.map((day) => day.tradingDate),
    calendarComplete: bucket.calendarComplete,
  }));
}
