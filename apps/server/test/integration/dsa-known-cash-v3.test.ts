import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { marketKnownCashExchangeV3Schema } from '@thesis-ledger/schemas';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const fixture = () =>
  marketKnownCashExchangeV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/market-known-cash-v3.exchange.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
const client = () =>
  Object.assign(Object.create(DsaClient.prototype), {
    config: { dsaBaseUrl: 'https://dsa.example.test', dsaTimeoutMs: 5000, dsaToken: 'test-token' },
  }) as DsaClient;

describe('已知现金方案标准能力传输', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('经现有Client发送一次鉴权请求，保留源绑定与未知覆盖', async () => {
    const { request, response } = fixture();
    const fetch = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.pathname).toBe('/api/v3/thesis-ledger/market/events');
      expect(init.headers).toMatchObject({ authorization: 'Bearer test-token' });
      expect(JSON.parse(String(init.body))).toEqual(request);
      return { ok: true, status: 200, json: async () => response };
    });
    vi.stubGlobal('fetch', fetch);
    expect(await client().dataCapabilities.knownCash(request)).toEqual(response);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['symbol', 'catalogRevision', 'amount'])('拒绝%s错配，不消费邻近记录', async (field) => {
    const { request, response } = fixture();
    if (field === 'symbol') response.symbol = '510050.SH';
    else if (field === 'catalogRevision') response.catalogRevision++;
    else response.records[0]!.sourceAmount.value = '0.088';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => response })),
    );
    await expect(client().dataCapabilities.knownCash(request)).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });
  it.each([
    ['upstream_failure', 'permission_denied', 'unavailable'],
    ['policy_not_applied', 'configuration_changed', 'stale-revision'],
    ['not_adapted', 'research_protocol_not_supported', 'unsupported-capability'],
  ])('透传安全%s/%s，丢弃上游说明', async (code, reason, expected) => {
    const { request } = fixture();
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({
        contractVersion: 3,
        protocolVersion: 'known-cash-observations-v1',
        requestId: request.requestId,
        error: { code, reason, message: 'private raw response' },
      }),
    }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().dataCapabilities.knownCash(request)).rejects.toMatchObject({
      code: expected,
      sourceReason: reason,
      message: expect.not.stringContaining('private'),
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('非法错误原因或错请求ID不能透传', async () => {
    const { request } = fixture();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          contractVersion: 3,
          protocolVersion: 'known-cash-observations-v1',
          requestId: 'other',
          error: { code: 'upstream_failure', reason: 'secret-body', message: 'private' },
        }),
      })),
    );
    await expect(client().dataCapabilities.knownCash(request)).rejects.toMatchObject({
      code: 'invalid-response',
      sourceReason: undefined,
    });
  });
});
