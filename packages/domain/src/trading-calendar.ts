export type TradingMarket = 'CN' | 'HK' | 'US';

export interface TradingDayStatus {
  market: TradingMarket;
  date: string;
  open: boolean;
  reason: 'open' | 'weekend' | 'exchange-holiday' | 'calendar-unavailable';
}

export interface TradingCalendar {
  readonly market: TradingMarket;
  readonly timezone: string;
  status(date: Date | string): TradingDayStatus;
  isTradingDay(date: Date | string): boolean;
}

const dateKeyInTimezone = (value: Date | string, timezone: string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('无效日期');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const weekdayInTimezone = (value: Date | string, timezone: string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('无效日期');
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
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

const cnExchangeClosures = new Set(
  [
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
  ].flatMap(([start, end]) => expandDateRange(start!, end)),
);

const cnCalendarCoverageYears = new Set(['2025', '2026']);

export class CnTradingCalendar implements TradingCalendar {
  readonly market = 'CN' as const;
  readonly timezone = 'Asia/Shanghai';

  status(date: Date | string): TradingDayStatus {
    const key = dateKeyInTimezone(date, this.timezone);
    const weekday = weekdayInTimezone(date, this.timezone);
    if (weekday === 'Sat' || weekday === 'Sun') {
      return { market: this.market, date: key, open: false, reason: 'weekend' };
    }
    if (!cnCalendarCoverageYears.has(key.slice(0, 4))) {
      return { market: this.market, date: key, open: false, reason: 'calendar-unavailable' };
    }
    if (cnExchangeClosures.has(key)) {
      return { market: this.market, date: key, open: false, reason: 'exchange-holiday' };
    }
    return { market: this.market, date: key, open: true, reason: 'open' };
  }

  isTradingDay(date: Date | string) {
    return this.status(date).open;
  }
}

export const cnTradingCalendar = new CnTradingCalendar();
