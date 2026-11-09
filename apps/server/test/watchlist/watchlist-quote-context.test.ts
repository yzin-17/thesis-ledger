import { expect, it } from 'vitest';
import { projectMarketQuoteSession } from '@thesis-ledger/domain';
import type { Quote } from '@thesis-ledger/schemas';
const calendar = {
  market: 'CN' as const,
  timezone: 'Asia/Shanghai',
  revision: 'test',
  availableAt: '2026-01-01T00:00:00Z',
  coverageStart: '2026-11-06',
  coverageEnd: '2026-11-09',
  sessions: [
    { tradingDate: '2026-11-06', startAt: '2026-11-06T01:30:00Z', endAt: '2026-11-06T07:00:00Z' },
    { tradingDate: '2026-11-09', startAt: '2026-11-09T01:30:00Z', endAt: '2026-11-09T07:00:00Z' },
  ],
};
const quote = { marketTime: '2026-11-06T08:14:52Z', stale: true } as Quote;
it('周末最近结束时段的快照有日历依据，原质量与时间保持', () => {
  expect(
    projectMarketQuoteSession(quote, calendar, new Date('2026-11-06T17:00:00Z')),
  ).toMatchObject({ session: 'closed_snapshot', calendarRevision: 'test' });
  expect(quote.stale).toBe(true);
  expect(
    projectMarketQuoteSession(quote, calendar, new Date('2026-11-09T01:31:00Z')).session,
  ).toBe('trading');
});
it('旧交易日、日历缺失、未来及未知来源时间不能升格为休市快照', () => {
  expect(
    projectMarketQuoteSession(
      { ...quote, marketTime: '2026-11-05T08:00:00Z' },
      calendar,
      new Date('2026-11-06T17:00:00Z'),
    ).session,
  ).toBe('older_snapshot');
  for (const marketTime of [null, '2026-11-10T08:00:00Z'])
    expect(
      projectMarketQuoteSession(
        { ...quote, marketTime },
        calendar,
        new Date('2026-11-06T17:00:00Z'),
      ).session,
    ).toBe('unknown');
  expect(projectMarketQuoteSession(quote, null, new Date('2026-11-06T17:00:00Z')).session).toBe(
    'unknown',
  );
});
it('港美股按来源市场时区与日历判断，节假日及夏令时不按周末猜测', () => {
  const us = {
    ...calendar,
    market: 'US' as const,
    coverageStart: '2026-11-25', coverageEnd: '2026-11-27',
    timezone: 'America/New_York',
    sessions: [
      { tradingDate: '2026-11-25', startAt: '2026-11-25T14:30:00Z', endAt: '2026-11-25T21:00:00Z' },
    ],
  };
  const q = { ...quote, symbol: 'SPY.US', marketTime: '2026-11-25T21:01:00Z' };
  expect(projectMarketQuoteSession(q, us, new Date('2026-11-26T18:00:00Z')).session).toBe(
    'closed_snapshot',
  );
  const hk = {
    ...calendar,
    market: 'HK' as const,
    timezone: 'Asia/Hong_Kong',
    sessions: [
      { tradingDate: '2026-11-06', startAt: '2026-11-06T01:30:00Z', endAt: '2026-11-06T08:00:00Z' },
    ],
  };
  expect(
    projectMarketQuoteSession(
      quote,
      hk,
      new Date('2026-11-06T17:00:00Z'),
    ).session,
  ).toBe('closed_snapshot');
});
it('返回经过日历验证的下一时段边界，包括周末后的开市', () => {
  expect(
    projectMarketQuoteSession(quote, calendar, new Date('2026-11-07T03:00:00Z')).nextBoundaryAt,
  ).toBe('2026-11-09T01:30:00Z');
  expect(
    projectMarketQuoteSession(
      { ...quote, marketTime: '2026-11-09T02:00:00Z' },
      calendar,
      new Date('2026-11-09T03:00:00Z'),
    ).nextBoundaryAt,
  ).toBe('2026-11-09T07:00:00Z');
});
