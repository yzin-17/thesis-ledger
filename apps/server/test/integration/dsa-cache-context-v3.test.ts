import { afterEach, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import type { DsaV3ProtocolError } from '../../src/integration/dsa/dsa-v3-protocol.js';
import { DsaDataCapabilityReaderV3 } from '../../src/integration/dsa/dsa-data-capability-reader-v3.js';
import { quoteControlFixture } from '../market/quote-control-fixture.js';

const request = { contractVersion: 3 as const, consumer: 'thesis-ledger' as const,
  requestId: 'control-read', symbol: '600519.SH', capability: 'REALTIME_QUOTE' as const };
afterEach(() => vi.unstubAllGlobals());

it('只读控制投影使用原 Data V3 传输与相关错误映射', async () => {
  const post = vi.fn(async () => quoteControlFixture(request));
  const reader = new DsaDataCapabilityReaderV3(post, (parse) => parse());
  expect(await reader.cacheContext(request)).toMatchObject({ ready: true, requestId: request.requestId });
  expect(post).toHaveBeenCalledOnce();
  const [path, payload, mapper] = post.mock.calls[0] as unknown as
    [string, unknown, (status: number, payload: unknown) => DsaV3ProtocolError];
  expect(path).toBe('/api/v3/thesis-ledger/market/cache-context');
  expect(payload).toEqual(request);
  expect(mapper(422, { contractVersion: 3, requestId: request.requestId,
    error: { code: 'invalid_request', message: '来源拒绝请求参数' } }).code).toBe('invalid-request');
  expect(mapper(503, { contractVersion: 3, requestId: request.requestId,
    error: { code: 'upstream_failure', message: '行情上游暂时不可用' } }).code).toBe('unavailable');
  expect(mapper(503, { contractVersion: 3, requestId: 'other',
    error: { code: 'upstream_failure', message: '行情上游暂时不可用' } }).code).toBe('invalid-response');
});

it.each(['symbol', 'requestId', 'capability', 'generation'] as const)('拒绝缓存上下文 %s 错绑', async (field) => {
  const value = { ...await quoteControlFixture(request), [field]: 'other' };
  const reader = new DsaDataCapabilityReaderV3(async () => value, (parse) => parse());
  await expect(reader.cacheContext(request)).rejects.toMatchObject({ code: 'invalid-response' });
});

it('原DsaClient使用Data Token及单次POST，不额外发数据请求或失败重试', async () => {
  const client = Object.assign(Object.create(DsaClient.prototype), {
    config: { dsaBaseUrl: 'https://dsa.example.test', dsaTimeoutMs: 5000, dsaToken: 'fixture-token' },
  }) as DsaClient;
  const fetch = vi.fn(async (url: unknown, init: RequestInit | undefined) => {
    expect(String(url)).toBe('https://dsa.example.test/api/v3/thesis-ledger/market/cache-context');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer fixture-token');
    expect(JSON.parse(String(init?.body))).toEqual(request);
    return new Response(JSON.stringify(await quoteControlFixture(request)), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  await expect(client.marketCacheContextV3(request)).resolves.toMatchObject({ ready: true });
  expect(fetch).toHaveBeenCalledOnce();
  fetch.mockResolvedValue(new Response(JSON.stringify({ contractVersion: 3,
    requestId: request.requestId, error: { code: 'upstream_failure', message: '行情上游暂时不可用' } }), { status: 503 }));
  await expect(client.marketCacheContextV3(request)).rejects.toMatchObject({ code: 'unavailable' });
  expect(fetch).toHaveBeenCalledTimes(2);
});
