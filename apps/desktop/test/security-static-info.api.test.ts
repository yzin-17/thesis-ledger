import { afterEach, expect, it, vi } from 'vitest';
import { fetchSecurityStaticInfo } from '../src/features/market-data/security-static-info.api.js';

const request = vi.fn();
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ request }) }));
afterEach(() => request.mockReset());
const value = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'q', symbol: 'SPY.US', assetType: 'ETF',
  market: 'US', name: 'SPY', securityId: '9007199254740993', sharesPerLot: '1', listingDate: null,
  delisted: false, exchange: null, provider: 'futu', historicalChanges: 'unverified',
  observedAt: '2026-10-09T01:00:00Z', fetchedAt: '2026-10-09T01:01:00Z', policyRevision: 1,
  routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 } };

it('显式类型进入请求且保留取消信号', async () => {
  request.mockResolvedValue(value);
  const signal = new AbortController().signal;
  expect((await fetchSecurityStaticInfo('SPY.US', 'ETF', signal)).securityId).toBe('9007199254740993');
  expect(request).toHaveBeenCalledWith('/api/market-data/security-static-info?symbol=SPY.US&assetType=ETF', { signal });
});
it.each([{ symbol: 'AAPL.US' }, { assetType: 'STOCK' }])('错配响应不可消费 %j', async change => {
  request.mockResolvedValue({ ...value, ...change });
  await expect(fetchSecurityStaticInfo('SPY.US', 'ETF')).rejects.toThrow('当前查询不匹配');
});
it('不支持的代码不触发请求', async () => {
  await expect(fetchSecurityStaticInfo('600519.SH', 'STOCK')).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
