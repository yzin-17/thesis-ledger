import { readTradePlanCalendar, type TradePlanCalendar } from './backtest-trade-plan-calendar.js';

export type TradePlanMonthEndResult =
  | { status: 'available'; due: boolean; date: string; lastTradingDate: string }
  | { status: 'unavailable'; reason: string };

/** 月份边界只用于枚举日历事实，不能将自然月末推断成交易日。 */
export function tradePlanMonthEnd(
  source: TradePlanCalendar | undefined,
  at: string,
): TradePlanMonthEndResult {
  const visible = readTradePlanCalendar(source, at);
  const unavailable = (reason: string): TradePlanMonthEndResult => ({
    status: 'unavailable',
    reason: 'TRADE_PLAN_MONTH_END_' + reason,
  });
  if (visible.status === 'unavailable') return unavailable('CALENDAR_' + visible.reason);
  const calendar = visible.calendar;
  const today = calendar.status(at);
  if (today.reason === 'calendar-unavailable') return unavailable('CALENDAR_COVERAGE');
  const month = today.date.slice(0, 7);
  const cursor = new Date(month + '-01T12:00:00Z');
  let lastTradingDate: string | undefined;
  while (cursor.toISOString().startsWith(month)) {
    const date = cursor.toISOString().slice(0, 10);
    const day = calendar.status(cursor);
    if (day.date !== date || day.reason === 'calendar-unavailable')
      return unavailable('CALENDAR_COVERAGE');
    if (day.open) lastTradingDate = date;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (!lastTradingDate) return unavailable('NO_TRADING_DATE');
  if (today.date !== lastTradingDate)
    return { status: 'available', due: false, date: today.date, lastTradingDate };
  const sessions = calendar.sessionsForDate(at);
  if (!sessions.length) return unavailable('SESSIONS_MISSING');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: calendar.timezone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value]),
  );
  const minute = Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60;
  const close = Math.max(...sessions.map((session) => session.end));
  if (!Number.isFinite(close) || close <= 0) return unavailable('SESSIONS_INVALID');
  if (minute < close) return unavailable('CLOSE_NOT_COMPLETED');
  return { status: 'available', due: true, date: today.date, lastTradingDate };
}
