import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { MarketLiveExecutionReader } from '../../src/market/market-live-execution-reader.js';

const day = '2026-11-12', instant = '2026-11-12T02:00:00Z';
const fixture = JSON.parse(readFileSync(new URL('../../../../packages/schemas/test/fixtures/market-status-capabilities-v1.shared.json', import.meta.url), 'utf8')).valid;
function setup() {
  vi.useFakeTimers(); vi.setSystemTime(new Date(instant));
  const entries = fixture.filter((s: { request: { routeKey: { capability: string } } }) =>
    ['DAILY_TRADING_STATUS', 'DAILY_PRICE_RULE'].includes(s.request.routeKey.capability)).map((s: object) => {
    const raw = JSON.parse(JSON.stringify(s).replaceAll('2024-07-15', day).replaceAll('2024-07-20T08:00:00Z', instant));
    if (raw.result.routeKey.capability === 'DAILY_PRICE_RULE') {
      raw.result.representation = 'exactPrices';
      raw.result.days[0].rule = { kind: 'exact', currency: 'CNY', lower: '9', upper: '11' };
    }
    return { status: 'included', query: raw.request, result: raw.result };
  });
  const quote = { symbol: '600000.SH', stale: false, freshness: 'live', marketTime: '2026-11-12T01:59:59Z',
    fetchedAt: instant, units: { priceCurrency: 'CNY' }, price: 10 };
  const market = {
    getSession: vi.fn().mockResolvedValue({ state: 'open', date: day, sessions: [
      { tradingDate: day, startAt: '2026-11-12T01:30:00Z', endAt: '2026-11-12T03:30:00Z' },
    ], evaluatedAt: instant }),
    getQuote: vi.fn().mockResolvedValue(quote),
  };
  const calendars = { read: vi.fn().mockResolvedValue({ status: 'ready', calendar: { sessions: [
    { tradingDate: day, startAt: '2026-11-12T01:30:00Z', endAt: '2026-11-12T07:00:00Z' },
    { tradingDate: '2026-11-13', startAt: '2026-11-13T01:30:00Z', endAt: '2026-11-13T07:00:00Z' },
  ] } }) };
  const status = { readComposition: vi.fn().mockResolvedValue({ entries }) };
  const actions = { read: vi.fn().mockResolvedValue(['controlled-no-actions']) };
  const dsa = { backtestInstrumentFacts: vi.fn().mockResolvedValue({ facts: [{
    symbol: '600000.SH', market: 'CN', currency: 'CNY', instrumentType: 'STOCK', availableAt: instant,
    lotSize: '100', tickSize: '0.01', tradable: true, executionRules: { status: 'supported', range: { start: day, end: day },
      positionSettlement: { sellableAfterTradingDays: 1 }, cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
      statutoryCharges: [{ side: 'sell', rate: '0.001', minimum: null }],
    },
  }] }) };
  const reader = new MarketLiveExecutionReader(market, calendars, status, actions, dsa);
  const input = { symbol: '600000.SH', assetType: 'STOCK' as const, market: 'CN' as const,
    currency: 'CNY' as const, maxQuoteAgeSeconds: 60, expiresOn: [], previousDay: '2026-11-11' };
  return { reader, input, market, quote, calendars, status, entries, actions, dsa };
}
afterEach(() => vi.useRealTimers());
it('执行证据保留来源时钟、价格限制、真实结算日及法定费用', async () => {
  const s = setup();
  const result = await s.reader.read(s.input);
  expect(result.status).toBe('available');
  if (result.status !== 'available') throw new Error(result.reason);
  expect(result.observation.positionAvailableOn).toBe('2026-11-13');
  expect(result.observation.statutorySellFee('1000')).toBe('1');
  expect(result.observation).toMatchObject({ upperLimit: '11', lowerLimit: '9', marketTime: '2026-11-12T01:59:59.000Z' });
  expect(result.ends.get(day)).toBe('2026-11-12T07:00:00.000Z');
});
it('休市或未知会话不启动来源调用', async () => {
  const s = setup();
  s.market.getSession.mockResolvedValue({ state: 'unknown', reason: 'calendar_unavailable' });
  expect(await s.reader.read(s.input)).toEqual({ status: 'unavailable', reason: 'calendar_unavailable' });
  expect(s.market.getQuote).not.toHaveBeenCalled();
});
it('报价刷新不能把旧行情认证为当前成交依据', async () => {
  const s = setup(); s.quote.marketTime = '2026-11-12T01:50:00Z';
  expect(await s.reader.read(s.input)).toEqual({ status: 'unavailable', reason: 'live_quote_unqualified' });
});
it('缺少规则、跨标的状态及未核实公司行动分别拒绝', async () => {
  const missingRule = setup(); missingRule.dsa.backtestInstrumentFacts.mockResolvedValue({ facts: [] });
  expect(await missingRule.reader.read(missingRule.input)).toMatchObject({ reason: 'execution_rules_unavailable' });
  const wrong = setup(); wrong.entries[0]!.result.symbol = '600519.SH';
  expect(await wrong.reader.read(wrong.input)).toMatchObject({ reason: 'live_tradability_unavailable' });
  const action = setup(); action.actions.read.mockResolvedValue(null);
  expect(await action.reader.read(action.input)).toMatchObject({ reason: 'corporate_action_unverified' });
});
it('现行股票状态合同不能被挪作 ETF 准入', async () => {
  const s = setup();
  expect(await s.reader.read({ ...s.input, assetType: 'ETF' })).toMatchObject({ reason: 'live_tradability_unavailable' });
});
it('来源带时区的行情归一为存储时刻，原始证据保留原时区文本', async () => {
  const s = setup(); s.quote.marketTime = '2026-11-12T09:59:59+08:00';
  const result = await s.reader.read(s.input);
  if (result.status !== 'available') throw new Error(result.reason);
  expect(result.observation.marketTime).toBe('2026-11-12T01:59:59.000Z');
  expect(result.evidence.quote.marketTime).toBe('2026-11-12T09:59:59+08:00');
});
