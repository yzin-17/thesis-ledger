import type { MarketPeriodCalendarFact, MarketPeriodCompletion } from './market-period-types.js';

export const MARKET_MINUTE_RULE_VERSION = 'market-minute-aggregation-v1' as const;
export const MAX_MARKET_MINUTE_INPUT_POINTS = 64_000;
export type MarketMinutePeriod = '5m' | '15m' | '30m' | '60m';
export const marketMinuteDurations: Record<MarketMinutePeriod, number> = {
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
};
export interface MarketMinuteInputPoint {
  timestamp: string;
  availableAt: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  amount: number | null;
  completionStatus: MarketPeriodCompletion;
}
export interface MarketMinuteDisplayPoint extends MarketMinuteInputPoint {
  tradingDate: string;
  bucketEndAt: string;
  observedEndAt: string;
  expectedMinutes: number;
  observedMinutes: number;
  openingBoundaryPoints: number;
}
type Failure =
  | 'minute_calendar_invalid'
  | 'minute_budget_exceeded'
  | 'minute_duplicate'
  | 'minute_value_invalid'
  | 'minute_session_mismatch'
  | 'minute_coverage_incomplete'
  | 'minute_future';
export class MarketMinuteAggregationError extends Error {
  constructor(readonly code: Failure) {
    super(code);
  }
}
const fail = (code: Failure): never => {
  throw new MarketMinuteAggregationError(code);
};
const instant = (value: string) => {
  const result = Date.parse(value);
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(result))
    fail('minute_value_invalid');
  return result;
};

function indexInput(points: readonly MarketMinuteInputPoint[], asOf: number) {
  if (points.length > MAX_MARKET_MINUTE_INPUT_POINTS) fail('minute_budget_exceeded');
  const index = new Map<number, MarketMinuteInputPoint>();
  for (const point of points) {
    const time = instant(point.timestamp);
    if (time % 60_000 || !/T\d{2}:\d{2}:00(?:\.0+)?(?:Z|[+-]\d{2}:\d{2})$/.test(point.timestamp))
      fail('minute_value_invalid');
    if (index.has(time)) fail('minute_duplicate');
    const prices = [point.open, point.high, point.low, point.close];
    if (
      prices.some((price) => !Number.isFinite(price) || price <= 0) ||
      point.high < Math.max(...prices) ||
      point.low > Math.min(...prices) ||
      [point.volume, point.amount].some(
        (value) => value !== null && (!Number.isFinite(value) || value < 0),
      )
    )
      fail('minute_value_invalid');
    if (
      instant(point.availableAt) > asOf ||
      time - 60_000 > asOf ||
      (point.completionStatus === 'complete' && time > asOf)
    )
      fail('minute_future');
    index.set(time, point);
  }
  return index;
}

/** Session计划同时约束覆盖与原始点预算，开盘边界不计入连续分钟数。 */
export function marketMinuteBuckets(input: {
  calendar: MarketPeriodCalendarFact;
  timeframe: MarketMinutePeriod;
  includeOpeningBoundary: boolean;
}) {
  const minutes = marketMinuteDurations[input.timeframe];
  if (!minutes) fail('minute_value_invalid');
  const { calendar } = input;
  const zones = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };
  if (
    !calendar.revision ||
    !['CN', 'HK', 'US'].includes(calendar.market) ||
    calendar.timezone !== zones[calendar.market] ||
    calendar.coverageStart > calendar.coverageEnd
  )
    fail('minute_calendar_invalid');
  const result: Array<{
    start: number;
    end: number;
    tradingDate: string;
    openingBoundary: boolean;
  }> = [];
  let previousEnd = Number.NEGATIVE_INFINITY;
  let previousDay = '';
  let pointBudget = 0;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: calendar.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateOf = (value: number) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(value))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  for (const session of calendar.sessions) {
    const start = instant(session.startAt),
      end = instant(session.endAt);
    if (
      start % 60_000 ||
      end % 60_000 ||
      start >= end ||
      start < previousEnd ||
      session.tradingDate < calendar.coverageStart ||
      session.tradingDate > calendar.coverageEnd ||
      dateOf(start) !== session.tradingDate ||
      dateOf(end - 1) !== session.tradingDate
    )
      fail('minute_calendar_invalid');
    const openingBoundary = input.includeOpeningBoundary && previousDay !== session.tradingDate;
    pointBudget += (end - start) / 60_000 + Number(openingBoundary);
    if (pointBudget > MAX_MARKET_MINUTE_INPUT_POINTS) fail('minute_budget_exceeded');
    for (let time = start; time < end; time += minutes * 60_000)
      result.push({
        start: time,
        end: Math.min(time + minutes * 60_000, end),
        tradingDate: session.tradingDate,
        openingBoundary: openingBoundary && time === start,
      });
    previousEnd = end;
    previousDay = session.tradingDate;
  }
  return result;
}

const sum = (points: readonly MarketMinuteInputPoint[], field: 'volume' | 'amount') => {
  if (points.some((point) => point[field] === null)) return null;
  const result = points.reduce((total, point) => total + point[field]!, 0);
  if (!Number.isFinite(result)) fail('minute_value_invalid');
  return result;
};

function minuteBucketCompletion(observed: readonly MarketMinuteInputPoint[], end: number, cutoff: number): MarketPeriodCompletion {
  if (observed.some((point) => point.completionStatus === 'unknown')) return 'unknown';
  if (end <= cutoff && observed.every((point) => point.completionStatus === 'complete')) return 'complete';
  return 'incomplete';
}

/** 消费区间末端分钟事实；不生成补零分钟，不跨Session合成，不读取来源。 */
export function aggregateMarketMinutes(input: {
  calendar: MarketPeriodCalendarFact;
  timeframe: MarketMinutePeriod;
  includeOpeningBoundary: boolean;
  evaluationAsOf: string;
  cutoffAt?: string | undefined;
  coverageThrough?: string | undefined;
  points: readonly MarketMinuteInputPoint[];
}): MarketMinuteDisplayPoint[] {
  const asOf = instant(input.evaluationAsOf);
  const requestedCutoff = input.cutoffAt === undefined ? undefined : instant(input.cutoffAt);
  const cutoff = Math.min(
    asOf,
    requestedCutoff ?? asOf,
    input.coverageThrough === undefined ? asOf : instant(input.coverageThrough),
  );
  if (instant(input.calendar.availableAt) > asOf) fail('minute_future');
  const buckets = marketMinuteBuckets(input);
  const index = indexInput(input.points, asOf);
  if (requestedCutoff !== undefined)
    for (const time of index.keys()) if (time > requestedCutoff) fail('minute_future');
  const used = new Set<number>();
  const result: MarketMinuteDisplayPoint[] = [];
  for (const bucket of buckets) {
    if (bucket.start > cutoff) continue;
    const observed: MarketMinuteInputPoint[] = [];
    let regularMinutes = 0;
    let boundaryPoints = 0;
    if (bucket.openingBoundary && index.has(bucket.start)) {
      observed.push(index.get(bucket.start)!);
      used.add(bucket.start);
      boundaryPoints = 1;
    }
    for (let end = bucket.start + 60_000; end <= bucket.end; end += 60_000) {
      const point = index.get(end);
      if (!point && end <= cutoff) fail('minute_coverage_incomplete');
      if (!point) continue;
      observed.push(point);
      used.add(end);
      regularMinutes++;
    }
    if (!observed.length) continue;
    const completionStatus = minuteBucketCompletion(observed, bucket.end, cutoff);
    result.push({
      timestamp: new Date(bucket.start).toISOString(),
      availableAt: new Date(
        Math.max(...observed.map((point) => instant(point.availableAt))),
      ).toISOString(),
      tradingDate: bucket.tradingDate,
      bucketEndAt: new Date(bucket.end).toISOString(),
      observedEndAt: observed.at(-1)!.timestamp,
      expectedMinutes: (bucket.end - bucket.start) / 60_000,
      observedMinutes: regularMinutes,
      openingBoundaryPoints: boundaryPoints,
      open: observed[0]!.open,
      close: observed.at(-1)!.close,
      high: Math.max(...observed.map((point) => point.high)),
      low: Math.min(...observed.map((point) => point.low)),
      volume: sum(observed, 'volume'),
      amount: sum(observed, 'amount'),
      completionStatus,
    });
  }
  if (used.size !== index.size) fail('minute_session_mismatch');
  return result;
}
