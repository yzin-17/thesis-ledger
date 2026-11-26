import { expect, it } from 'vitest';
import { tradePlanMonthEnd } from '../src/backtest-trade-month-end.js';
import { tradingCalendarFromFact, type ExecutionCalendarFact } from '../src/execution-rules.js';

const fact: ExecutionCalendarFact = {
  market: 'CN',
  timezone: 'Asia/Shanghai',
  provider: 'fixture',
  providerRevision: '1',
  availableAt: '2026-07-01T00:00:00Z',
  range: { start: '2026-07-01', end: '2026-12-31' },
  holidays: ['2026-07-31'],
  sessions: [
    { startMinute: 570, endMinute: 690 },
    { startMinute: 780, endMinute: 900 },
  ],
  sessionOverrides: [],
};
const source = (patch: Partial<ExecutionCalendarFact> = {}) => ({
  calendar: tradingCalendarFromFact({ ...fact, ...patch }),
  availableAt: fact.availableAt,
});

it('完整冻结月份决定最后交易日，排除月末假期与周末，非月末不补做', () => {
  expect(tradePlanMonthEnd(source(), '2026-07-30T07:00:00Z')).toMatchObject({
    due: true,
    lastTradingDate: '2026-07-30',
  });
  expect(tradePlanMonthEnd(source(), '2026-07-31T07:00:00Z')).toMatchObject({ due: false });
  expect(tradePlanMonthEnd(source(), '2026-07-29T07:00:00Z')).toMatchObject({ due: false });
  expect(tradePlanMonthEnd(source(), '2026-08-31T07:00:00Z')).toMatchObject({ due: true });
  expect(tradePlanMonthEnd(source(), '2026-10-30T07:00:00Z')).toMatchObject({
    due: true,
    lastTradingDate: '2026-10-30',
  });
  expect(tradePlanMonthEnd(source(), '2026-11-02T07:00:00Z')).toMatchObject({ due: false });
});
it('午休和盘中不等于完成收盘；提前收市读取会话覆盖', () => {
  expect(tradePlanMonthEnd(source(), '2026-07-30T04:00:00Z')).toMatchObject({
    reason: 'TRADE_PLAN_MONTH_END_CLOSE_NOT_COMPLETED',
  });
  expect(tradePlanMonthEnd(source(), '2026-07-30T06:59:59Z')).toMatchObject({
    reason: 'TRADE_PLAN_MONTH_END_CLOSE_NOT_COMPLETED',
  });
  const early = source({
    sessionOverrides: [{ date: '2026-07-30', sessions: [{ startMinute: 570, endMinute: 720 }] }],
  });
  expect(tradePlanMonthEnd(early, '2026-07-30T04:00:00Z')).toMatchObject({ due: true });
});
it('缺日历、未来来源和整月覆盖不足保持未知，固定快照仍核对冻结截点', () => {
  expect(tradePlanMonthEnd(undefined, '2026-07-30T07:00:00Z')).toMatchObject({
    reason: 'TRADE_PLAN_MONTH_END_CALENDAR_MISSING',
  });
  expect(
    tradePlanMonthEnd(
      source({ range: { start: '2026-07-02', end: '2026-07-31' } }),
      '2026-07-30T07:00:00Z',
    ),
  ).toMatchObject({ reason: 'TRADE_PLAN_MONTH_END_CALENDAR_COVERAGE' });
  expect(
    tradePlanMonthEnd(
      source({ range: { start: '2026-07-01', end: '2026-07-30' } }),
      '2026-07-30T07:00:00Z',
    ),
  ).toMatchObject({ reason: 'TRADE_PLAN_MONTH_END_CALENDAR_COVERAGE' });
  const future = { ...source(), availableAt: '2026-08-01T00:00:00Z' };
  expect(tradePlanMonthEnd(future, '2026-07-30T07:00:00Z')).toMatchObject({
    reason: 'TRADE_PLAN_MONTH_END_CALENDAR_NOT_VISIBLE',
  });
  expect(
    tradePlanMonthEnd(
      {
        ...future,
        research: { basis: 'fixed-provider-snapshot', dataAsOf: '2026-08-01T00:00:00Z' },
      },
      '2026-07-30T07:00:00Z',
    ),
  ).toMatchObject({ due: true });
});
it('美国夏令时和冬令时均用日历时区与会话，不采用固定 UTC 收盘', () => {
  const us = source({
    market: 'US',
    timezone: 'America/New_York',
    holidays: [],
    sessions: [{ startMinute: 570, endMinute: 960 }],
  });
  expect(tradePlanMonthEnd(us, '2026-07-31T19:59:59Z')).toMatchObject({
    reason: 'TRADE_PLAN_MONTH_END_CLOSE_NOT_COMPLETED',
  });
  expect(tradePlanMonthEnd(us, '2026-07-31T20:00:00Z')).toMatchObject({ due: true });
  expect(tradePlanMonthEnd(us, '2026-11-30T20:59:59Z')).toMatchObject({
    reason: 'TRADE_PLAN_MONTH_END_CLOSE_NOT_COMPLETED',
  });
  expect(tradePlanMonthEnd(us, '2026-11-30T21:00:00Z')).toMatchObject({ due: true });
});
