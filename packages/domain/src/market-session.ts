import type { MarketPeriodCalendarFact, MarketPeriodSession } from './market-period-types.js';
import type { TradingMarket } from './trading-calendar.js';

export const marketTimezones = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' } as const;
export interface MarketSessionState {
  state: 'open' | 'closed' | 'unknown';
  tradingDayState: 'open' | 'closed' | 'unknown';
  evaluatedAt: string;
  date?: string;
  market?: TradingMarket;
  timezone?: string;
  calendarRevision?: string;
  latestTradingDate?: string;
  latestCompletedTradingDate?: string;
  nextBoundaryAt?: string;
  reason?: 'calendar_unavailable' | 'calendar_incomplete' | 'calendar_future' | 'calendar_invalid';
  sessions: MarketPeriodSession[];
}

export function marketSessionDate(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** 市场状态只依赖带覆盖与可用时点的日历事实，不依赖任何报价或内置年度日历。 */
export function projectMarketSession(calendar: MarketPeriodCalendarFact | null, at: Date): MarketSessionState {
  const unknown = (reason: MarketSessionState['reason']): MarketSessionState => ({
    state: 'unknown', tradingDayState: 'unknown', evaluatedAt: at.toISOString(), sessions: [], ...(reason ? { reason } : {}),
  });
  if (!calendar) return unknown('calendar_unavailable');
  if (calendar.timezone !== marketTimezones[calendar.market] || !Number.isFinite(Date.parse(calendar.availableAt))) return unknown('calendar_invalid');
  if (Date.parse(calendar.availableAt) > at.getTime()) return unknown('calendar_future');
  const date = marketSessionDate(at, calendar.timezone);
  if (date < calendar.coverageStart || date > calendar.coverageEnd) return unknown('calendar_incomplete');
  const sessions = [...calendar.sessions].sort((a, b) => Date.parse(a.endAt) - Date.parse(b.endAt));
  const today = sessions.filter((session) => session.tradingDate === date);
  const latest = sessions.filter((session) => Date.parse(session.endAt) <= at.getTime()).at(-1);
  const dailyEnds = new Map(sessions.map((session) => [session.tradingDate, session.endAt]));
  const completedDay = [...dailyEnds].filter(([, end]) => Date.parse(end) <= at.getTime()).at(-1)?.[0];
  const next = sessions.flatMap((session) => [session.startAt, session.endAt])
    .filter((time) => Date.parse(time) > at.getTime()).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const open = today.some((session) => Date.parse(session.startAt) <= at.getTime() && at.getTime() < Date.parse(session.endAt));
  return {
    state: open ? 'open' : 'closed', tradingDayState: today.length ? 'open' : 'closed',
    evaluatedAt: at.toISOString(), date, market: calendar.market, timezone: calendar.timezone, calendarRevision: calendar.revision,
    ...(latest ? { latestTradingDate: latest.tradingDate } : {}), ...(next ? { nextBoundaryAt: next } : {}),
    ...(completedDay ? { latestCompletedTradingDate: completedDay } : {}),
    sessions: sessions.filter((session) => session.tradingDate === date || session.tradingDate === latest?.tradingDate),
  };
}

/** 来源时钟盘前归上一有效交易日，盘中、午休和盘后归当日。 */
export function marketTradingDate(session: MarketSessionState): string | undefined {
  if (session.state === 'unknown') return undefined;
  if (session.sessions.some((window) => window.tradingDate === session.date && Date.parse(window.startAt) <= Date.parse(session.evaluatedAt))) return session.date;
  return session.latestTradingDate;
}
