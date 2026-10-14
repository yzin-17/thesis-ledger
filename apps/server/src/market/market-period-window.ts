import {
  planMarketPeriodCalendarBuckets,
  type MarketPeriod,
  type MarketPeriodCalendarFact,
} from '@thesis-ledger/domain';
import { indicatorWarmupPoints, type MarketIndicatorRequest } from './market-indicator-window.js';
import { marketPitShanghaiTradingDateV3 } from './market-pit-decision-window-calendar-v3.js';

export class MarketPeriodWindowError extends Error {
  constructor(
    readonly code:
      | 'window_invalid'
      | 'daily_input_limit'
      | 'calculation_input_limit'
      | 'calendar_input_limit'
      | 'calendar_incomplete',
    message: string,
  ) {
    super(message);
    this.name = 'MarketPeriodWindowError';
  }
}
export interface MarketPeriodWindowInput {
  calendar: MarketPeriodCalendarFact;
  timeframe: MarketPeriod;
  anchorTradingDate?: string;
  evaluationAsOf: string;
  start?: string;
  end?: string;
  limit: number;
  indicators: readonly MarketIndicatorRequest[];
}
const MAX_POINTS = 3650;
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

function resolvePeriodWindowEnd(input: MarketPeriodWindowInput): string {
  const evaluationDate = marketPitShanghaiTradingDateV3(input.evaluationAsOf);
  const requestedEnd = input.end ?? evaluationDate;
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_POINTS ||
    !validDate(requestedEnd) ||
    (input.start !== undefined && (!validDate(input.start) || input.start > requestedEnd))
  )
    throw new MarketPeriodWindowError('window_invalid', '周期窗口日期或条数无效');
  let end = requestedEnd < evaluationDate ? requestedEnd : evaluationDate;
  if (input.timeframe === '5d') {
    if (
      !input.anchorTradingDate ||
      !validDate(input.anchorTradingDate) ||
      input.anchorTradingDate > end
    )
      throw new MarketPeriodWindowError(
        'window_invalid',
        '5d 锚点必须是不晚于窗口结束的有效交易日',
      );
    end = input.anchorTradingDate;
  }
  return end;
}

/** 只按实际 Session 规划完整桶与双层预算，不读时钟、行情或缓存。 */
export function planMarketPeriodWindow(input: MarketPeriodWindowInput) {
  const end = resolvePeriodWindowEnd(input);
  if (end < input.calendar.coverageStart || end > input.calendar.coverageEnd)
    throw new MarketPeriodWindowError('calendar_incomplete', '日历未覆盖实际请求结束日');
  const warmup = indicatorWarmupPoints(input.indicators);
  if (input.limit + warmup > MAX_POINTS)
    throw new MarketPeriodWindowError(
      'calculation_input_limit',
      '可见周期条数加预热不能超过 3650 个计算点',
    );
  const buckets = planMarketPeriodCalendarBuckets(input).filter(
    (bucket) => bucket.startDate <= end && bucket.tradingDates.some((date) => date <= end),
  );
  const candidates = buckets.filter(
    (bucket) => input.start === undefined || (input.start <= end && bucket.endDate >= input.start),
  );
  const visible = candidates.slice(-input.limit);
  const first = visible[0];
  const firstIndex = first ? buckets.indexOf(first) : buckets.length;
  const calculation = first
    ? buckets.slice(Math.max(0, firstIndex - warmup), firstIndex + visible.length)
    : [];
  if (calculation.some((bucket) => !bucket.calendarComplete))
    throw new MarketPeriodWindowError('calendar_incomplete', '日历未覆盖完整可见或预热周期桶');
  const dailyPointCount = calculation.reduce(
    (count, bucket) => count + bucket.tradingDates.filter((date) => date <= end).length,
    0,
  );
  if (dailyPointCount > MAX_POINTS)
    throw new MarketPeriodWindowError(
      'daily_input_limit',
      '实际周期窗口加预热需要超过 3650 个基础日线点',
    );
  return {
    visible,
    calculation,
    end,
    warmup,
    dailyPointCount,
    baseStart: calculation[0]?.startDate ?? null,
    baseEnd: calculation.length ? end : null,
    availableWarmup: first ? firstIndex - Math.max(0, firstIndex - warmup) : 0,
    calendarHasEarlierBucket: first !== undefined && firstIndex > 0,
  };
}
