import { afterEach, expect, it, vi } from 'vitest';
import { arenaMatchOrders, arenaSubmitDecision, type ArenaPaperAccount, type ArenaPaperContext, type ArenaPaperDecision, type ArenaPaperQuote } from '@thesis-ledger/domain';
import { quoteSchema } from '@thesis-ledger/schemas';
import { MarketLiveExecutionReader } from '../../src/market/market-live-execution-reader.js';

// 全部为隔离受控资料，不认证该日真实交易状态或历史来源可见性。
const day = '2026-11-13', instant = '2026-11-13T15:00:00Z';
function setup(assetType: 'STOCK' | 'ETF' = 'STOCK') {
  vi.useFakeTimers(); vi.setSystemTime(new Date(instant));
  const symbol = assetType === 'ETF' ? 'SPY.US' : 'AAPL.US';
  const quote = quoteSchema.parse({
    version: 1, symbol, open: 20, high: 21, low: 19, previousClose: 20, price: 20,
    volume: 1, amount: null, stale: false, freshness: 'live', provider: 'futu', upstreamSource: 'futu',
    marketTime: instant, fetchedAt: instant, units: { priceCurrency: 'USD', volume: 'share', turnoverCurrency: 'unknown' },
    executionFacts: { version: 1, symbol, market: 'US', assetType, exchange: 'US_NASDAQ',
      securityId: '123', sharesPerLot: '1', delisted: false, tradingState: 'normal', securityStatus: 'NORMAL',
      marketTime: instant, observedAt: instant, provider: 'futu', responseSha256: 'a'.repeat(64) },
    executionRules: { version: 1, ruleSetId: 'controlled-rule-fixture', market: 'US', currency: 'USD',
      assetTypes: ['STOCK', 'ETF'], exchanges: ['US_NASDAQ'], effectiveFrom: '2026-10-01', effectiveUntil: '2026-12-31',
      verifiedThrough: day, reviewedAt: '2026-11-13T14:30:00Z', observedAt: instant, provider: 'official-us-rules',
      priceIncrements: { atOrAboveOne: '0.01', belowOne: '0.0001' }, positionSettlementDays: 1, sellCashSettlementDays: 1,
      section31SellRate: '0.0000206', tafSellRatePerShare: '0', tafSellMaximum: '0',
      sources: [{ id: 'controlled-fixture', url: 'https://example.com/controlled-fixture' }] },
  });
  const market = {
    getSession: vi.fn().mockResolvedValue({ state: 'open', date: day, evaluatedAt: instant, sessions: [
      { tradingDate: day, startAt: '2026-11-13T14:30:00Z', endAt: '2026-11-13T21:00:00Z' },
    ] }), getQuote: vi.fn().mockResolvedValue(quote),
  };
  const calendars = { read: vi.fn().mockResolvedValue({ status: 'ready', calendar: { sessions: [
    { tradingDate: day, startAt: '2026-11-13T14:30:00Z', endAt: '2026-11-13T21:00:00Z' },
    { tradingDate: '2026-11-16', startAt: '2026-11-16T14:30:00Z', endAt: '2026-11-16T21:00:00Z' },
  ] } }) };
  const status = { readComposition: vi.fn() }, dsa = { get: vi.fn(), post: vi.fn(), backtestInstrumentFacts: vi.fn(),
    effectiveControlPolicyV3:vi.fn(),marketPublicFeesV3:vi.fn() };
  const actions = { read: vi.fn().mockResolvedValue(['controlled-action-proof']) };
  const reader = new MarketLiveExecutionReader(market, calendars, status, actions, dsa);
  const input = { symbol, assetType, market: 'US' as const, currency: 'USD' as const,
    maxQuoteAgeSeconds: 60, expiresOn: [] };
  return { reader, input, quote, market, calendars, actions, status, dsa };
}
afterEach(() => vi.useRealTimers());

it.each(['STOCK', 'ETF'] as const)('独立 %s 当前资料取得执行观察，不调用历史身份或股票日状态', async (asset) => {
  const s = setup(asset), result = await s.reader.read(s.input);
  if (result.status !== 'available') throw new Error(result.reason);
  expect(result.observation).toMatchObject({ lot: '1', tick: '0.01', positionAvailableOn: '2026-11-16', cashAvailableOn: '2026-11-16' });
  const observation: ArenaPaperQuote = result.observation;
  expect(observation.statutoryBuyFee('20000', '1000', '20')).toBe('0');
  expect(observation.statutorySellFee('20000', '1000', '20')).toBe('0.41');
  expect(s.dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
  expect(s.status.readComposition).not.toHaveBeenCalled();
});

it.each(['symbol', 'assetType', 'currency', 'state', 'exchange', 'old-clock', 'old-rules', 'future-review', 'missing-id', 'future-coverage', 'observation-before-market', 'rules-observation'])(
  '拒绝不合格资料：%s', async (fault) => {
    const s = setup(), f = s.quote.executionFacts!, r = s.quote.executionRules!;
    if (fault === 'symbol') f.symbol = 'MSFT.US';
    if (fault === 'assetType') f.assetType = 'ETF';
    if (fault === 'currency') s.quote.units!.priceCurrency = 'HKD';
    if (fault === 'state') f.tradingState = 'unknown';
    if (fault === 'exchange') f.exchange = 'US_PINK';
    if (fault === 'old-clock') f.observedAt = '2026-11-13T14:58:00Z';
    if (fault === 'old-rules') r.verifiedThrough = '2026-11-12';
    if (fault === 'future-review') r.reviewedAt = '2026-11-14T15:00:00Z';
    if (fault === 'missing-id') f.securityId = null;
    if (fault === 'future-coverage') r.verifiedThrough = '2026-11-16';
    if (fault === 'observation-before-market') f.observedAt = '2026-11-13T14:59:59Z';
    if (fault === 'rules-observation') r.observedAt = '2026-11-13T14:59:59Z';
    expect((await s.reader.read(s.input)).status).toBe('unavailable');
  });

it('实际停牌保留证据与禁止买卖；缺少公司行动覆盖不放行', async () => {
  const s = setup(); s.quote.executionFacts!.tradingState = 'suspended';
  const result = await s.reader.read(s.input);
  if (result.status !== 'available') throw new Error(result.reason);
  expect(result.observation.buyBlocked).toBe('suspended');
  s.actions.read.mockResolvedValue(null);
  expect(await s.reader.read({ ...s.input, previousDay: '2026-11-12' })).toMatchObject({ reason: 'corporate_action_unverified' });
});

it.each(['STOCK', 'ETF'] as const)('%s 经正式纯领域提交及后续快照撮合，资金持仓与预约一致', async (asset) => {
  const s = setup(asset), result = await s.reader.read(s.input);
  if (result.status !== 'available') throw new Error(result.reason);
  let id = 0;
  const c: ArenaPaperContext = { at: instant, tradingDate: day,
    fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
    maxPositionBps: 10000, maxActiveSymbols: 5, allowedSymbols: new Set([s.input.symbol]),
    quotes: [result.observation], expiresAt: () => result.ends.get(day)!, newId: () => String(++id) };
  const book: ArenaPaperAccount = { revision: 0, cash: '100000', positions: [], cashSettlements: [], orders: [], wakeups: [], watchedSymbols: [], fills: [] };
  const decision: ArenaPaperDecision = { summary: '受控委托样本', cancelOrderIds: [], watchedSymbols: [s.input.symbol],
    orders: [{ clientId: 'controlled-buy', symbol: s.input.symbol, side: 'buy', kind: 'limit', quantity: '10', price: '20', expiresOn: null, exitGroup: null }],
    wakeups: [{ kind: 'time', at: '2026-11-13T16:00:00Z' }] };
  const submitted = arenaSubmitDecision(book, 0, decision, c);
  expect(submitted.orders[0]?.state).toBe('active');
  expect(arenaMatchOrders(submitted, c, true).fills).toHaveLength(0);
  vi.setSystemTime(new Date('2026-11-13T15:00:01Z'));
  s.quote.marketTime = '2026-11-13T15:00:01Z';
  s.quote.executionFacts!.marketTime = s.quote.marketTime;
  s.quote.executionFacts!.observedAt = s.quote.marketTime;
  s.quote.executionRules!.observedAt = s.quote.marketTime;
  const next = await s.reader.read(s.input);
  if (next.status !== 'available') throw new Error(next.reason);
  const filled = arenaMatchOrders(submitted, { ...c, at: '2026-11-13T15:00:01Z', quotes: [next.observation] }, true);
  expect(filled.orders[0]?.state).toBe('filled');
  expect(filled.cash).toBe('99800');
  expect(filled.positions[0]).toMatchObject({ symbol: s.input.symbol, quantity: '10', availableOn: '2026-11-16' });
  expect(filled.fills[0]).toMatchObject({ price: '20', quantity: '10', fee: '0', sourceRef: next.observation.sourceRef });
  expect(filled.wakeups).toHaveLength(1);
  expect(arenaMatchOrders(filled, { ...c, at: '2026-11-13T15:00:01Z', quotes: [next.observation] }, true)).toEqual(filled);
  const subDollar = structuredClone(decision); subDollar.orders[0]!.price = '0.9987';
  expect(arenaSubmitDecision(book, 0, subDollar, c).orders[0]?.price).toBe('0.9987');
  const invalid = structuredClone(decision); invalid.orders[0]!.price = '1.0001';
  expect(() => arenaSubmitDecision(book, 0, invalid, c)).toThrow('invalid_tick');
});
