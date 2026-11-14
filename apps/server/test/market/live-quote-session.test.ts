import { expect, it } from 'vitest';
import { liveQuoteInCurrentSession } from '../../src/market/market-live-quote-session.js';

it('只接受此刻开放会话内的实际行情，拒绝盘前、午休前与边界报价', () => {
  const session = { state: 'open' as const, date: '2026-11-12', sessions: [
    { tradingDate: '2026-11-12', startAt: '2026-11-12T01:30:00Z', endAt: '2026-11-12T03:30:00Z' },
    { tradingDate: '2026-11-12', startAt: '2026-11-12T05:00:00Z', endAt: '2026-11-12T07:00:00Z' },
  ] };
  const at = new Date('2026-11-12T05:00:10Z');
  expect(liveQuoteInCurrentSession(session, '2026-11-12T05:00:00Z', at)).toBe(true);
  for (const time of ['01:29:59', '03:29:59', '04:59:59', '05:00:11', '07:00:00'])
    expect(liveQuoteInCurrentSession(session, `2026-11-12T${time}Z`, at)).toBe(false);
  expect(liveQuoteInCurrentSession({ ...session, state: 'unknown' }, '2026-11-12T05:00:00Z', at)).toBe(false);
});
