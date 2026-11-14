import { describe, expect, it, vi } from 'vitest';
import { marketDataErrorMessageV3 } from '@thesis-ledger/schemas';
import { mapDataV3HttpError } from '../../src/integration/dsa/dsa-v3-protocol.js';
import { selectMarketWindowV3 } from '../../src/market/market-window-selector-v3.js';

describe('来源窗口错误投影', () => {
  it.each([
    ['insufficient_coverage', marketDataErrorMessageV3.insufficientCoverage, 'missing_window'],
    ['upstream_failure', marketDataErrorMessageV3.upstreamFailure, 'fetch_failed'],
    ['permission_denied', marketDataErrorMessageV3.permissionDenied, 'fetch_failed'],
  ])('保留 %s 的覆盖与取数区别', async (code, message, expected) => {
    const key = {
      kind: 'bar' as const,
      market: 'US' as const,
      assetType: 'STOCK' as const,
      capability: 'DAILY_BAR' as const,
      timeframe: '1d' as const,
      adjustment: 'hfq' as const,
    };
    const target = { providerId: 'futu', upstreamSource: 'futu' };
    const policy = {
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: 'policy',
      revision: 1,
      enabled: true,
    };
    const read = vi.fn(async ({ request }) => {
      throw mapDataV3HttpError(
        422,
        {
          contractVersion: 3,
          requestId: request.requestId,
          error: { code, message },
        },
        request.requestId,
      );
    });
    const result = await selectMarketWindowV3({
      desired: { ...policy, routes: [{ key, targets: [target] }] },
      effective: {
        ...policy,
        sourceDesiredRevision: 1,
        appliedAt: '2026-11-10T00:00:00Z',
        routes: [
          {
            key,
            targets: [{ ...target, routeIndex: 0, eligible: true, reason: null }],
            reason: null,
          },
        ],
      },
      catalog: {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        catalogRevision: 1,
        generatedAt: '2026-11-10T00:00:00Z',
        integrity: 'complete',
        entries: [{ key, target, state: 'ready' }],
      },
      routeKey: key,
      symbol: 'AAPL.US',
      window: { start: '2026-11-02', end: '2026-11-10' },
      requestId: 'window-error',
      now: '2026-11-11T00:00:00Z',
      read,
      readCapabilities: async () => ({
        dataContractVersions: [3],
        serviceCapabilities: { fundNav: true },
      }),
    });
    expect(read).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: 'unavailable',
      reason: 'primary_unavailable',
      primaryFailure: expected,
    });
  });
});
