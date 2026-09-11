import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

vi.mock('../../src/platform/config.js', () => ({
  loadConfig: () => ({ dsaBaseUrl: 'http://localhost', dsaTimeoutMs: 5000, dsaToken: 'test-only' }),
}));
afterEach(() => vi.unstubAllGlobals());

describe('DSA instrument-facts 范围与缺失原因', () => {
  it('传递实际范围并保留 Provider 不可用信息', async () => {
    const raw = {
      version: 2,
      status: 'unavailable',
      provider: 'dsa-market-rules',
      providerRevision: 'static-lot-tick',
      coverage: { start: '2023-12-17', end: '2024-03-29', complete: false },
      facts: [],
      reason: '600519.SH historicalTradability: 未提供历史状态',
      missingInputs: [
        {
          field: 'historicalTradability',
          category: 'criticalFact',
          range: { start: '2023-12-17', end: '2024-03-29' },
          provider: 'dsa-market-rules',
          reason: '静态 lot/tick 不证明历史状态',
        },
      ],
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw)));
    vi.stubGlobal('fetch', fetch);
    const request = {
      symbol: '600519.SH',
      market: 'CN' as const,
      instrumentType: 'STOCK' as const,
      start: '2023-12-17',
      end: '2024-03-29',
      executionStart: '2024-01-02',
      executionEnd: '2024-03-29',
      dataAsOf: '2024-03-29T16:00:00Z',
    };
    const client = new DsaClient();
    expect(await client.backtestInstrumentFacts(request)).toEqual(raw);
    const url = fetch.mock.calls[0]![0] as URL;
    expect(url.pathname).toBe('/api/v1/thesis-ledger/v2/instrument-facts');
    expect(Object.fromEntries(url.searchParams)).toEqual(request);
    expect(() => client.backtestInstrumentFacts({ ...request, start: '2025-01-01' })).toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
