import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { quoteSchema, type MarketSession, type Quote } from '@thesis-ledger/schemas';
import { MarketArenaValuationReader } from '../../src/market/market-arena-valuation-reader.js';
import { liveProtocolFixture } from './live-fixture.js';

const now = '2026-11-12T16:00:00.000Z';
const protocol = liveProtocolFixture({ startsOn: null, endsOn: null });
const instrument = {
  symbol: 'AAPL.US',
  assetType: 'STOCK' as const,
  acquiredOn: '2026-11-11',
  lastFillAt: '2026-11-12T15:58:00.000Z',
};
const session = (overrides: Partial<MarketSession> = {}): MarketSession => ({
  state: 'open',
  tradingDayState: 'open',
  evaluatedAt: now,
  date: '2026-11-12',
  latestTradingDate: '2026-11-12',
  sessions: [
    { tradingDate: '2026-11-12', startAt: '2026-11-12T14:30:00Z', endAt: '2026-11-12T21:00:00Z' },
  ],
  ...overrides,
});
const quote = (overrides: Partial<Quote> = {}): Quote =>
  quoteSchema.parse({
    version: 1,
    symbol: 'AAPL.US',
    open: 10,
    high: 11,
    low: 9,
    price: 10,
    previousClose: 10,
    volume: null,
    amount: null,
    stale: false,
    provider: 'fixture',
    marketTime: '2026-11-12T15:59:30.000Z',
    fetchedAt: now,
    freshness: 'live',
    units: { priceCurrency: 'USD', volume: 'share', turnoverCurrency: 'unknown' },
    ...overrides,
  });
function fixture(value = quote(), initial = session(), current = initial) {
  const market = {
    getQuote: vi.fn().mockResolvedValue(value),
    getSession: vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(current),
  };
  const actions = { read: vi.fn().mockResolvedValue({ verified: true }) };
  const reader = new MarketArenaValuationReader(market, actions as never);
  return { reader, market, actions };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

it('实时估值接受最大年龄边界，保留证据和双重会话读取', async () => {
  const f = fixture(quote({ marketTime: '2026-11-12T15:59:00.000Z' }));
  const result = await f.reader.read(protocol, [instrument]);
  expect(result).toMatchObject({
    prices: new Map([['AAPL.US', '10']]),
    marketTime: '2026-11-12T15:59:00.000Z',
    missing: {},
  });
  expect(f.market.getSession).toHaveBeenCalledTimes(2);
  expect(f.market.getQuote).toHaveBeenCalledWith('AAPL.US', {
    assetType: 'STOCK',
    allowStale: false,
  });
  expect(f.actions.read).toHaveBeenCalledWith(
    expect.objectContaining({ symbol: 'AAPL.US', previousDay: '2026-11-11' }),
    '2026-11-12',
  );
});

it.each<[string, Partial<Quote>]>([
  ['超过最大年龄一毫秒', { marketTime: '2026-11-12T15:58:59.999Z' }],
  ['报价来自未来', { marketTime: '2026-11-12T16:00:00.001Z' }],
  ['获取时间来自未来', { fetchedAt: '2026-11-12T16:00:00.001Z' }],
  ['早于最后成交', { marketTime: '2026-11-12T15:57:59.999Z' }],
  ['非实时', { freshness: 'delayed' }],
  ['行情陈旧', { stale: true }],
  ['刷新失败', { refreshFailure: 'fetch_failed' }],
  ['缺行情时点', { marketTime: null }],
  ['币种不符', { units: { priceCurrency: 'HKD', volume: 'share', turnoverCurrency: 'unknown' } }],
  ['代码不符', { symbol: 'MSFT.US' }],
  ['非正价格', { price: 0, low: 0 }],
])('%s 不产生估值价格', async (_label, overrides) => {
  const result = await fixture(quote(overrides)).reader.read(protocol, [instrument]);
  expect(result).toMatchObject({
    prices: new Map(),
    marketTime: null,
    missing: { 'AAPL.US': 'valuation_quote_unqualified' },
  });
});

it('休市快照按最近会话判断，不受实时行情年龄限制', async () => {
  const closed = session({ state: 'closed', date: '2026-11-13', latestTradingDate: '2026-11-12' });
  const value = quote({
    marketTime: '2026-11-12T15:58:00.000Z',
    freshness: 'delayed',
    sessionContext: {
      session: 'closed_snapshot',
      evaluatedAt: now,
      latestTradingDate: '2026-11-12',
    },
  });
  expect(await fixture(value, closed).reader.read(protocol, [instrument])).toMatchObject({
    prices: new Map([['AAPL.US', '10']]),
    missing: {},
  });
  expect(
    await fixture(
      { ...value, sessionContext: { ...value.sessionContext!, latestTradingDate: '2026-11-11' } },
      closed,
    ).reader.read(protocol, [instrument]),
  ).toMatchObject({ prices: new Map(), missing: { 'AAPL.US': 'valuation_quote_unqualified' } });
});

it('会话变化、公司行动缺失和来源故障保留各自拒绝原因', async () => {
  expect(
    await fixture(quote(), session(), session({ state: 'closed' })).reader.read(protocol, [
      instrument,
    ]),
  ).toMatchObject({ failure: true, reason: 'valuation_session_changed' });
  const missing = fixture();
  missing.actions.read.mockResolvedValueOnce(null);
  expect(await missing.reader.read(protocol, [instrument])).toMatchObject({
    prices: new Map(),
    missing: { 'AAPL.US': 'corporate_action_unverified' },
  });
  const failed = fixture();
  failed.market.getQuote.mockRejectedValueOnce(new Error('fixture'));
  expect(await failed.reader.read(protocol, [instrument])).toMatchObject({
    prices: new Map(),
    missing: { 'AAPL.US': 'valuation_source_unavailable' },
  });
});
