import { afterEach, describe, expect, it, vi } from 'vitest';
import { quoteSchema, type Quote } from '@thesis-ledger/schemas';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import { MarketQuoteReader } from '../../src/market/market-quote-reader.js';
import { observeQuoteTime } from '../../src/market/market-quote-cache-policy.js';
import { quoteFallbackReason } from '../../src/market/market-quote-diagnostics.js';
import { quoteControlFixture, quoteControlCacheKey } from './quote-control-fixture.js';

const now = Date.parse('2026-11-09T02:00:00Z');
const quote: Quote = {
  version: 1, symbol: '600519.SH', price: 10, open: 10, high: 11, low: 9,
  previousClose: 10, volume: null, amount: null, stale: false,
  freshness: 'live', provider: 'fixture', marketTime: '2026-11-09T01:59:00Z',
  fetchedAt: '2026-11-09T01:59:01Z',
};

function readerWithOldQuote(error: unknown) {
  const key = `thesis-ledger:cache:v1:${quoteControlCacheKey(quote.symbol)}`;
  const values = new Map([[`${key}:last-valid`, JSON.stringify(quote)]]);
  const client = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async () => 'OK'), eval: vi.fn(async () => 1),
  };
  const dsa = { get: vi.fn().mockRejectedValue(error), marketCacheContextV3: vi.fn(quoteControlFixture) };
  return { reader: new MarketQuoteReader(dsa as never, { client } as never), dsa, values, key };
}

afterEach(() => vi.restoreAllMocks());
describe('报价陈旧诊断端到端读取', () => {
  it.each([
    [new DsaError('private URL', 'timeout'), 'timeout'],
    [new DsaError('private URL', 'unavailable', 429), 'rate_limited'],
    [new DsaError('private URL', 'unauthorized', 401), 'unauthorized'],
    [new DsaError('private URL', 'unavailable', 401), 'unauthorized'],
    [new DsaError('private URL', 'permission-denied', 403), 'permission_denied'],
    [new DsaError('private URL', 'unavailable', 503), 'source_unavailable'],
    [new DsaError('private URL', 'invalid-response'), 'invalid_response'],
    [new DsaError('private URL', 'unavailable', undefined, 'request_budget_cooldown'), 'request_budget_cooldown'],
    [new Error('private URL timeout'), 'unknown'],
  ])('来源失败经 last-valid 与报价合同保留具体原因 %s', async (error, code) => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const { reader, values, key, dsa } = readerWithOldQuote(error);
    const result = await reader.getQuote(quote.symbol, { refresh: true });
    expect(result.staleReason?.code).toBe(code);
    expect(result.staleReason?.message).not.toContain('private URL');
    if (error instanceof DsaError && error.status) expect(result.staleReason?.httpStatus).toBe(error.status);
    expect(result.refreshFailure).toBe(code === 'request_budget_cooldown' ? 'budget_cooldown' : 'fetch_failed');
    values.set(`${key}:fresh`, JSON.stringify(result));
    const cached = await reader.getQuote(quote.symbol);
    expect(cached.staleReason).toEqual(result.staleReason);
    expect(quoteSchema.parse(JSON.parse(JSON.stringify(cached))).staleReason).toEqual(result.staleReason);
    expect(dsa.get).toHaveBeenCalledTimes(1);
  });

  it('刚抓取的旧来源时点仍说明阈值，且保留已有失败根因', () => {
    const old = { ...quote, marketTime: '2026-11-06T07:00:00Z', fetchedAt: new Date(now).toISOString() };
    expect(observeQuoteTime(old, now)).toMatchObject({ stale: true, staleReason: { code: 'market_time_aged' } });
    expect(observeQuoteTime({ ...old, staleReason: quoteFallbackReason('timeout', new DsaError('private', 'timeout')) }, now).staleReason?.code).toBe('timeout');
    expect(quote.stale).toBe(false);
    expect(observeQuoteTime({ ...quote, marketTime: null }, now).staleReason).toBeUndefined();
  });

  it('来源陈旧标记、并发等待、基础设施和格式错误分别表达', () => {
    expect(observeQuoteTime({ ...quote, stale: true, freshness: 'stale' }, now).staleReason?.code).toBe('upstream_stale');
    expect(quoteFallbackReason('lock-wait').code).toBe('refresh_in_progress');
    expect(quoteFallbackReason('cache-write', new Error('secret')).code).toBe('cache_unavailable');
    expect(quoteFallbackReason('cache-write').message).toContain('缓存写入失败');
    expect(quoteFallbackReason('unavailable').message).toContain('刷新锁不可用');
    expect(quoteFallbackReason('invalid-response', new Error('identity')).code).toBe('invalid_response');
  });

  it('上游无效报价不能归因于缓存不可用', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const { reader, dsa } = readerWithOldQuote(null);
    dsa.get.mockResolvedValueOnce({ ...quote, high: 0 });
    const result = await reader.getQuote(quote.symbol, { refresh: true });
    expect(result.staleReason?.code).toBe('invalid_response');
  });
});
