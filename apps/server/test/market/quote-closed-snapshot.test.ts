import { afterEach, expect, it, vi } from 'vitest';
import { quoteSchema, type Quote } from '@thesis-ledger/schemas';
import { projectMarketQuoteSession, type MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import { observeQuoteTime, projectQuoteSessionFreshness } from '../../src/market/market-quote-cache-policy.js';
import { MarketQuoteReader } from '../../src/market/market-quote-reader.js';
import { MarketPeriodCalendarReader } from '../../src/market/market-period-calendar-reader.js';
import { quoteControlFixture } from './quote-control-fixture.js';
const now = new Date('2026-11-08T17:45:00Z');
const calendar: MarketPeriodCalendarFact = {
  market: 'CN', timezone: 'Asia/Shanghai', revision: 'verified', availableAt: '2026-01-01T00:00:00Z',
  coverageStart: '2026-10-25', coverageEnd: '2026-11-23', sessions: [
    { tradingDate: '2026-11-06', startAt: '2026-11-06T05:00:00Z', endAt: '2026-11-06T07:00:00Z' },
    { tradingDate: '2026-11-09', startAt: '2026-11-09T01:30:00Z', endAt: '2026-11-09T03:30:00Z' },
  ],
};
const quote: Quote = {
  version: 1, symbol: '510300.SH', price: 4.124, open: 4.113, high: 4.169, low: 4.095,
  previousClose: 4.195, volume: null, amount: null, provider: 'tencent', stale: true,
  freshness: 'stale', marketTime: '2026-11-06T08:14:52+00:00', fetchedAt: '2026-11-08T17:32:17Z',
};
afterEach(() => vi.restoreAllMocks());

it('最近交易日的休市快照解除纯年龄告警，原值和双时钟保持', () => {
  const observed = observeQuoteTime(quote, now.getTime());
  const result = projectQuoteSessionFreshness(observed, projectMarketQuoteSession(quote, calendar, now));
  expect(result).toMatchObject({ stale: false, freshness: 'delayed', sessionContext: { session: 'closed_snapshot', latestTradingDate: '2026-11-06' } });
  expect(result.staleReason).toBeUndefined();
  expect(result.price).toBe(quote.price); expect(result.marketTime).toBe(quote.marketTime); expect(result.fetchedAt).toBe(quote.fetchedAt);
  expect(quoteSchema.parse(JSON.parse(JSON.stringify(result)))).toMatchObject({ sessionContext: result.sessionContext });
  expect(quote.stale).toBe(true);
});
it('休市不覆盖刷新失败、冷却和来源明确异常', () => {
  const context = projectMarketQuoteSession(quote, calendar, now);
  for (const code of ['timeout', 'rate_limited', 'upstream_stale', 'cache_unavailable', 'request_budget_cooldown'] as const) {
    const value = { ...quote, staleReason: { code, message: '保留真实原因' } };
    expect(projectQuoteSessionFreshness(value, context)).toMatchObject({ stale: true, staleReason: value.staleReason });
  }
  expect(projectQuoteSessionFreshness({ ...quote, refreshFailure: 'fetch_failed' }, context).stale).toBe(true);
  const old = { ...quote, marketTime: '2026-11-05T07:00:00Z' };
  expect(projectQuoteSessionFreshness(observeQuoteTime(old, now.getTime()), projectMarketQuoteSession(old, calendar, now)).stale).toBe(true);
});
it('真实报价读取接入日历，严格新鲜度门禁不因展示质量投影而放宽', async () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  try {
    const read = vi.spyOn(MarketPeriodCalendarReader.prototype, 'read').mockResolvedValue({ status: 'ready', calendar });
    const dsa = { marketCacheContextV3: vi.fn(quoteControlFixture), get: vi.fn() };
    const client = { get: vi.fn(async () => JSON.stringify(quote)) };
    const reader = new MarketQuoteReader(dsa as never, { client } as never);
    expect(await reader.getQuote(quote.symbol)).toMatchObject({ stale: false, sessionContext: { session: 'closed_snapshot' } });
    await expect(reader.getQuote(quote.symbol, { allowStale: false })).rejects.toThrow('要求新鲜行情');
    expect(read).toHaveBeenCalledTimes(1); expect(dsa.get).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
