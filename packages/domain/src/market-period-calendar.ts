import type {
  MarketPeriodAggregationInput,
  MarketPeriodCalendarFact,
} from './market-period-types.js';

export class MarketPeriodAggregationError extends Error {
  constructor(
    readonly code:
      | 'invalid_input'
      | 'calendar_unavailable'
      | 'price_basis_mismatch'
      | 'conflicting_fact'
      | 'future_evidence',
    message: string,
  ) {
    super(message);
    this.name = 'MarketPeriodAggregationError';
  }
}

export const periodDate = (value: string): string => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new MarketPeriodAggregationError('invalid_input', '无效交易日');
  return value;
};

export const periodInstant = (value: string): number => {
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new MarketPeriodAggregationError('invalid_input', '无效 UTC/offset 时间');
  periodDate(value.slice(0, 10));
  return Date.parse(value);
};

const dateInTimezone = (value: number, formatter: Intl.DateTimeFormat): string => {
  const parts = new Map(
    formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`;
};

export interface MarketPeriodTradingDay {
  tradingDate: string;
  periodDate: string;
  startAt: number;
  endAt: number;
}

export interface MarketPeriodBucket {
  startDate: string;
  endDate: string;
  days: readonly MarketPeriodTradingDay[];
  calendarComplete: boolean;
}

export const marketPeriodTradingDays = (
  calendar: MarketPeriodCalendarFact,
): MarketPeriodTradingDay[] => {
  const timezones = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };
  if (
    calendar.timezone !== timezones[calendar.market] ||
    !calendar.revision.trim() ||
    periodDate(calendar.coverageStart) > periodDate(calendar.coverageEnd)
  )
    throw new MarketPeriodAggregationError(
      'calendar_unavailable',
      '日历市场、时区、版本或完整覆盖无效',
    );
  const sessions = [...calendar.sessions].sort(
    (a, b) => periodInstant(a.startAt) - periodInstant(b.startAt),
  );
  const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  const marketFormatter = new Intl.DateTimeFormat('en-US', {
    ...dateOptions,
    timeZone: calendar.timezone,
  });
  const periodFormatter = new Intl.DateTimeFormat('en-US', {
    ...dateOptions,
    timeZone: 'Asia/Shanghai',
  });
  const days = new Map<string, MarketPeriodTradingDay>();
  const seen = new Set<string>();
  let previousEnd = -Infinity;
  for (const session of sessions) {
    const tradingDate = periodDate(session.tradingDate);
    const startAt = periodInstant(session.startAt);
    const endAt = periodInstant(session.endAt);
    if (
      startAt >= endAt ||
      tradingDate < calendar.coverageStart ||
      tradingDate > calendar.coverageEnd ||
      dateInTimezone(startAt, marketFormatter) !== tradingDate ||
      dateInTimezone(endAt - 1, marketFormatter) !== tradingDate
    )
      throw new MarketPeriodAggregationError(
        'calendar_unavailable',
        '计划 Session 与交易日/覆盖不一致',
      );
    const key = `${tradingDate}:${startAt}:${endAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (startAt < previousEnd)
      throw new MarketPeriodAggregationError('conflicting_fact', '计划 Session 重叠');
    previousEnd = endAt;
    const shanghaiDate = dateInTimezone(startAt, periodFormatter);
    const existing = days.get(tradingDate);
    if (existing && existing.periodDate !== shanghaiDate)
      throw new MarketPeriodAggregationError(
        'calendar_unavailable',
        '同一证券交易日跨越周期日期边界',
      );
    days.set(tradingDate, {
      tradingDate,
      periodDate: shanghaiDate,
      startAt: existing?.startAt ?? startAt,
      endAt,
    });
  }
  return [...days.values()].sort((a, b) => a.tradingDate.localeCompare(b.tradingDate));
};

export const marketPeriodCivilBucket = (
  date: string,
  timeframe: '1w' | '1mo' | '1y',
  offset = 0,
): [string, string] => {
  periodDate(date);
  if (!Number.isInteger(offset))
    throw new MarketPeriodAggregationError('invalid_input', '周期偏移必须是整数');
  const cursor = new Date(`${date}T00:00:00Z`);
  if (timeframe === '1w') {
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7) + offset * 7);
    const start = cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 6);
    return [start, cursor.toISOString().slice(0, 10)];
  }
  if (timeframe === '1mo') {
    cursor.setUTCDate(1);
    cursor.setUTCMonth(cursor.getUTCMonth() + offset);
    const start = cursor.toISOString().slice(0, 10);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1, 0);
    return [start, cursor.toISOString().slice(0, 10)];
  }
  cursor.setUTCFullYear(cursor.getUTCFullYear() + offset, 0, 1);
  const year = cursor.toISOString().slice(0, 4);
  return [`${year}-01-01`, `${year}-12-31`];
};

export const marketPeriodBuckets = (
  input: Pick<MarketPeriodAggregationInput, 'calendar' | 'timeframe' | 'anchorTradingDate'>,
  days: readonly MarketPeriodTradingDay[],
): MarketPeriodBucket[] => {
  if (input.timeframe === '5d') {
    const anchor = days.findIndex((day) => day.tradingDate === input.anchorTradingDate);
    if (anchor < 0)
      throw new MarketPeriodAggregationError('calendar_unavailable', '五日锚点不是计划交易日');
    const buckets: MarketPeriodBucket[] = [];
    for (let end = anchor; end >= 0; end -= 5) {
      const group = days.slice(Math.max(0, end - 4), end + 1);
      buckets.push({
        startDate: group[0]!.tradingDate,
        endDate: group.at(-1)!.tradingDate,
        days: group,
        calendarComplete: group.length === 5,
      });
    }
    return buckets.reverse();
  }
  const buckets = new Map<string, MarketPeriodTradingDay[]>();
  for (const day of days) {
    const [start, end] = marketPeriodCivilBucket(day.periodDate, input.timeframe);
    const key = `${start}:${end}`;
    const group = buckets.get(key) ?? [];
    group.push(day);
    buckets.set(key, group);
  }
  return [...buckets].map(([key, group]) => {
    const [startDate, endDate] = key.split(':') as [string, string];
    return {
      startDate,
      endDate,
      days: group,
      calendarComplete:
        input.calendar.coverageStart <= startDate && input.calendar.coverageEnd >= endDate,
    };
  });
};
