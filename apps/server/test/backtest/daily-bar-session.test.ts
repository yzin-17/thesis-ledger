import { tradingCalendarFromFact } from '@thesis-ledger/domain';
import { describe, expect, it } from 'vitest';
import { dailyBarSessionTimes } from '../../src/backtest/backtest-daily-bar-session.js';

const calendar = tradingCalendarFromFact({
  market: 'CN',
  timezone: 'Asia/Shanghai',
  provider: 'exchange-calendars',
  providerRevision: 'test',
  availableAt: '2024-01-01T00:00:00Z',
  sessions: [
    { startMinute: 570, endMinute: 690 },
    { startMinute: 780, endMinute: 900 },
  ],
  sessionOverrides: [],
  holidays: ['2024-01-01'],
  range: { start: '2024-01-01', end: '2024-01-31' },
});

describe('dailyBarSessionTimes', () => {
  it('uses the frozen calendar to materialize a daily bar open instant', () => {
    expect(
      dailyBarSessionTimes(
        {
          timeframe: '1d',
          occurredAt: '2024-01-02T00:00:00Z',
          availableAt: '2024-01-02T07:00:00Z',
        },
        calendar,
      ),
    ).toEqual({
      openedAt: '2024-01-02T01:30:00.000Z',
      openAvailableAt: '2024-01-02T01:30:00.000Z',
    });
  });

  it('preserves explicit point-in-time fields', () => {
    expect(
      dailyBarSessionTimes(
        {
          timeframe: '1d',
          occurredAt: '2024-01-02T00:00:00Z',
          openedAt: '2024-01-02T01:31:00Z',
          openAvailableAt: '2024-01-02T01:32:00Z',
        },
        calendar,
      ),
    ).toEqual({
      openedAt: '2024-01-02T01:31:00Z',
      openAvailableAt: '2024-01-02T01:32:00Z',
    });
  });

  it('rejects daily bars outside the frozen trading calendar', () => {
    expect(() =>
      dailyBarSessionTimes(
        {
          timeframe: '1d',
          occurredAt: '2024-01-01T00:00:00Z',
          availableAt: '2024-01-01T07:00:00Z',
        },
        calendar,
      ),
    ).toThrow('日线 Bar 不属于冻结 Calendar 交易日');
  });
});
