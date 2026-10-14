import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { marketKnownCashControlExchangeV3Schema } from '@thesis-ledger/schemas';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const fixture = () =>
  marketKnownCashControlExchangeV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/market-known-cash-control-v3.exchange.json',
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

describe('正常能力传输的现金控制复核', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('一次鉴权且有期限的请求，保留当前检查与原固定截止', async () => {
    const { request, response } = fixture();
    const fetch = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.pathname).toBe('/api/v3/thesis-ledger/market/events');
      expect(init.headers).toMatchObject({ authorization: 'Bearer test-token' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(String(init.body))).toEqual(request);
      return { ok: true, status: 200, json: async () => response };
    });
    vi.stubGlobal('fetch', fetch);
    expect(await client().dataCapabilities.knownCashControl(request)).toEqual(response);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['scope', 'identity', 'position', 'source-data'])('拒绝%s错配', async (change) => {
    const { request, response } = fixture();
    if (change === 'scope') response.symbol = '510050.SH';
    else if (change === 'identity') response.controlIdentity.providerConfigVersion++;
    else if (change === 'position') response.targetSequence.reverse();
    else Object.assign(response, { records: [] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => response })),
    );
    await expect(client().dataCapabilities.knownCashControl(request)).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });
  it('非法控制身份在HTTP之前拒绝', () => {
    const { request } = fixture();
    request.expectedControlIdentity.providerConfigVersion = -1;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(() => client().dataCapabilities.knownCashControl(request)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['policy_not_applied', 'configuration_changed', 'stale-revision'],
    ['not_adapted', 'research_protocol_not_supported', 'unsupported-capability'],
    ['not_admitted', 'credential_missing', 'control-rejected'],
  ])('安全保留%s/%s，不透传正文', async (code, reason, expected) => {
    const { request } = fixture();
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({
        contractVersion: 3,
        protocolVersion: 'known-cash-control-v1',
        requestId: request.requestId,
        error: { code, reason, message: 'private-secret-body' },
      }),
    }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().dataCapabilities.knownCashControl(request)).rejects.toMatchObject({
      code: expected,
      sourceReason: reason,
      message: expect.not.stringContaining('private-secret'),
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([401, 403, 404, 405])('HTTP %s保留鉴权/未支持语义', async (status) => {
    const { request } = fixture();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status, json: async () => ({ private: 'body' }) })),
    );
    await expect(client().dataCapabilities.knownCashControl(request)).rejects.toMatchObject({
      code: status < 404 ? 'unauthorized' : 'unsupported-capability',
      sourceReason: undefined,
    });
  });
  it('错协议或请求ID不能成为有效安全错误', async () => {
    const { request } = fixture();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({
          contractVersion: 3,
          protocolVersion: 'known-cash-observations-v1',
          requestId: 'other',
          error: { code: 'not_admitted', reason: 'credential_missing', message: 'private' },
        }),
      })),
    );
    await expect(client().dataCapabilities.knownCashControl(request)).rejects.toMatchObject({
      code: 'invalid-response',
      sourceReason: undefined,
    });
  });
});
