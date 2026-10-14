import { beforeEach, expect, it, vi } from 'vitest';
import { saveMarketPolicy } from '../src/features/market-data/market-data.api.js';
import type { MarketPolicyDraftV3 } from '../src/features/market-data/market-data.types.js';

const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => transport }));
beforeEach(() => { transport.request.mockReset(); });
const draft: MarketPolicyDraftV3 = { contractVersion: 3, revision: 84, enabled: true, routes: [
  { key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'DAILY_TRADING_STATUS' }, enabled: false,
    targets: [{ providerId: 'state-only', upstreamSource: 'state-only' }, { providerId: 'notice', upstreamSource: 'notice' }] },
  { key: { kind: 'bar', market: 'CN', assetType: 'ETF', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' },
    targets: [{ providerId: 'price', upstreamSource: 'price' }] },
] };

it('原保存入口携带显式CAS，关闭状态/主备顺序/其他能力完整传输', async () => {
  const before = structuredClone(draft);
  transport.request.mockImplementation(async (path, input) => {
    expect(path).toBe('/api/market-data/policy'); expect(input.method).toBe('PUT');
    const { expectedRevision, ...body } = JSON.parse(input.body);
    expect(expectedRevision).toBe(84); expect(body.revision).toBe(85);
    expect(body.routes).toEqual(draft.routes);
    return { ...body, syncState: 'pending', effectiveProjection: null, effectiveStale: true,
      dsaRevision: 84, lastError: null };
  });
  const saved = await saveMarketPolicy(draft);
  expect(saved.routes).toEqual(draft.routes);
  expect(transport.request).toHaveBeenCalledOnce();
  expect(draft).toEqual(before);
});

it('并行版本冲突不自动改版本、重试或覆盖', async () => {
  const error = new Error('政策CAS冲突'); transport.request.mockRejectedValue(error);
  await expect(saveMarketPolicy(draft)).rejects.toBe(error);
  expect(transport.request).toHaveBeenCalledOnce();
  expect(draft.revision).toBe(84);
});
