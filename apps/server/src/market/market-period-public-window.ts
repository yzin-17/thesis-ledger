import {
  marketPeriodCivilBucket,
  MarketPeriodAggregationError,
  type MarketPeriod,
} from '@thesis-ledger/domain';
import { indicatorWarmupPoints, type MarketIndicatorRequest } from './market-indicator-window.js';
import { marketPitShanghaiTradingDateV3 } from './market-pit-decision-window-calendar-v3.js';
import { MarketPeriodWindowError } from './market-period-window.js';

const DAY = 86_400_000;
export interface PublicPeriodWindow {
  timeframe: MarketPeriod;
  start?: string;
  end?: string;
  limit: number;
  indicators: readonly MarketIndicatorRequest[];
}
const shiftDay = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

function civilBucket(date: string, timeframe: '1w' | '1mo' | '1y', offset = 0) {
  try {
    const bucket = marketPeriodCivilBucket(date, timeframe, offset);
    if (!bucket.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))
      throw new MarketPeriodWindowError('calendar_input_limit', '日历探测超出日期范围');
    return bucket;
  } catch (error) {
    if (error instanceof MarketPeriodAggregationError)
      throw new MarketPeriodWindowError('window_invalid', error.message);
    throw error;
  }
}

function visibleBucketUpperBound(input: PublicPeriodWindow, end: string) {
  if (!input.start) return input.limit;
  let count: number;
  if (input.timeframe === '5d') count = (Date.parse(end) - Date.parse(input.start)) / DAY + 1;
  else {
    const first = civilBucket(input.start, input.timeframe)[0];
    const last = civilBucket(end, input.timeframe)[0];
    if (input.timeframe === '1w') count = (Date.parse(last) - Date.parse(first)) / (7 * DAY) + 1;
    else if (input.timeframe === '1mo')
      count =
        (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 +
        Number(last.slice(5, 7)) -
        Number(first.slice(5, 7)) +
        1;
    else count = Number(last.slice(0, 4)) - Number(first.slice(0, 4)) + 1;
  }
  return Math.min(input.limit, count);
}

/** 探测范围只决定日历读取；基础预算仍按实际 Session 独立核验。 */
export function planPublicPeriodCalendar(
  input: PublicPeriodWindow,
  evaluationAsOf: string,
  expansion = 1,
) {
  const evaluationDate = marketPitShanghaiTradingDateV3(evaluationAsOf);
  const end = input.end && input.end < evaluationDate ? input.end : evaluationDate;
  if (input.start && input.start > end)
    throw new MarketPeriodWindowError('window_invalid', '开始日不得晚于实际评估结束日');
  const warmup = indicatorWarmupPoints(input.indicators);
  if (input.limit + warmup > 3650)
    throw new MarketPeriodWindowError('calculation_input_limit', '可见点与预热超过计算上限');
  let calendarStart: string;
  let calendarEnd: string;
  const visibleLimit = visibleBucketUpperBound(input, end);
  if (input.timeframe === '1y' && (visibleLimit + warmup + 1) * expansion > 55)
    throw new MarketPeriodWindowError('calendar_input_limit', '完整可见及预热日历超过 20000 日');
  if (input.timeframe === '5d') {
    calendarStart = shiftDay(end, -(visibleLimit + warmup + 1) * 10 * expansion - 14);
    if (input.start) {
      const fromStart = shiftDay(input.start, -(warmup + 1) * 10 * expansion - 14);
      if (fromStart > calendarStart) calendarStart = fromStart;
    }
    calendarEnd = end;
  } else {
    calendarStart = civilBucket(
      end,
      input.timeframe,
      -(visibleLimit + warmup + 1) * expansion + 1,
    )[0];
    if (input.start) {
      const fromStart = civilBucket(input.start, input.timeframe, -(warmup + 1) * expansion)[0];
      if (fromStart > calendarStart) calendarStart = fromStart;
    }
    calendarEnd = civilBucket(end, input.timeframe)[1];
  }
  if ((Date.parse(calendarEnd) - Date.parse(calendarStart)) / DAY + 1 > 20000)
    throw new MarketPeriodWindowError('calendar_input_limit', '完整可见及预热日历超过 20000 日');
  return { end, calendarRange: { start: calendarStart, end: calendarEnd } };
}
