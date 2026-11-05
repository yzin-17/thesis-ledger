import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { marketNewsFeedRequestV3Schema } from '@thesis-ledger/schemas';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { parseNewsFeedV3, readDsaNewsFeedV3 } from '../../src/integration/dsa/dsa-news-feed-v3.js';
import { MarketNewsFeedReader } from '../../src/market/market-news-feed-reader.js';

const sample = JSON.parse(
  readFileSync(
    new URL('../../../../packages/schemas/fixtures/news-feed-v1.sample.json', import.meta.url),
    'utf8',
  ),
);
const input = { market: 'CN', providerId: 'cls', limit: 5 };
const client = () =>
  Object.assign(Object.create(DsaClient.prototype), {
    config: {
      dsaBaseUrl: 'https://dsa.example.test',
      dsaTimeoutMs: 5000,
      dsaToken: 'controlled-feed-token',
    },
  }) as DsaClient;
afterEach(() => vi.unstubAllGlobals());
function feedFetch(status = 200, corrupt = false) {
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(String(url)).toBe('https://dsa.example.test/api/v3/thesis-ledger/market/news-feed');
    expect((init?.headers as Record<string, string>).authorization).toBe(
      'Bearer controlled-feed-token',
    );
    const request = JSON.parse(String(init?.body));
    const response = structuredClone(sample.response);
    response.requestId = request.requestId;
    if (corrupt) response.items[0].id = 'news-item-v1:' + 'f'.repeat(64);
    return new Response(JSON.stringify(response), { status });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('Market → DsaClient 保留来源、时间、空证券关联和有限覆盖，单次请求', async () => {
  const fetch = feedFetch();
  const reader = new MarketNewsFeedReader(client());
  const result = await reader.read(input);
  expect(result).toMatchObject({
    market: 'CN',
    status: 'partial',
    source: sample.response.route,
    items: sample.response.items,
    coverage: sample.response.coverage,
    upstreamAttempts: 1,
  });
  expect(result.cacheIdentity).toMatch(/^market-news-feed-v1:[a-f0-9]{64}$/);
  expect((await reader.read(input)).cacheIdentity).toBe(result.cacheIdentity);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('拒绝合法格式但错误的证据哈希，失败不伪装成功空快讯', async () => {
  const fetch = feedFetch(200, true);
  expect(await new MarketNewsFeedReader(client()).read(input)).toMatchObject({
    status: 'unavailable',
    items: [],
    upstreamAttempts: null,
    errors: [{ code: 'invalid_response' }],
  });
  expect(fetch).toHaveBeenCalledOnce();
});
it('合同要求实际来源与本次选择一致', () => {
  expect(() =>
    parseNewsFeedV3(
      sample.response,
      marketNewsFeedRequestV3Schema.parse({ ...sample.request, providerId: 'wallstreetcn' }),
    ),
  ).toThrow();
});
it('非法市场或额外私有输入在请求前拒绝', async () => {
  const fetch = feedFetch();
  await expect(
    new MarketNewsFeedReader(client()).read({ ...input, holdings: [] }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('未部署的入口保持不可用且不重试', async () => {
  const fetch = vi.fn(async () => new Response('{}', { status: 404 }));
  vi.stubGlobal('fetch', fetch);
  await expect(
    readDsaNewsFeedV3(client(), marketNewsFeedRequestV3Schema.parse(sample.request)),
  ).rejects.toMatchObject({ code: 'unsupported-capability' });
  expect(fetch).toHaveBeenCalledOnce();
});
