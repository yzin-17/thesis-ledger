import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  correlateMarketNewsFeedV3,
  marketNewsFeedRequestV3Schema,
  marketNewsFeedResponseV3Schema,
} from '../src/market-news-feed.js';

const sample = JSON.parse(
  readFileSync(new URL('../fixtures/news-feed-v1.sample.json', import.meta.url), 'utf8'),
);
it('接受同版 DSA 市场快讯事实，保留空证券关联和有限覆盖', () => {
  const request = marketNewsFeedRequestV3Schema.parse(sample.request);
  expect(correlateMarketNewsFeedV3(request, sample.response).items[0]!.relatedInstruments).toEqual(
    [],
  );
  expect(marketNewsFeedResponseV3Schema.parse(sample.response).coverage.basis).toBe('current-feed');
});
it.each(['market', 'instrument', 'requestId', 'source', 'count', 'window', 'complete'])(
  '拒绝市场快讯错绑或伪装完整结果：%s',
  (mode) => {
    const response = structuredClone(sample.response);
    if (mode === 'market') response.market = 'US';
    if (mode === 'instrument')
      response.items[0].relatedInstruments = [
        { market: 'CN', assetType: 'STOCK', symbol: '000001.SZ' },
      ];
    if (mode === 'requestId') response.requestId = 'wrong';
    if (mode === 'source')
      response.route.providerId = response.items[0].providerId = 'wallstreetcn';
    if (mode === 'count') response.coverage.returnedCount = 0;
    if (mode === 'window') response.coverage.publishedStart = '2020-01-01T00:00:00Z';
    if (mode === 'complete') response.status = 'available';
    expect(() =>
      correlateMarketNewsFeedV3(marketNewsFeedRequestV3Schema.parse(sample.request), response),
    ).toThrow();
  },
);
it('请求拒绝附带个股、隐私材料和错误市场', () => {
  for (const fields of [
    { instrument: { symbol: '600519.SH' } },
    { holdings: [] },
    { market: 'US' },
  ])
    expect(marketNewsFeedRequestV3Schema.safeParse({ ...sample.request, ...fields }).success).toBe(
      false,
    );
});
