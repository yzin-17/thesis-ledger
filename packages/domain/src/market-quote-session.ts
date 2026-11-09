import type { MarketPeriodCalendarFact } from './market-period-types.js';
import { projectMarketSession, marketSessionDate, type MarketSessionState } from './market-session.js';

export interface MarketQuoteSessionContext {
  session: 'closed_snapshot' | 'older_snapshot' | 'trading' | 'unknown';
  evaluatedAt: string;
  nextBoundaryAt?: string;
  calendarRevision?: string;
  latestTradingDate?: string;
  marketSession?: MarketSessionState;
  reason?: 'calendar_unavailable' | 'calendar_incomplete' | 'source_time_unknown' | 'source_time_future' | 'calendar_no_session' | 'calendar_future' | 'calendar_invalid';
}

/** 使用已验证的交易日历事实，覆盖非交易日、午休和跨时区会话。 */
export function projectMarketQuoteSession(
  quote: { marketTime: string | null },
  calendar: MarketPeriodCalendarFact | null,
  now: Date,
): MarketQuoteSessionContext {
  return projectQuoteSessionFromMarketState(quote, projectMarketSession(calendar, now));
}

export function projectQuoteSessionFromMarketState(quote: { marketTime: string | null }, marketSession: MarketSessionState): MarketQuoteSessionContext {
  const base = { evaluatedAt: marketSession.evaluatedAt, marketSession };
  const time = quote.marketTime ? Date.parse(quote.marketTime) : NaN;
  const now = Date.parse(marketSession.evaluatedAt);
  if (!Number.isFinite(time)) return { ...base, session: 'unknown', reason: 'source_time_unknown' };
  if (time > now) return { ...base, session: 'unknown', reason: 'source_time_future' };
  if (marketSession.state === 'unknown') return { ...base, session: 'unknown', reason: marketSession.reason ?? 'calendar_unavailable' };
  const { calendarRevision, nextBoundaryAt, latestTradingDate } = marketSession;
  const evidence = { ...base, ...(calendarRevision ? { calendarRevision } : {}), ...(nextBoundaryAt ? { nextBoundaryAt } : {}) };
  if (marketSession.state === 'open') return { ...evidence, session: 'trading' };
  const last = marketSession.sessions.filter((session) => Date.parse(session.endAt) <= now).at(-1);
  if (!last || !marketSession.timezone) return { ...evidence, session: 'unknown', reason: 'calendar_no_session' };
  const day = marketSessionDate(new Date(time), marketSession.timezone);
  const covered = time >= Date.parse(last.endAt) - 600_000 && day === latestTradingDate;
  return { ...evidence, ...(latestTradingDate ? { latestTradingDate } : {}), session: covered ? 'closed_snapshot' : 'older_snapshot' };
}
