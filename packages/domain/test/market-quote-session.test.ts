import { expect, it } from 'vitest';
import { projectMarketQuoteSession } from '../src/market-quote-session.js';
import type { MarketPeriodCalendarFact } from '../src/market-period-types.js';
const calendar: MarketPeriodCalendarFact = {
  market: 'CN', timezone: 'Asia/Shanghai', revision: 'verified', availableAt: '2026-01-01T00:00:00Z',
  coverageStart: '2026-11-01', coverageEnd: '2026-11-15',
  sessions: ['2026-11-06', '2026-11-09'].flatMap((day) => [
    { tradingDate: day, startAt: `${day}T01:30:00Z`, endAt: `${day}T03:30:00Z` },
    { tradingDate: day, startAt: `${day}T05:00:00Z`, endAt: `${day}T07:00:00Z` },
  ]),
};
const evaluate = (at: string, marketTime = '2026-11-06T08:14:52Z', fact: MarketPeriodCalendarFact | null = calendar) =>
  projectMarketQuoteSession({ marketTime }, fact, new Date(at));

it('周末和开盘前按最近完成交易时段，原始时间不变', () => {
  for (const at of ['2026-11-07T03:00:00Z', '2026-11-08T17:45:00Z', '2026-11-09T01:29:59Z']) {
    expect(evaluate(at)).toMatchObject({ session: 'closed_snapshot', latestTradingDate: '2026-11-06', nextBoundaryAt: '2026-11-09T01:30:00Z' });
  }
  expect(evaluate('2026-11-09T01:30:00Z').session).toBe('trading');
});
it('午休使用当日上午末段，早盘停更和旧交易日不能认作最新快照', () => {
  expect(evaluate('2026-11-09T04:00:00Z', '2026-11-09T03:29:00Z')).toMatchObject({ session: 'closed_snapshot', latestTradingDate: '2026-11-09' });
  for (const source of ['2026-11-06T07:00:00Z', '2026-11-09T02:00:00Z'])
    expect(evaluate('2026-11-09T04:00:00Z', source).session).toBe('older_snapshot');
  expect(evaluate('2026-11-09T07:30:00Z', '2026-11-09T03:29:00Z').session).toBe('older_snapshot');
});
it('节假日使用日历事实，不能按周一至周五推断开市', () => {
  const holiday = { ...calendar, coverageStart: '2026-09-30', coverageEnd: '2026-10-07', sessions: [
    { tradingDate: '2026-09-30', startAt: '2026-09-30T05:00:00Z', endAt: '2026-09-30T07:00:00Z' },
  ] };
  expect(evaluate('2026-10-06T02:00:00Z', '2026-09-30T07:00:00Z', holiday)).toMatchObject({ session: 'closed_snapshot', latestTradingDate: '2026-09-30' });
});
it('美国提前收市和夏令时、香港分段时区均依据日历时间边界', () => {
  const us = { ...calendar, market: 'US' as const, timezone: 'America/New_York', coverageStart: '2026-11-27', coverageEnd: '2026-11-30', sessions: [
    { tradingDate: '2026-11-27', startAt: '2026-11-27T14:30:00Z', endAt: '2026-11-27T18:00:00Z' },
  ] };
  expect(evaluate('2026-11-27T18:01:00Z', '2026-11-27T18:00:00Z', us).session).toBe('closed_snapshot');
  const summer = { ...us, coverageStart: '2026-07-06', coverageEnd: '2026-07-07', sessions: [
    { tradingDate: '2026-07-06', startAt: '2026-07-06T13:30:00Z', endAt: '2026-07-06T20:00:00Z' },
  ] };
  expect(evaluate('2026-07-07T02:00:00Z', '2026-07-06T20:00:00Z', summer).latestTradingDate).toBe('2026-07-06');
  const hk = { ...calendar, market: 'HK' as const, timezone: 'Asia/Hong_Kong' };
  expect(evaluate('2026-11-09T04:00:00Z', '2026-11-09T03:30:00Z', hk).session).toBe('closed_snapshot');
});
it('缺少日历、覆盖不足、未来日历/来源和未知时点均不能推断正常休市', () => {
  expect(evaluate('2026-11-08T17:00:00Z', undefined, null)).toMatchObject({ session: 'unknown', reason: 'calendar_unavailable' });
  expect(evaluate('2026-12-01T17:00:00Z')).toMatchObject({ session: 'unknown', reason: 'calendar_incomplete' });
  expect(evaluate('2026-11-08T17:00:00Z', undefined, { ...calendar, availableAt: '2027-01-01T00:00:00Z' }).session).toBe('unknown');
  for (const marketTime of [null, 'invalid', '2026-11-10T07:00:00Z'])
    expect(projectMarketQuoteSession({ marketTime }, calendar, new Date('2026-11-08T17:00:00Z')).session).toBe('unknown');
});
