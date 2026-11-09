import { marketCivilInstant, marketSessionDate, marketTimezones, projectMarketSession, tradingCalendars, type MarketPeriodCalendarFact, type TradingMarket } from '@thesis-ledger/domain';

/** 仅供受控测试生成历史日历样本；生产消费者不能使用此内置年度日历。 */
export async function controlledMarketSession(market: TradingMarket, at: Date) {
  const calendar = tradingCalendars[market];
  if (calendar.status(at).reason === 'calendar-unavailable') return projectMarketSession(null, at);
  const day = marketSessionDate(at, marketTimezones[market]);
  const center = Date.parse(day + 'T00:00:00Z');
  const fact: MarketPeriodCalendarFact = {
    market, timezone: calendar.timezone, revision: 'controlled-calendar', availableAt: '2020-01-01T00:00:00Z',
    coverageStart: new Date(center - 14 * 86400000).toISOString().slice(0, 10),
    coverageEnd: new Date(center + 14 * 86400000).toISOString().slice(0, 10), sessions: [],
  };
  const sessions = [];
  for (let offset = -14; offset <= 14; offset++) {
    const date = new Date(center + offset * 86400000).toISOString().slice(0, 10);
    for (const window of calendar.sessionsForDate(marketCivilInstant(date, 12 * 60, calendar.timezone))) sessions.push({
      tradingDate: date, startAt: marketCivilInstant(date, window.start, calendar.timezone), endAt: marketCivilInstant(date, window.end, calendar.timezone),
    });
  }
  return projectMarketSession({ ...fact, sessions }, at);
}
