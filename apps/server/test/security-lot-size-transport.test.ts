import { afterEach, expect, it, vi } from 'vitest';
import { DsaClient } from '../src/integration/dsa/dsa.client.js';
import { readSecurityLotSize } from '../src/integration/dsa/dsa-security-lot-size.js';

vi.mock('../src/platform/config.js', () => ({ loadConfig: () => ({
  dsaBaseUrl: 'http://fixture.dsa.invalid', dsaToken: 'synthetic-test-token', dsaTimeoutMs: 500,
}) }));
afterEach(() => vi.unstubAllGlobals());

it('实际传输保留未配置路由提示，不误用日线错误合同', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ detail: {
    contractVersion: 3, code: 'no_eligible_provider', message: '当前 Control 未配置对应能力路由',
    requestId: 'source-request', diagnosticId: 'source-request',
  } }), { status: 503, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(readSecurityLotSize(new DsaClient(), '00700.HK')).rejects.toMatchObject({
    code: 'unavailable', message: '当前 Control 未配置对应能力路由', status: 503,
  });
  expect(fetcher).toHaveBeenCalledOnce();
});
