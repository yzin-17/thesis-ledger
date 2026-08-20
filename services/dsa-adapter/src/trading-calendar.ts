import { cnTradingCalendar } from '@thesis-ledger/domain';

export interface TradingCalendarEntry {
  date: string;
  market: 'CN' | 'HK' | 'US';
  open: boolean;
  sessions: Array<{ start: string; end: string }>;
}

export const defaultCnTradingDay = (date: string): TradingCalendarEntry => {
  const open = cnTradingCalendar.isTradingDay(`${date}T12:00:00+08:00`);
  return {
    date,
    market: 'CN',
    open,
    sessions: open
      ? [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' },
        ]
      : [],
  };
};

export const missingRanges = (availableDates: readonly string[], start: string, end: string) => {
  const available = new Set(availableDates);
  const missing: string[] = [];
  for (
    let cursor = new Date(`${start}T00:00:00Z`);
    cursor <= new Date(`${end}T00:00:00Z`);
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    if (defaultCnTradingDay(date).open && !available.has(date)) missing.push(date);
  }
  return missing;
};
