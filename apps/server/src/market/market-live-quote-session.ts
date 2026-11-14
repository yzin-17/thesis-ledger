import type { MarketSession } from '@thesis-ledger/schemas';

/** 行情必须属于此刻实际开放的同一个会话，午休、盘前及上一时段快照不参与执行。 */
export function liveQuoteInCurrentSession(session: Pick<MarketSession, 'state' | 'date' | 'sessions'>, marketTime: string, at: Date) {
  if (session.state !== 'open' || !session.date) return false;
  const time = Date.parse(marketTime), now = at.getTime();
  return Number.isFinite(time) && time <= now && session.sessions.some((s) =>
    s.tradingDate === session.date && Date.parse(s.startAt) <= time &&
    time < Date.parse(s.endAt) && Date.parse(s.startAt) <= now && now < Date.parse(s.endAt));
}
