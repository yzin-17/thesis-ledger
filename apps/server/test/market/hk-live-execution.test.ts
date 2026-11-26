import { afterEach, expect, it, vi } from 'vitest';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { MarketLiveExecutionReader } from '../../src/market/market-live-execution-reader.js';
import { readLiveResearchQuote } from '../../src/model-arena/live/live-research-quote.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

const at = '2026-11-23T01:31:36Z';
const symbol = '00700.HK';
function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
  const quote = {
    symbol,
    price: 336.4,
    marketTime: '2026-11-23T01:31:35Z',
    fetchedAt: at,
    stale: false,
    freshness: 'live',
    provider: 'futu',
    upstreamSource: 'futu',
    units: { priceCurrency: 'HKD', volume: 'unknown', turnoverCurrency: 'unknown' },
    executionFacts: {
      version: 1,
      symbol,
      market: 'HK',
      assetType: 'STOCK',
      exchange: 'HK_MAINBOARD',
      securityId: '123',
      sharesPerLot: '100',
      delisted: false,
      tradingState: 'normal',
      securityStatus: 'NORMAL',
      marketTime: '2026-11-23T01:31:35Z',
      observedAt: at,
      provider: 'futu',
      responseSha256: 'a'.repeat(64),
    },
  };
  const market = {
    getQuote: vi.fn().mockResolvedValue(quote),
    getSession: vi.fn().mockResolvedValue({
      state: 'open',
      date: '2026-11-23',
      sessions: [
        {
          tradingDate: '2026-11-23',
          startAt: '2026-11-23T01:30:00Z',
          endAt: '2026-11-23T04:00:00Z',
        },
      ],
    }),
  };
  const dsa = {
    backtestInstrumentFacts: vi.fn(),
    effectiveControlPolicyV3: vi
      .fn()
      .mockResolvedValue({
        projection: { effective: { enabled: true, revision: 202, routes: [] } },
      }),
    marketPublicFeesV3: vi.fn(),
    post: vi.fn(async (_path, body) => ({
      contractVersion: 1,
      consumer: 'thesis-ledger',
      requestId: body.requestId,
      symbol,
      sharesPerLot: '100',
      historicalChanges: 'unverified',
      fetchedAt: at,
      policyRevision: 202,
      routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
      source: {
        provider: 'futu',
        sourceUrl: 'https://openapi.futunn.com/futu-api-doc/quote/get-static-info.html',
        sha256: 'a'.repeat(64),
        observedAt: at,
      },
    })),
  };
  const status = { readComposition: vi.fn() };
  const calendars = { read: vi.fn() },
    actions = { read: vi.fn() };
  const reader = new MarketLiveExecutionReader(
    market as never,
    calendars,
    status,
    actions,
    dsa as unknown as DsaClient,
  );
  const input = {
    symbol,
    assetType: 'STOCK' as const,
    market: 'HK' as const,
    currency: 'HKD' as const,
    maxQuoteAgeSeconds: 60,
    expiresOn: [],
  };
  return { reader, input, quote, market, dsa, status, calendars };
}
afterEach(() => vi.useRealTimers());

it('港股同次状态、数量和价位可用，独立返回当前费用和结算缺口', async () => {
  const s = setup();
  const result = await s.reader.read(s.input);
  expect(result).toMatchObject({
    status: 'unavailable',
    reason: 'execution_rules_unavailable',
    diagnostics: expect.arrayContaining([
      { field: 'tradingState', status: 'available' },
      { field: 'sharesPerLot', status: 'available' },
      { field: 'priceStep', status: 'available' },
      { field: 'HISTORICAL_PUBLIC_FEES', status: 'unavailable', reason: 'control-rejected' },
      { field: 'DAILY_PRICE_RULE', status: 'unavailable', reason: 'unsupported-capability' },
      { field: 'positionSettlement', status: 'unavailable', reason: 'unsupported-capability' },
      { field: 'cashSettlement', status: 'unavailable', reason: 'unsupported-capability' },
    ]),
  });
  expect(s.dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
  expect(s.status.readComposition).not.toHaveBeenCalled();
  expect(s.calendars.read).not.toHaveBeenCalled();
});

it.each(['unknown', 'suspended'])(
  '港股来源状态 %s 独立保留，不由价格推断可交易',
  async (tradingState) => {
    const s = setup();
    s.quote.executionFacts.tradingState = tradingState;
    expect(await s.reader.read(s.input)).toMatchObject({
      status: 'unavailable',
      reason: 'live_tradability_unavailable',
    });
  },
);

it('报价缺币种与跨市场观察均不能借用股票身份授予资格', async () => {
  const s = setup();
  delete (s.quote as { units?: unknown }).units;
  expect(await s.reader.read(s.input)).toMatchObject({ reason: 'live_quote_unqualified' });
  const other = setup();
  other.quote.executionFacts.market = 'US';
  expect(await other.reader.read(other.input)).toMatchObject({
    reason: 'live_tradability_unavailable',
    diagnostics: expect.arrayContaining([
      { field: 'tradingState', status: 'unavailable', reason: 'live_tradability_unavailable' },
    ]),
  });
});

it('竞技场研究入口保留每手和当前价格档位，同时展示所有规则缺口', async () => {
  const s = setup();
  const protocol = liveProtocolFixture({
    market: 'HK',
    currency: 'HKD',
    timeZone: 'Asia/Hong_Kong',
  });
  const result = await readLiveResearchQuote(
    protocol,
    symbol,
    'STOCK',
    new AbortController().signal,
    s.market as never,
    s.reader,
  );
  expect(result).toMatchObject({
    price: 336.4,
    units: { priceCurrency: 'HKD' },
    orderRuleReference: {
      boardLot: { sharesPerLot: '100' },
      spreadTable: { incrementAtQuote: '0.2' },
    },
    execution: {
      status: 'unavailable',
      diagnostics: expect.arrayContaining([
        { field: 'positionSettlement', status: 'unavailable', reason: 'unsupported-capability' },
      ]),
    },
  });
  expect(s.dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
});
