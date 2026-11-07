import type { Quote, WatchlistPrice } from '@thesis-ledger/schemas';
import type { MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import type { MarketPeriodCalendarResult } from '../market/market-period-calendar-projection.js';
import type { MarketPeriodCalendarReader } from '../market/market-period-calendar-reader.js';

type Context = NonNullable<WatchlistPrice['quoteContext']>;
export function projectWatchlistQuoteContext(
  quote: Quote,
  calendar: MarketPeriodCalendarFact | null,
  now: Date,
): Context {
  const base = { evaluatedAt: now.toISOString() };
  const time = quote.marketTime ? Date.parse(quote.marketTime) : NaN;
  if (!Number.isFinite(time)) return { ...base, session: 'unknown', reason: 'source_time_unknown' };
  if (time > now.getTime()) return { ...base, session: 'unknown', reason: 'source_time_future' };
  if (!calendar) return { ...base, session: 'unknown', reason: 'calendar_unavailable' };
  const sessions = calendar.sessions;
  const boundary = sessions
    .flatMap((s) => [s.startAt, s.endAt])
    .filter((at) => Date.parse(at) > now.getTime())
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const evidence = {
    ...base,
    calendarRevision: calendar.revision,
    ...(boundary ? { nextBoundaryAt: boundary } : {}),
  };
  if (
    sessions.some(
      (s) => Date.parse(s.startAt) <= now.getTime() && now.getTime() < Date.parse(s.endAt),
    )
  )
    return { ...evidence, session: 'trading' };
  const last = sessions.filter((s) => Date.parse(s.endAt) <= now.getTime()).at(-1);
  if (!last) return { ...evidence, session: 'unknown', reason: 'calendar_no_session' };
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: calendar.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(time));
  // 仅标记最近已结束时段结束前十分钟内或之后的来源快照，不能认证为官方收盘价。
  const session =
    time >= Date.parse(last.endAt) - 600_000 && day === last.tradingDate
      ? 'closed_snapshot'
      : 'older_snapshot';
  return { ...evidence, session };
}

/** 复用 DSA 的本地展示日历，不做远程报价、身份或权益探测。 */
export class WatchlistQuoteContext {
  private readonly calendars = new Map<
    string,
    { day: string; value: Promise<MarketPeriodCalendarResult> }
  >();
  constructor(private readonly reader?: MarketPeriodCalendarReader) {}
  async read(quote: Quote, now = new Date()): Promise<Context> {
    let market: 'CN' | 'HK' | 'US' = 'CN';
    if (quote.symbol.endsWith('.HK')) market = 'HK';
    else if (quote.symbol.endsWith('.US')) market = 'US';
    const timezone = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' }[market];
    if (!this.reader) return projectWatchlistQuoteContext(quote, null, now);
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    let calendar = this.calendars.get(market);
    if (calendar?.day !== day) {
      const start = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
      calendar = {
        day,
        value: this.reader.read({
          market,
          start,
          end: new Date(Date.parse(day + 'T00:00:00Z') + 14 * 86400000).toISOString().slice(0, 10),
          evaluationAsOf: now.toISOString(),
        }),
      };
      this.calendars.set(market, calendar);
    }
    const result = await calendar.value.catch(() => ({ status: 'unavailable' as const }));
    if (result.status !== 'ready') this.calendars.delete(market);
    return projectWatchlistQuoteContext(
      quote,
      result.status === 'ready' ? result.calendar : null,
      now,
    );
  }
}
