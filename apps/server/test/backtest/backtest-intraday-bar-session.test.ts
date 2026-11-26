import { expect, it } from 'vitest';
import { tradingCalendarFromFact, type ExecutionCalendarFact } from '@thesis-ledger/domain';
import { intradayBarSessionWindow } from '../../src/backtest/backtest-intraday-bar-session.js';

const fact: ExecutionCalendarFact = {
  market: 'CN',
  timezone: 'Asia/Shanghai',
  provider: 'fixture',
  providerRevision: '1',
  availableAt: '2026-01-01T00:00:00Z',
  range: { start: '2026-01-01', end: '2026-12-31' },
  holidays: ['2026-07-02'],
  sessions: [
    { startMinute: 570, endMinute: 690 },
    { startMinute: 780, endMinute: 900 },
  ],
  sessionOverrides: [],
};
const calendar = tradingCalendarFromFact(fact);
const minute = {
  timeframe: '1m',
  occurredAt: '2026-07-01T01:30:00Z',
  quality: 'complete',
  availableAt: '2026-07-01T01:31:00Z',
  timestampConvention: 'interval-start',
  completionStatus: 'complete',
};
const aggregate = {
  timeframe: '30m',
  occurredAt: '2026-07-01T02:00:00Z',
  availableAt: '2026-07-01T02:00:00Z',
  quality: 'complete',
  completeness: 'complete',
  expectedMinutes: 30,
  observedMinutes: 30,
  missingMinutes: 0,
  isTail: false,
};

it('原始分钟开始和聚合结束标签产生相同真实区间，不提前或推迟一根', () => {
  expect(intradayBarSessionWindow(minute, calendar)).toEqual({
    openedAt: '2026-07-01T01:30:00.000Z',
    closedAt: '2026-07-01T01:31:00.000Z',
  });
  expect(intradayBarSessionWindow(aggregate, calendar)).toEqual({
    openedAt: '2026-07-01T01:30:00.000Z',
    closedAt: '2026-07-01T02:00:00.000Z',
  });
  expect(
    intradayBarSessionWindow(
      { ...minute, occurredAt: minute.availableAt, timestampConvention: 'interval-end' },
      calendar,
    ),
  ).toEqual(intradayBarSessionWindow(minute, calendar));
  for (const patch of [
    { quality: 'partial' },
    { quality: undefined },
    { timestampConvention: undefined },
    { timestampConvention: 'source-native' },
    { completionStatus: 'incomplete' },
    { availableAt: '2026-07-01T01:30:59Z' },
    { suspended: true },
    { occurredAt: '2026-07-01T01:30:01Z' },
    { occurredAt: '2026-07-02T01:30:00Z' },
    { occurredAt: '2026-07-01T04:00:00Z' },
  ]) {
    expect(() => intradayBarSessionWindow({ ...minute, ...patch }, calendar)).toThrow(
      'DATA_UNAVAILABLE',
    );
  }
});

it('聚合缺分钟、尾部未完成、时段错位及跨午休均不能伪造完整事实', () => {
  for (const patch of [
    { observedMinutes: 29 },
    { missingMinutes: 1 },
    { isTail: true },
    { completeness: 'partial' },
    { expectedMinutes: 31 },
    { expectedMinutes: 0 },
    { occurredAt: '2026-07-01T02:01:00Z' },
    { occurredAt: '2026-07-01T05:15:00Z' },
  ]) {
    expect(() => intradayBarSessionWindow({ ...aggregate, ...patch }, calendar)).toThrow(
      'DATA_UNAVAILABLE',
    );
  }
  expect(() =>
    intradayBarSessionWindow({ ...minute, occurredAt: '2027-07-01T01:30:00Z' }, calendar),
  ).toThrow('DATA_UNAVAILABLE');
});

it('提前收市的真实截短尾根和美国夏冬时制均服从冻结会话', () => {
  const early = tradingCalendarFromFact({
    ...fact,
    sessionOverrides: [{ date: '2026-07-01', sessions: [{ startMinute: 570, endMinute: 615 }] }],
  });
  expect(
    intradayBarSessionWindow(
      {
        ...aggregate,
        expectedMinutes: 15,
        observedMinutes: 15,
        occurredAt: '2026-07-01T02:15:00Z',
        availableAt: '2026-07-01T02:15:00Z',
      },
      early,
    ),
  ).toEqual({
    openedAt: '2026-07-01T02:00:00.000Z',
    closedAt: '2026-07-01T02:15:00.000Z',
  });
  const us = tradingCalendarFromFact({
    ...fact,
    market: 'US',
    timezone: 'America/New_York',
    holidays: [],
    sessions: [{ startMinute: 570, endMinute: 960 }],
  });
  for (const at of ['2026-07-01T13:30:00Z', '2026-11-02T14:30:00Z']) {
    expect(
      intradayBarSessionWindow(
        { ...minute, occurredAt: at, availableAt: new Date(Date.parse(at) + 60000).toISOString() },
        us,
      ).openedAt,
    ).toBe(new Date(at).toISOString());
  }
});
