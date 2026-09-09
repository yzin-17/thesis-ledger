export type TradingMarket = 'CN' | 'HK' | 'US';

export type TradingDayReason = 'open' | 'weekend' | 'exchange-holiday' | 'calendar-unavailable';

export interface TradingDayStatus {
  market: TradingMarket;
  date: string;
  open: boolean;
  reason: TradingDayReason;
}

export interface TradingSessionStatus {
  market: TradingMarket;
  date: string;
  open: boolean;
  reason: TradingDayReason | 'outside-session';
}

export interface TradingSessionWindow {
  start: number;
  end: number;
}

export interface TradingCalendar {
  readonly market: TradingMarket;
  readonly timezone: string;
  status(date: Date | string): TradingDayStatus;
  sessionStatus(date: Date | string): TradingSessionStatus;
  isTradingDay(date: Date | string): boolean;
  isTradingSession(date: Date | string): boolean;
  sessionsForDate(date: Date | string): readonly TradingSessionWindow[];
}

interface LocalDateTime {
  date: string;
  weekday: string;
  minute: number;
}

interface TradingSession {
  start: number;
  end: number;
}

interface ExchangeCalendarDefinition {
  market: TradingMarket;
  timezone: string;
  coverageYears: ReadonlySet<string>;
  closures: ReadonlySet<string>;
  sessions: readonly TradingSession[];
  shortenedSessions?: ReadonlyMap<string, readonly TradingSession[]>;
}

const localDateTime = (value: Date | string, timezone: string): LocalDateTime => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('无效日期');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday!,
    minute:
      Number(parts.hour) * 60 +
      Number(parts.minute) +
      Number(parts.second) / 60 +
      date.getMilliseconds() / 60_000,
  };
};

const expandDateRange = (start: string, end = start) => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const closures = (...ranges: ReadonlyArray<readonly [string, string?]>) =>
  new Set(ranges.flatMap(([start, end]) => expandDateRange(start, end)));

const regularSessions = (...ranges: ReadonlyArray<readonly [number, number]>) =>
  ranges.map(([start, end]) => ({ start, end }));

const coverageYears = new Set(['2025', '2026']);

const cnExchangeClosures = closures(
  ['2025-01-01'],
  ['2025-01-28', '2025-02-04'],
  ['2025-04-04', '2025-04-06'],
  ['2025-05-01', '2025-05-05'],
  ['2025-05-31', '2025-06-02'],
  ['2025-10-01', '2025-10-08'],
  ['2026-01-01', '2026-01-03'],
  ['2026-02-15', '2026-02-23'],
  ['2026-04-04', '2026-04-06'],
  ['2026-05-01', '2026-05-05'],
  ['2026-06-19', '2026-06-21'],
  ['2026-09-25', '2026-09-27'],
  ['2026-10-01', '2026-10-07'],
);

const hkExchangeClosures = closures(
  ['2025-01-01'],
  ['2025-01-29', '2025-01-31'],
  ['2025-04-04'],
  ['2025-04-18'],
  ['2025-04-21'],
  ['2025-05-01'],
  ['2025-05-05'],
  ['2025-07-01'],
  ['2025-10-01'],
  ['2025-10-07'],
  ['2025-10-29'],
  ['2025-12-25', '2025-12-26'],
  ['2026-01-01'],
  ['2026-02-17', '2026-02-19'],
  ['2026-04-03'],
  ['2026-04-06', '2026-04-07'],
  ['2026-05-01'],
  ['2026-05-25'],
  ['2026-06-19'],
  ['2026-07-01'],
  ['2026-10-01'],
  ['2026-10-19'],
  ['2026-12-25'],
);

const usExchangeClosures = closures(
  ['2025-01-01'],
  ['2025-01-20'],
  ['2025-02-17'],
  ['2025-04-18'],
  ['2025-05-26'],
  ['2025-06-19'],
  ['2025-07-04'],
  ['2025-09-01'],
  ['2025-11-27'],
  ['2025-12-25'],
  ['2026-01-01'],
  ['2026-01-19'],
  ['2026-02-16'],
  ['2026-04-03'],
  ['2026-05-25'],
  ['2026-06-19'],
  ['2026-07-03'],
  ['2026-09-07'],
  ['2026-11-26'],
  ['2026-12-25'],
);

const cnSessions = regularSessions([9 * 60 + 30, 11 * 60 + 30], [13 * 60, 15 * 60]);
const hkSessions = regularSessions([9 * 60 + 30, 12 * 60], [13 * 60, 16 * 60]);
const hkHalfDaySessions = regularSessions([9 * 60 + 30, 12 * 60]);
const usSessions = regularSessions([9 * 60 + 30, 16 * 60]);
const usEarlyCloseSessions = regularSessions([9 * 60 + 30, 13 * 60]);

class ExchangeTradingCalendar implements TradingCalendar {
  readonly market: TradingMarket;
  readonly timezone: string;

  constructor(private readonly definition: ExchangeCalendarDefinition) {
    this.market = definition.market;
    this.timezone = definition.timezone;
  }

  status(date: Date | string): TradingDayStatus {
    const local = localDateTime(date, this.timezone);
    if (local.weekday === 'Sat' || local.weekday === 'Sun') {
      return { market: this.market, date: local.date, open: false, reason: 'weekend' };
    }
    if (!this.definition.coverageYears.has(local.date.slice(0, 4))) {
      return { market: this.market, date: local.date, open: false, reason: 'calendar-unavailable' };
    }
    if (this.definition.closures.has(local.date)) {
      return { market: this.market, date: local.date, open: false, reason: 'exchange-holiday' };
    }
    return { market: this.market, date: local.date, open: true, reason: 'open' };
  }

  sessionStatus(date: Date | string): TradingSessionStatus {
    const day = this.status(date);
    if (!day.open) return day;
    const local = localDateTime(date, this.timezone);
    const sessions = this.definition.shortenedSessions?.get(local.date) ?? this.definition.sessions;
    const open = sessions.some(({ start, end }) => local.minute >= start && local.minute < end);
    return {
      market: this.market,
      date: local.date,
      open,
      reason: open ? 'open' : 'outside-session',
    };
  }

  sessionsForDate(date: Date | string): readonly TradingSessionWindow[] {
    const day = this.status(date);
    if (!day.open) return [];
    const local = localDateTime(date, this.timezone);
    return this.definition.shortenedSessions?.get(local.date) ?? this.definition.sessions;
  }

  isTradingDay(date: Date | string) {
    return this.status(date).open;
  }

  isTradingSession(date: Date | string) {
    return this.sessionStatus(date).open;
  }
}

export class CnTradingCalendar extends ExchangeTradingCalendar {
  constructor() {
    super({
      market: 'CN',
      timezone: 'Asia/Shanghai',
      coverageYears,
      closures: cnExchangeClosures,
      sessions: cnSessions,
    });
  }
}

export class HkTradingCalendar extends ExchangeTradingCalendar {
  constructor() {
    super({
      market: 'HK',
      timezone: 'Asia/Hong_Kong',
      coverageYears,
      closures: hkExchangeClosures,
      sessions: hkSessions,
      shortenedSessions: new Map([
        ['2025-01-28', hkHalfDaySessions],
        ['2025-12-24', hkHalfDaySessions],
        ['2025-12-31', hkHalfDaySessions],
        ['2026-02-16', hkHalfDaySessions],
        ['2026-12-24', hkHalfDaySessions],
        ['2026-12-31', hkHalfDaySessions],
      ]),
    });
  }
}

export class UsTradingCalendar extends ExchangeTradingCalendar {
  constructor() {
    super({
      market: 'US',
      timezone: 'America/New_York',
      coverageYears,
      closures: usExchangeClosures,
      sessions: usSessions,
      shortenedSessions: new Map([
        ['2025-07-03', usEarlyCloseSessions],
        ['2025-11-28', usEarlyCloseSessions],
        ['2025-12-24', usEarlyCloseSessions],
        ['2026-11-27', usEarlyCloseSessions],
        ['2026-12-24', usEarlyCloseSessions],
      ]),
    });
  }
}

export const cnTradingCalendar = new CnTradingCalendar();
export const hkTradingCalendar = new HkTradingCalendar();
export const usTradingCalendar = new UsTradingCalendar();

export const tradingCalendars: Readonly<Record<TradingMarket, TradingCalendar>> = {
  CN: cnTradingCalendar,
  HK: hkTradingCalendar,
  US: usTradingCalendar,
};

export const assetMarketsByTradingMarket: Readonly<Record<TradingMarket, readonly string[]>> = {
  CN: ['CN', 'SH', 'SZ', 'BJ', 'OF'],
  HK: ['HK'],
  US: ['US'],
};

export const tradingMarketForAssetMarket = (market: string): TradingMarket | null => {
  const matched = (
    Object.entries(assetMarketsByTradingMarket) as [TradingMarket, readonly string[]][]
  ).find(([, assetMarkets]) => assetMarkets.includes(market));
  return matched?.[0] ?? null;
};

export const openTradingMarketsAt = (date: Date | string): TradingMarket[] =>
  (Object.keys(tradingCalendars) as TradingMarket[]).filter((market) =>
    tradingCalendars[market].isTradingSession(date),
  );
