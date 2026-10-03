import { afterEach, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

afterEach(() => vi.unstubAllGlobals());

it('证券事实请求发送成组来源参数及数字索引，不序列化 undefined', async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      version: 3,
      status: 'unavailable',
      reason: 'fixture source revoked',
      provider: 'fixture',
      providerRevision: 'r1',
      coverage: { start: '2026-07-29', end: '2026-07-31', complete: false },
      facts: [],
    }),
  }));
  vi.stubGlobal('fetch', fetch);
  const client = Object.assign(Object.create(DsaClient.prototype), {
    config: {
      dsaBaseUrl: 'https://dsa.example.test',
      dsaTimeoutMs: 5000,
      dsaToken: 'fixture',
    },
  }) as DsaClient;
  const request = {
    symbol: '159515.SZ',
    market: 'CN' as const,
    instrumentType: 'ETF' as const,
    start: '2026-07-29',
    end: '2026-07-31',
    executionStart: '2026-07-29',
    executionEnd: '2026-07-31',
    dataAsOf: '2026-09-30T00:00:00Z',
  };
  await client.backtestInstrumentFacts({
    ...request,
    barAdjustment: 'qfq',
    barProviderId: 'hithink',
    barUpstreamSource: 'fund-market-historical',
    barRouteIndex: 1,
  });
  const url = new URL(String((fetch.mock.calls as unknown as Array<[URL]>)[0]![0]));
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    barAdjustment: 'qfq',
    barProviderId: 'hithink',
    barUpstreamSource: 'fund-market-historical',
    barRouteIndex: '1',
  });
  fetch.mockClear();
  expect(() => client.backtestInstrumentFacts({ ...request, barAdjustment: 'qfq' })).toThrow();
  expect(fetch).not.toHaveBeenCalled();
  await client.backtestInstrumentFacts(request);
  expect(String((fetch.mock.calls as unknown as Array<[URL]>)[0]![0])).not.toContain('undefined');
});
