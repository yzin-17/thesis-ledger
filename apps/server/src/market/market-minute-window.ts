import { BadRequestException } from '@nestjs/common';
import {
  marketCivilInstant,
  marketMinuteBuckets,
  marketMinuteDurations,
  MAX_MARKET_MINUTE_INPUT_POINTS,
  type MarketMinutePeriod,
  type MarketPeriodCalendarFact,
} from '@thesis-ledger/domain';
import { indicatorWarmupPoints, type MarketIndicatorRequest } from './market-indicator-window.js';

export function minuteWindowBudget(
  limit: number,
  timeframe: MarketMinutePeriod,
  requests: readonly MarketIndicatorRequest[],
) {
  const calculationLimit = limit + indicatorWarmupPoints(requests);
  if (
    calculationLimit > 3650 ||
    (calculationLimit + 1) * marketMinuteDurations[timeframe] + 391 > MAX_MARKET_MINUTE_INPUT_POINTS
  )
    throw new BadRequestException('分钟可见窗口及预热超过完整来源窗口预算，请缩小窗口');
  return calculationLimit;
}

/** 日历查询可以更宽；实际读取只包含计算所需桶所在的完整交易日。 */
export function planMinuteWindow(input: {
  calendar: MarketPeriodCalendarFact;
  timeframe: MarketMinutePeriod;
  limit: number;
  requests: readonly MarketIndicatorRequest[];
  evaluationAsOf: string;
  cutoffAt?: string | undefined;
  start?: string | undefined;
}) {
  const calculationLimit = minuteWindowBudget(input.limit, input.timeframe, input.requests);
  const cutoff = Math.min(
    Date.parse(input.evaluationAsOf),
    Date.parse(input.cutoffAt ?? input.evaluationAsOf),
  );
  const days = [
    ...new Set(
      input.calendar.sessions
        .filter((session) => Date.parse(session.startAt) <= cutoff)
        .map((session) => session.tradingDate),
    ),
  ];
  let rawPoints = 0;
  const retained = new Set<string>();
  for (const day of [...days].reverse()) {
    const count =
      input.calendar.sessions
        .filter((session) => session.tradingDate === day)
        .reduce(
          (total, session) =>
            total + (Date.parse(session.endAt) - Date.parse(session.startAt)) / 60_000,
          0,
        ) + Number(input.calendar.market === 'HK');
    if (rawPoints + count > MAX_MARKET_MINUTE_INPUT_POINTS) break;
    rawPoints += count;
    retained.add(day);
  }
  const calendar = {
    ...input.calendar,
    sessions: input.calendar.sessions.filter((session) => retained.has(session.tradingDate)),
  };
  const buckets = marketMinuteBuckets({
    calendar,
    timeframe: input.timeframe,
    includeOpeningBoundary: calendar.market === 'HK',
  }).filter((bucket) => bucket.start <= cutoff);
  const startTime =
    input.start === undefined
      ? Number.NEGATIVE_INFINITY
      : Date.parse(marketCivilInstant(input.start, 0, calendar.timezone));
  const visible = buckets.filter((bucket) => bucket.start >= startTime).slice(-input.limit);
  const first = visible[0];
  if (!first) return undefined;
  const firstIndex = buckets.indexOf(first);
  const warmup = calculationLimit - input.limit;
  if (firstIndex < warmup || (!input.start && visible.length < input.limit)) return undefined;
  const selected = buckets.slice(Math.max(0, firstIndex - warmup - 1));
  const start = selected[0]!.tradingDate,
    end = selected.at(-1)!.tradingDate;
  const sessions = calendar.sessions.filter(
    (session) => session.tradingDate >= start && session.tradingDate <= end,
  );
  const minutePointCount =
    sessions.reduce(
      (total, session) =>
        total + (Date.parse(session.endAt) - Date.parse(session.startAt)) / 60_000,
      0,
    ) +
    new Set(sessions.map((session) => session.tradingDate)).size * Number(calendar.market === 'HK');
  return {
    start,
    end,
    minutePointCount,
    calendarRevision: calendar.revision,
    calculationLimit,
    visibleLimit: input.limit,
    visibleStart: input.start,
    calendar: { ...calendar, coverageStart: start, coverageEnd: end, sessions },
  };
}
