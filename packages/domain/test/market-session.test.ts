import { expect, it } from 'vitest';
import { projectMarketSession, marketTradingDate } from '../src/market-session.js';
import type { MarketPeriodCalendarFact } from '../src/market-period-types.js';
const calendar: MarketPeriodCalendarFact = {
  market: 'CN', timezone: 'Asia/Shanghai', revision: 'verified', availableAt: '2026-01-01T00:00:00Z',
  coverageStart: '2026-11-01', coverageEnd: '2026-11-15', sessions: ['2026-11-06', '2026-11-09'].flatMap((day) => [
    { tradingDate: day, startAt: day + 'T01:30:00Z', endAt: day + 'T03:30:00Z' },
    { tradingDate: day, startAt: day + 'T05:00:00Z', endAt: day + 'T07:00:00Z' },
  ]),
};
const state = (at: string) => projectMarketSession(calendar, new Date(at));
it('交易日和交易时段分别表达，午休与盘前不是非交易日', () => {
  expect(state('2026-11-09T01:00:00Z')).toMatchObject({ state: 'closed', tradingDayState: 'open', latestTradingDate: '2026-11-06' });
  expect(state('2026-11-09T01:30:00Z')).toMatchObject({ state: 'open', tradingDayState: 'open' });
  expect(state('2026-11-09T04:00:00Z')).toMatchObject({ state: 'closed', tradingDayState: 'open', latestTradingDate: '2026-11-09' });
  expect(state('2026-11-09T04:00:00Z').latestCompletedTradingDate).toBe('2026-11-06');
  expect(state('2026-11-09T07:00:00Z').latestCompletedTradingDate).toBe('2026-11-09');
  expect(state('2026-11-08T04:00:00Z')).toMatchObject({ state: 'closed', tradingDayState: 'closed' });
});
it('盘前来源归上一交易日，午休和收盘后归当日', () => {
  expect(marketTradingDate(state('2026-11-09T01:00:00Z'))).toBe('2026-11-06');
  expect(marketTradingDate(state('2026-11-09T04:00:00Z'))).toBe('2026-11-09');
  expect(marketTradingDate(state('2026-11-09T08:00:00Z'))).toBe('2026-11-09');
});
it('日历缺失、未覆盖和未来事实返回未知，不能落为休市', () => {
  const now = new Date('2027-01-04T02:00:00Z');
  expect(projectMarketSession(null, now)).toMatchObject({ state: 'unknown', tradingDayState: 'unknown' });
  expect(projectMarketSession(calendar, now)).toMatchObject({ state: 'unknown', reason: 'calendar_incomplete' });
  expect(projectMarketSession({ ...calendar, availableAt: '2026-12-01T00:00:00Z' }, new Date('2026-11-09T02:00:00Z'))).toMatchObject({ state: 'unknown', reason: 'calendar_future' });
  expect(marketTradingDate(projectMarketSession(null, now))).toBeUndefined();
});
it('会话事实决定提前收市及跨时区日期，不补常规午休', () => {
  const us = { ...calendar, market: 'US' as const, timezone: 'America/New_York', coverageStart: '2026-11-27', coverageEnd: '2026-11-28', sessions: [
    { tradingDate: '2026-11-27', startAt: '2026-11-27T14:30:00Z', endAt: '2026-11-27T18:00:00Z' },
  ] };
  expect(projectMarketSession(us, new Date('2026-11-27T18:00:00Z'))).toMatchObject({ state: 'closed', tradingDayState: 'open' });
  expect(projectMarketSession(us, new Date('2026-11-28T01:00:00Z')).date).toBe('2026-11-27');
});
