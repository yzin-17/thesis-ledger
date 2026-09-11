import {
  tradingCalendars,
  type TradingCalendar,
  type TradingMarket,
  type TradingSessionWindow,
} from './trading-calendar.js';
import { DecimalValue } from './decimal.js';

export type BacktestBarQuality = 'complete' | 'partial' | 'suspended' | 'stale' | 'unknown';
export type BacktestBarCompleteness = 'complete' | 'partial' | 'unavailable';

export interface BacktestMinuteBar {
  symbol: string;
  market: TradingMarket;
  timeframe: '1m';
  occurredAt: string;
  availableAt: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  amount?: string | undefined;
  provider?: string;
  providerRevision?: string;
  quality?: BacktestBarQuality | undefined;
  suspended?: boolean | undefined;
}

export interface DerivedBacktestBar {
  symbol: string;
  market: TradingMarket;
  timeframe: '5m' | '15m' | '30m' | '60m';
  occurredAt: string;
  availableAt: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  amount: string;
  provider?: string;
  providerRevision?: string;
  quality: BacktestBarQuality;
  completeness: BacktestBarCompleteness;
  expectedMinutes: number;
  observedMinutes: number;
  missingMinutes: number;
  isTail: boolean;
}

export interface AggregateMinuteBarsOptions {
  calendar?: TradingCalendar;
  includePartialTail?: boolean;
}

interface LocalInstant {
  date: string;
  minute: number;
}

interface Bucket {
  date: string;
  session: TradingSessionWindow;
  start: number;
  end: number;
  bars: BacktestMinuteBar[];
}

const timeframeMinutes: Record<DerivedBacktestBar['timeframe'], number> = {
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
};

const numberFormat = (timeZone: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    ...options,
  });

const localInstant = (value: string, timeZone: string): LocalInstant => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`无效 Bar 时间: ${value}`);
  const parts = Object.fromEntries(
    numberFormat(timeZone, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

const utcForLocalMinute = (date: string, minute: number, timeZone: string): Date => {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = date.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) throw new Error(`无效本地日期: ${date}`);
  const hour = Math.floor(minute / 60);
  const localMinute = minute % 60;
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, localMinute));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = localInstant(candidate.toISOString(), timeZone);
    const renderedUtc = Date.UTC(
      year,
      month - 1,
      day,
      Math.floor(rendered.minute / 60),
      rendered.minute % 60,
    );
    const wantedUtc = Date.UTC(year, month - 1, day, hour, localMinute);
    const offset = renderedUtc - wantedUtc;
    if (offset === 0) return candidate;
    candidate = new Date(candidate.getTime() - offset);
  }
  return candidate;
};

const bucketFor = (
  bar: BacktestMinuteBar,
  interval: number,
  calendar: TradingCalendar,
): Bucket | null => {
  const local = localInstant(bar.occurredAt, calendar.timezone);
  const sessions = calendar.sessionsForDate(bar.occurredAt);
  const session = sessions.find(({ start, end }) => local.minute >= start && local.minute < end);
  if (!session) return null;
  const start = session.start + Math.floor((local.minute - session.start) / interval) * interval;
  const end = Math.min(start + interval, session.end);
  return { date: local.date, session, start, end, bars: [] };
};

const bucketKey = (bucket: Bucket) =>
  `${bucket.date}:${bucket.session.start}-${bucket.session.end}:${bucket.start}-${bucket.end}`;

const validateBar = (bar: BacktestMinuteBar) => {
  if (bar.timeframe !== '1m') throw new Error('分钟聚合只接受 1m Bar');
  try {
    DecimalValue.from(bar.open);
    DecimalValue.from(bar.high);
    DecimalValue.from(bar.low);
    DecimalValue.from(bar.close);
    DecimalValue.from(bar.volume);
  } catch {
    throw new Error('Bar OHLCV 必须是规范十进制字符串');
  }
};

const sortedBars = (bars: readonly BacktestMinuteBar[]) =>
  [...bars].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

const aggregateBucket = (
  bucket: Bucket,
  interval: number,
  calendar: TradingCalendar,
): DerivedBacktestBar => {
  const bars = sortedBars(bucket.bars);
  const observed = new Set<number>();
  for (const bar of bars) {
    const local = localInstant(bar.occurredAt, calendar.timezone);
    observed.add(local.minute);
  }
  const expectedMinutes = bucket.end - bucket.start;
  const observedMinutes = observed.size;
  const missingMinutes = Math.max(0, expectedMinutes - observedMinutes);
  const lastInput = bars.at(-1)!;
  const isTail = bucket.end > localInstant(lastInput.occurredAt, calendar.timezone).minute + 1;
  let quality: BacktestBarQuality = 'complete';
  if (bars.some((bar) => bar.suspended || bar.quality === 'suspended')) quality = 'suspended';
  else if (bars.some((bar) => bar.quality === 'stale')) quality = 'stale';
  else if (bars.some((bar) => bar.quality === 'unknown')) quality = 'unknown';
  else if (missingMinutes > 0 || bars.some((bar) => bar.quality === 'partial')) quality = 'partial';
  const amount = bars.reduce(
    (sum, bar) => sum.plus(bar.amount ?? DecimalValue.from(bar.close).times(bar.volume)),
    DecimalValue.from('0'),
  );
  const high = bars.reduce((best, bar) => {
    const value = DecimalValue.from(bar.high);
    return value.compareTo(best) > 0 ? value : best;
  }, DecimalValue.from(bars[0]!.high));
  const low = bars.reduce((best, bar) => {
    const value = DecimalValue.from(bar.low);
    return value.compareTo(best) < 0 ? value : best;
  }, DecimalValue.from(bars[0]!.low));
  const volume = bars.reduce((sum, bar) => sum.plus(bar.volume), DecimalValue.from('0'));
  const outputEnd = utcForLocalMinute(bucket.date, bucket.end, calendar.timezone).toISOString();
  const result: DerivedBacktestBar = {
    symbol: lastInput.symbol,
    market: lastInput.market,
    timeframe: `${interval}m` as DerivedBacktestBar['timeframe'],
    occurredAt: outputEnd,
    availableAt: bars.reduce(
      (latest, bar) => (bar.availableAt > latest ? bar.availableAt : latest),
      bars[0]!.availableAt,
    ),
    open: bars[0]!.open,
    high: high.toString(),
    low: low.toString(),
    close: lastInput.close,
    volume: volume.toString(),
    amount: amount.toString(),
    quality,
    completeness: quality === 'complete' ? 'complete' : 'partial',
    expectedMinutes,
    observedMinutes,
    missingMinutes,
    isTail,
  };
  if (bars[0]!.provider && bars.every((bar) => bar.provider === bars[0]!.provider)) {
    result.provider = bars[0]!.provider;
  }
  if (
    bars[0]!.providerRevision &&
    bars.every((bar) => bar.providerRevision === bars[0]!.providerRevision)
  ) {
    result.providerRevision = bars[0]!.providerRevision;
  }
  return result;
};

export const aggregateMinuteBars = (
  bars: readonly BacktestMinuteBar[],
  timeframe: DerivedBacktestBar['timeframe'],
  options: AggregateMinuteBarsOptions = {},
): DerivedBacktestBar[] => {
  if (bars.length === 0) return [];
  const calendar = options.calendar ?? tradingCalendars[bars[0]!.market];
  if (!calendar) throw new Error(`没有 ${bars[0]!.market} 的交易日历`);
  const interval = timeframeMinutes[timeframe];
  if (!interval) throw new Error(`不支持派生周期: ${timeframe}`);
  const first = bars[0]!;
  for (const bar of bars) {
    validateBar(bar);
    if (bar.market !== first.market || bar.symbol !== first.symbol) {
      throw new Error('同一聚合批次不能混合市场或标的');
    }
    if (new Date(bar.availableAt).getTime() < new Date(bar.occurredAt).getTime()) {
      throw new Error('availableAt 不能早于 occurredAt');
    }
  }
  const buckets = new Map<string, Bucket>();
  const seen = new Set<string>();
  for (const bar of sortedBars(bars)) {
    const key = `${bar.symbol}:${bar.occurredAt}`;
    if (seen.has(key)) throw new Error(`重复的分钟 Bar: ${bar.occurredAt}`);
    seen.add(key);
    const bucket = bucketFor(bar, interval, calendar);
    if (!bucket) continue;
    const keyForBucket = bucketKey(bucket);
    const existing = buckets.get(keyForBucket) ?? bucket;
    existing.bars.push(bar);
    buckets.set(keyForBucket, existing);
  }
  const result = [...buckets.values()]
    .sort((left, right) => {
      const leftAt = utcForLocalMinute(left.date, left.end, calendar.timezone).getTime();
      const rightAt = utcForLocalMinute(right.date, right.end, calendar.timezone).getTime();
      return leftAt - rightAt;
    })
    .map((bucket) => aggregateBucket(bucket, interval, calendar));
  if (options.includePartialTail === false) return result.filter((bar) => !bar.isTail);
  return result;
};

export const directDailyBars = <T>(bars: readonly T[]): T[] => [...bars];
