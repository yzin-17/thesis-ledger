import { afterEach, expect, it, vi } from 'vitest';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { MarketLiveExecutionReader } from '../../src/market/market-live-execution-reader.js';
import { readHkStockOrderReference } from '../../src/market/market-hk-stock-order-reference.js';
import { readLiveResearchQuote } from '../../src/model-arena/live/live-research-quote.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

const observedAt = '2026-11-22T11:58:05Z';
const at = new Date(observedAt);
const symbol = '00700.HK';
const protocol = liveProtocolFixture({ market: 'HK', currency: 'HKD', timeZone: 'Asia/Hong_Kong' });
function lotResponse(requestId: string) {
  return {
    contractVersion: 1, consumer: 'thesis-ledger', requestId, symbol, sharesPerLot: '100',
    routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 }, policyRevision: 202,
    historicalChanges: 'unverified', fetchedAt: observedAt,
    source: { provider: 'futu', sourceUrl: 'https://openapi.futunn.com/futu-api-doc/quote/get-static-info.html',
      sha256: 'f'.repeat(64), observedAt },
  };
}
function setup() {
  const post = vi.fn(async (_path: string, request: { requestId: string }) => lotResponse(request.requestId));
  const dsa = { post, backtestInstrumentFacts: vi.fn() } as unknown as DsaClient;
  const units = { priceCurrency: 'HKD', volume: 'share', turnoverCurrency: 'unknown' } as const;
  return { post, dsa, units };
}

afterEach(() => vi.useRealTimers());

it.each([
  [0.009, null], [0.01, '0.001'], [0.25, '0.001'], [0.255, '0.005'], [10, '0.005'],
  [10.01, '0.01'], [20, '0.01'], [20.02, '0.02'], [50, '0.02'], [50.05, '0.05'],
  [200, '0.1'], [200.2, '0.2'], [500, '0.2'], [500.5, '0.5'],
  [5000, '2'], [5005, '5'], [9995, '5'], [10000, null],
])('按报价所在区间返回价位 %s', async (price, incrementAtQuote) => {
  const { dsa, units } = setup();
  const value = await readHkStockOrderReference(dsa, symbol, { symbol, price, units }, at);
  expect(value.spreadTable).toMatchObject({ code: '01', effectiveFrom: '2026-08-03', incrementAtQuote });
});

it('严格区分港元、未确认币种、其他标的与生效日期', async () => {
  const { dsa, units } = setup();
  const quote = { symbol, price: 5, units };
  const beforeEffectiveDate = await readHkStockOrderReference(dsa, symbol, quote, new Date('2026-08-02T15:59:59Z'));
  expect(beforeEffectiveDate.spreadTable).toBeNull();
  const first = await readHkStockOrderReference(dsa, symbol, quote, new Date('2026-08-02T16:00:00Z'));
  expect(first.spreadTable?.incrementAtQuote).toBe('0.005');
  for (const value of [
    { ...quote, units: undefined }, { ...quote, units: { ...units, priceCurrency: 'CNY' as const } },
    { ...quote, symbol: '00147.HK' },
  ]) {
    expect((await readHkStockOrderReference(dsa, symbol, value, at)).spreadTable?.incrementAtQuote).toBeNull();
  }
});

it('现行港股研究报价带上实际独立来源，两项参考不授予成交权限', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  const { dsa, post } = setup();
  const quote = { symbol, price: 500 };
  const market = {
    getQuote: vi.fn().mockResolvedValue(quote),
    getSession: vi.fn().mockResolvedValue({ state: 'closed', reason: 'market_closed' }),
  };
  const calendars = { read: vi.fn() }, status = { readComposition: vi.fn() }, actions = { read: vi.fn() };
  const reader = new MarketLiveExecutionReader(market, calendars, status, actions, dsa);
  const signal = new AbortController().signal;
  const value = await readLiveResearchQuote(protocol, symbol, 'STOCK', signal, market, reader);
  expect(value).toMatchObject({
    symbol,
    orderRuleReference: {
      boardLot: { status: 'available', sharesPerLot: '100', historicalChanges: 'unverified',
        source: { provider: 'futu', observedAt }, routeTarget: { routeIndex: 0 } },
      spreadTable: { code: '01', incrementAtQuote: null },
    },
    execution: { status: 'unavailable', reason: 'market_closed' },
  });
  expect(post).toHaveBeenCalledExactlyOnceWith(
    '/api/v1/thesis-ledger/market/security-lot-size',
    { contractVersion: 1, consumer: 'thesis-ledger', requestId: expect.any(String), symbol }, 1,
  );
  expect(await readLiveResearchQuote(protocol, '02800.HK', 'ETF', signal, market, reader))
    .not.toHaveProperty('orderRuleReference');
  expect(post).toHaveBeenCalledTimes(1);
  expect(calendars.read).not.toHaveBeenCalled();
});

it('静态股数读取失败时仍保留独立价位表，拒绝错标的响应', async () => {
  const { dsa, post, units } = setup();
  post.mockRejectedValueOnce(new Error('source unavailable'));
  post.mockResolvedValueOnce({ ...lotResponse('incorrect'), symbol: '00147.HK' });
  for (let i = 0; i < 2; i += 1) {
    const result = await readHkStockOrderReference(dsa, symbol, { symbol, price: 500, units }, at);
    expect(result).toMatchObject({
      boardLot: { status: 'unavailable', reason: 'lot_size_unavailable' },
      spreadTable: { incrementAtQuote: '0.2' },
    });
  }
});
