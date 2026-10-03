import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketEventRequestV3 } from '@thesis-ledger/schemas';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const request: MarketEventRequestV3 = {
  contractVersion: 3,
  requestId: 'event-request',
  symbol: '510300.SH',
  routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
  routeTarget: { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 },
  desiredRevision: 2,
  effectivePolicyRevision: 2,
  catalogRevision: 3,
  start: '2025-06-01',
  end: '2025-06-30',
  dataAsOf: '2026-09-27T01:00:00Z',
};
const response = {
  ...request,
  fetchedAt: '2026-09-27T00:00:00Z',
  providerRevision: 'r1',
  facts: [],
  coverage: { complete: false, reason: 'historical_coverage_unverified' },
};
const client = () =>
  Object.assign(Object.create(DsaClient.prototype), {
    config: { dsaBaseUrl: 'https://dsa.example.test', dsaTimeoutMs: 5000, dsaToken: 'test-token' },
  }) as DsaClient;

describe('DSA 事件 V3 传输', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('发送固定请求与 Data Token，保持不完整响应', async () => {
    const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.protocol).toBe('https:');
      expect(init.method).toBe('POST');
      return { ok: true, status: 200, json: async () => response };
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await client().marketEventsV3(request);
    expect(result.coverage.complete).toBe(false);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url.pathname).toBe('/api/v3/thesis-ledger/market/events');
    expect(init.headers).toMatchObject({ authorization: 'Bearer test-token' });
    expect(JSON.parse(String(init.body))).toEqual(request);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    { requestId: 'other' },
    { catalogRevision: 9 },
    { routeTarget: { ...request.routeTarget, upstreamSource: 'other' } },
    { start: '2025-06-02' },
  ])('拒绝响应关联错配 %#', async (patch) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ...response, ...patch }),
      })),
    );
    await expect(client().marketEventsV3(request)).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });

  it.each([
    ['not_admitted', 'control-rejected'],
    ['policy_not_applied', 'stale-revision'],
    ['upstream_failure', 'unavailable'],
    ['not_adapted', 'unsupported-capability'],
  ])('映射 %s 且不重试或泄露上游文案', async (upstream, code) => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({
        contractVersion: 3,
        requestId: request.requestId,
        error: { code: upstream, message: 'sensitive fixture' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client().marketEventsV3(request)).rejects.toMatchObject({
      code,
      message: expect.not.stringContaining('sensitive fixture'),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
