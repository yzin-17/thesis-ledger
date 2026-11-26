import {
  isAvailableForDecisionAt,
  type BacktestAvailability,
} from './backtest-observation-clock.js';
import type { TradingCalendar, TradingSessionWindow } from './trading-calendar.js';

export interface BacktestSessionCalendar {
  calendar: TradingCalendar;
  availability: BacktestAvailability;
}

const minuteFormatters = new Map<string, Intl.DateTimeFormat>();
export const backtestSessionMinute = (at: number, timezone: string) => {
  let formatter = minuteFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    minuteFormatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(at)).map((part) => [part.type, part.value]),
  );
  return (
    Number(parts.hour) * 60 +
    Number(parts.minute) +
    Number(parts.second) / 60 +
    new Date(at).getUTCMilliseconds() / 60000
  );
};

const validSessions = (sessions: readonly TradingSessionWindow[]) =>
  sessions.length > 0 &&
  sessions.every(
    (session, index) =>
      Number.isFinite(session.start) &&
      Number.isFinite(session.end) &&
      session.start >= 0 &&
      session.end <= 1440 &&
      session.start < session.end &&
      (index === 0 || sessions[index - 1]!.end <= session.start),
  );

/** 本时钟只消费冻结日历；调用者仍须认证行情已完成。 */
export function backtestSessionClock(
  source: BacktestSessionCalendar | undefined,
  at: string,
):
  | {
      status: 'available';
      tradingDate: string;
      minute: number;
      sessions: readonly TradingSessionWindow[];
      elapsedMinutes: number;
      withinFirstHour: boolean;
    }
  | { status: 'unavailable'; reason: string } {
  const unavailable = (reason: string) => ({ status: 'unavailable' as const, reason });
  const now = Date.parse(at);
  if (!Number.isFinite(now)) return unavailable('INVALID_TIME');
  if (!source || !isAvailableForDecisionAt(source.availability, at))
    return unavailable('CALENDAR_NOT_VISIBLE');
  const day = source.calendar.status(at);
  if (day.reason === 'calendar-unavailable') return unavailable('CALENDAR_COVERAGE');
  if (!day.open) return unavailable('NON_TRADING_DAY');
  const sessions = source.calendar.sessionsForDate(at);
  if (!validSessions(sessions)) return unavailable('SESSIONS_INVALID');
  const minute = backtestSessionMinute(now, source.calendar.timezone);
  if (!sessions.some((session) => minute > session.start && minute <= session.end))
    return unavailable('OUTSIDE_SESSION');
  const elapsedMinutes = minute - sessions[0]!.start;
  return {
    status: 'available',
    tradingDate: day.date,
    minute,
    sessions,
    elapsedMinutes,
    withinFirstHour: elapsedMinutes <= 60,
  };
}
