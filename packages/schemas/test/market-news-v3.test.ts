import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalNewsUrlV3,
  correlateMarketNewsV3,
  marketNewsRequestV3Schema,
  marketNewsResponseV3Schema,
  newsTimeMicrosV3,
  type MarketNewsResponseV3,
} from '../src/market-news-v3.js';

type Sample = { name: string; request: unknown; response: unknown; requestValid: boolean };
const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/news-search-v1.samples.json', import.meta.url), 'utf8'),
) as { contractVersion: string; fixtureKind: string; samples: Sample[] };
const available = fixture.samples.find((value) => value.name === 'available')!;
const fresh = () => marketNewsResponseV3Schema.parse(structuredClone(available.response));

describe('DSA N1 同版 news-search-v1 样例', () => {
  it.each(fixture.samples)('$name', (sample) => {
    expect(fixture.contractVersion).toBe('news-search-v1');
    expect(fixture.fixtureKind).toBe('controlled-contract-examples');
    const parsed = marketNewsRequestV3Schema.safeParse(sample.request);
    expect(parsed.success).toBe(sample.requestValid);
    if (parsed.success && sample.response !== null)
      expect(correlateMarketNewsV3(parsed.data, sample.response)).toEqual(sample.response);
  });
});

it.each([
  ['私有账户材料', { accountId: 'private' }],
  ['模型指令', { prompt: '执行交易' }],
  ['未知版本', { contractVersion: 'news-search-v2' }],
  ['无时区', { publishedStart: '2026-10-17T08:00:00' }],
  ['无效日期', { publishedStart: '2026-02-30T08:00:00Z' }],
  ['空时间', { publishedStart: '' }],
  ['窗口逆序', { publishedStart: '2026-10-18T08:00:00Z', publishedEnd: '2026-10-17T08:00:00Z' }],
  ['超额预算', { requestBudgetMs: 30_001 }],
  ['零预算', { requestBudgetMs: 0 }],
])('请求拒绝%s', (_name, fields) => {
  expect(
    marketNewsRequestV3Schema.safeParse({ ...(available.request as object), ...fields }).success,
  ).toBe(false);
});

const corruptions: [string, (value: MarketNewsResponseV3) => void][] = [
  [
    '未知覆盖被写成完整',
    (value) => {
      value.coverage.unknownPublishedTimeCount = 1;
    },
  ],
  [
    '可用响应夹带错误',
    (value) => {
      value.errors.push({
        code: 'timeout',
        message: '超时',
        providerId: null,
        upstreamSource: null,
      });
    },
  ],
  [
    '已知时间超出窗口',
    (value) => {
      value.coverage.publishedStart = '2026-10-17T08:00:00.000001Z';
    },
  ],
  [
    '证券错绑',
    (value) => {
      value.items[0]!.relatedInstruments[0]!.symbol = '000001.SZ';
    },
  ],
  [
    '来源错绑',
    (value) => {
      value.items[0]!.providerId = 'other';
    },
  ],
  [
    '抓取时点未来',
    (value) => {
      value.items[0]!.fetchedAt = '2026-10-19T00:00:00Z';
    },
  ],
  [
    '发布时间未来',
    (value) => {
      value.items[0]!.publishedAt = '2026-10-19T00:00:00Z';
    },
  ],
  [
    '条数虚报',
    (value) => {
      value.coverage.returnedCount = 2;
    },
  ],
  [
    '独立证据虚报',
    (value) => {
      value.coverage.uniqueEvidenceCount = 2;
    },
  ],
  [
    '遗漏原始引用',
    (value) => {
      value.items[0]!.sourceUrls = [value.items[0]!.url];
    },
  ],
  [
    '凭据 URL',
    (value) => {
      value.items[0]!.url = 'https://secret:token@news.example.com/a';
    },
  ],
  [
    '无请求检索记录',
    (value) => {
      value.upstreamAttempts = 0;
    },
  ],
  [
    '分页未披露',
    (value) => {
      value.nextCursor = 'next';
    },
  ],
  [
    '条目重复',
    (value) => {
      value.items.push(structuredClone(value.items[0]!));
      value.coverage.returnedCount = 2;
    },
  ],
];
it.each(corruptions)('响应拒绝%s', (_name, corrupt) => {
  const value = fresh();
  corrupt(value);
  expect(marketNewsResponseV3Schema.safeParse(value).success).toBe(false);
});

it('时区等价且微秒边界严格有序，不截断到毫秒', () => {
  expect(newsTimeMicrosV3('2026-10-17T16:00:00.000001+08:00')).toBe(
    newsTimeMicrosV3('2026-10-17T08:00:00.000001Z'),
  );
  const request = marketNewsRequestV3Schema.parse({
    ...(available.request as object),
    publishedStart: '2026-10-17T08:00:00.000001Z',
    publishedEnd: '2026-10-17T08:00:00.000001Z',
  });
  const response = fresh();
  response.coverage.publishedStart = request.publishedStart;
  response.coverage.publishedEnd = request.publishedEnd;
  response.items[0]!.publishedAt = request.publishedStart;
  expect(correlateMarketNewsV3(request, response).items).toHaveLength(1);
  response.items[0]!.publishedAt = '2026-10-17T08:00:00.000002Z';
  expect(() => correlateMarketNewsV3(request, response)).toThrow();
});

it('按 N1 引用规则去跟踪并保留身份所需的路径、端口和 query', () => {
  expect(
    canonicalNewsUrlV3('https://NEWS.example.com:443/a?utm_source=x&z=空 格&a=~&spm=x#top'),
  ).toBe('https://news.example.com:443/a?a=~&z=%E7%A9%BA+%E6%A0%BC');
  expect(canonicalNewsUrlV3('https://news.example.com')).toBe('https://news.example.com');
});

it('响应必须关联请求标识、市场身份、原窗口和限制', () => {
  const request = marketNewsRequestV3Schema.parse(available.request);
  const response = fresh();
  response.requestId = 'other';
  expect(() => correlateMarketNewsV3(request, response)).toThrow();
  response.requestId = request.requestId;
  response.coverage.publishedEnd = '2026-10-18T00:00:00Z';
  expect(() => correlateMarketNewsV3(request, response)).toThrow();
});
