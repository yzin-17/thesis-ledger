import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const fixture = () => {
  const golden = JSON.parse(readFileSync(new URL(
    '../../../../packages/schemas/fixtures/market-data-v3.multi-window-hash.json', import.meta.url,
  ), 'utf8'));
  const response = golden.response;
  response.inputFingerprint = golden.expectedContentHash;
  response.sourcePriceBasis.revision.contentHash = golden.expectedContentHash;
  return response;
};

describe('DSA 多窗口网络能力确认', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['supported', 'absent', 'wrong-version', 'unavailable'])(
    '能力状态为 %s 时执行对应允许或拒绝', async (mode) => {
      const payload = fixture();
      const capabilities = {
        dataContractVersions: mode === 'wrong-version' ? [1, 2] : [3],
        serviceCapabilities: { fundNav: true },
        ...(mode !== 'absent' ? { multiWindowProtocols: ['market-multi-window-content-v1'] } : {}),
      };
      const fetchMock = vi.fn(async (url: URL) => {
        const isCapabilities = url.pathname.endsWith('/capabilities');
        const status = isCapabilities && mode === 'unavailable' ? 503 : 200;
        return { ok: status === 200, status, json: async () => isCapabilities ? capabilities : payload };
      });
      vi.stubGlobal('fetch', fetchMock);
      const client = Object.assign(Object.create(DsaClient.prototype), {
        config: { dsaBaseUrl: 'https://dsa.example.test', dsaTimeoutMs: 5000, dsaToken: 'test' },
      }) as DsaClient;
      const result = client.marketBarsV3({
        contractVersion: 3, requestId: payload.requestId, symbol: payload.symbol,
        routeKey: payload.routeKey, start: payload.coverage.requestedStart, end: payload.coverage.requestedEnd,
      });
      if (mode === 'supported') await expect(result).resolves.toEqual(payload);
      else await expect(result).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map(([url]) => url.pathname)).toEqual([
        '/api/v3/thesis-ledger/market/bars', '/api/v3/thesis-ledger/capabilities',
      ]);
    },
  );
});
