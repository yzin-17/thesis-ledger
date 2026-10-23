import { beforeEach, expect, it, vi } from 'vitest';
import { fetchMarketNews } from '../src/features/market-data/market-news.api.js';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ request }) }));
const input = {
  instrument: { symbol: 'NVDA.US', market: 'US' as const, assetType: 'STOCK' as const },
  publishedStart: '2026-10-20T00:00:00Z',
  publishedEnd: '2026-10-22T00:00:00Z',
  limit: 5,
};
const unavailable = () => ({
  instrument: input.instrument,
  status: 'unavailable',
  items: [],
  source: null,
  fetchedAt: null,
  upstreamAttempts: null,
  nextCursor: null,
  cacheIdentity: null,
  coverage: {
    basis: 'current-search',
    publishedStart: input.publishedStart,
    publishedEnd: input.publishedEnd,
    complete: false,
    truncated: false,
    unknownPublishedTimeCount: 0,
    examinedCount: null,
    returnedCount: 0,
    uniqueEvidenceCount: 0,
    missingReasons: ['service_unavailable'],
  },
  errors: [
    { code: 'service_unavailable', message: '服务不可用', providerId: null, upstreamSource: null },
  ],
});
beforeEach(() => {
  request.mockReset();
});
it('只读 POST 消费规范合同并传递取消信号', async () => {
  request.mockResolvedValue(unavailable());
  const signal = new AbortController().signal;
  const result = await fetchMarketNews(input, signal);
  expect(result.status).toBe('unavailable');
  expect(result.upstreamAttempts).toBeNull();
  expect(request).toHaveBeenCalledWith(
    '/api/market-data/news',
    expect.objectContaining({ method: 'POST', signal }),
  );
  expect(JSON.parse(request.mock.calls[0]![1].body).instrument).toEqual(input.instrument);
});
it('拒绝标的错绑且不自动补试', async () => {
  request.mockResolvedValue({
    ...unavailable(),
    instrument: { ...input.instrument, symbol: 'MSFT.US' },
  });
  await expect(fetchMarketNews(input)).rejects.toThrow('新闻响应尚无法确认');
  expect(request).toHaveBeenCalledTimes(1);
});
it('保留网络失败供界面恢复且不自动补试', async () => {
  request.mockRejectedValue(new Error('Failed to fetch'));
  await expect(fetchMarketNews(input)).rejects.toThrow('Failed to fetch');
  expect(request).toHaveBeenCalledTimes(1);
});
