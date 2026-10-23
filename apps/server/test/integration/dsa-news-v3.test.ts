import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { marketNewsRequestV3Schema, type MarketNewsResponseV3 } from '@thesis-ledger/schemas';
import { DsaClient, DsaError } from '../../src/integration/dsa/dsa.client.js';
import { DsaDataCapabilityReaderV3 } from '../../src/integration/dsa/dsa-data-capability-reader-v3.js';
import {
  DsaNewsError,
  mapNewsV3HttpError,
  parseNewsResponseV3,
} from '../../src/integration/dsa/dsa-news-v3.js';

type Sample = { name: string; request: unknown; response: unknown; requestValid: boolean };
const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../packages/schemas/fixtures/news-search-v1.samples.json', import.meta.url),
    'utf8',
  ),
) as { samples: Sample[] };
const samples = fixture.samples.filter((sample) => sample.requestValid && sample.response !== null);
const available = samples.find((sample) => sample.name === 'available')!;
const unavailable = samples.find((sample) => sample.name === 'not_admitted')!;
const request = marketNewsRequestV3Schema.parse(available.request);
const fresh = () => structuredClone(available.response) as MarketNewsResponseV3;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(samples)('同版 N1 样例经实际新闻 reader：$name', async (sample) => {
  const post = vi.fn<
    (path: string, request: unknown, mapper: unknown, budget?: number) => Promise<unknown>
  >(async () => sample.response);
  const reader = new DsaDataCapabilityReaderV3(post, (parse) => parse());
  const input = marketNewsRequestV3Schema.parse(sample.request);
  expect(await reader.news(input)).toEqual(sample.response);
  expect(post).toHaveBeenCalledOnce();
  expect(post.mock.calls[0]?.[0]).toBe('/api/v3/thesis-ledger/market/news');
});

it.each(['id', 'evidenceGroupId'] as const)('拒绝格式合法但哈希错绑的 %s', (field) => {
  const response = fresh();
  const prefix = field === 'id' ? 'news-item-v1:' : 'news-evidence-v1:';
  response.items[0]![field] = prefix + 'f'.repeat(64);
  expect(() => parseNewsResponseV3(response, request)).toThrowError(
    expect.objectContaining({ code: 'invalid-response' }),
  );
});

function client() {
  return Object.assign(Object.create(DsaClient.prototype), {
    config: {
      dsaBaseUrl: 'https://dsa.example.test',
      dsaTimeoutMs: 5000,
      dsaToken: 'controlled-data-token',
    },
  }) as DsaClient;
}

it('DsaClient 使用 Data Token、单次 POST 和受请求预算约束的期限', async () => {
  const deadline = vi.spyOn(AbortSignal, 'timeout');
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(String(url)).toBe('https://dsa.example.test/api/v3/thesis-ledger/market/news');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe(
      'Bearer controlled-data-token',
    );
    expect(JSON.parse(String(init?.body))).toEqual({ ...request, requestBudgetMs: 750 });
    return new Response(JSON.stringify(available.response), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  expect(await client().marketNewsV3({ ...request, requestBudgetMs: 750 })).toEqual(
    available.response,
  );
  expect(deadline).toHaveBeenCalledWith(750);
  expect(fetch).toHaveBeenCalledOnce();
});

it('HTTP 来源失败保留完整新闻错误合同，未准入仍为零上游尝试', async () => {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify(unavailable.response), { status: 503 }),
  );
  vi.stubGlobal('fetch', fetch);
  const error: unknown = await client()
    .marketNewsV3(request)
    .catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DsaError);
  expect(error).toBeInstanceOf(DsaNewsError);
  expect(error).toMatchObject({
    code: 'control-rejected',
    sourceReason: 'not_admitted',
    response: unavailable.response,
  });
  expect(fetch).toHaveBeenCalledOnce();
});

it.each([404, 405, 401, 403])('HTTP %s 不重试或回退原生分析', async (status) => {
  const fetch = vi.fn(async () => new Response('{}', { status }));
  vi.stubGlobal('fetch', fetch);
  await expect(client().marketNewsV3(request)).rejects.toMatchObject({
    code: status === 401 || status === 403 ? 'unauthorized' : 'unsupported-capability',
  });
  expect(fetch).toHaveBeenCalledOnce();
});

it('网络异常与无效 JSON 不合成成功空结果，不增加重试', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(new Response('not-json', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await expect(client().marketNewsV3(request)).rejects.toMatchObject({ code: 'unavailable' });
  await expect(client().marketNewsV3(request)).rejects.toMatchObject({ code: 'invalid-response' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([
  ['missing_credentials', 'source-authentication-failed'],
  ['configuration_failure', 'unavailable'],
  ['rate_limited', 'unavailable'],
  ['timeout', 'timeout'],
  ['upstream_failure', 'unavailable'],
  ['ambiguous_instrument', 'source-symbol-unrecognized'],
  ['invalid_request', 'invalid-request'],
  ['not_covered', 'insufficient-coverage'],
  ['unsupported', 'unsupported-capability'],
] as const)('保留 %s 的原始原因并映射客户端代码', (sourceCode, code) => {
  const response = structuredClone(unavailable.response) as MarketNewsResponseV3;
  response.errors[0]!.code = sourceCode;
  expect(mapNewsV3HttpError(503, response, request)).toMatchObject({
    code,
    sourceReason: sourceCode,
    response,
  });
});

it('错误响应也拒绝 requestId 错绑', () => {
  const response = structuredClone(unavailable.response) as MarketNewsResponseV3;
  response.requestId = 'other';
  expect(mapNewsV3HttpError(503, response, request)).toMatchObject({ code: 'invalid-response' });
});

it.each([
  [404, 'not_covered', 'insufficient-coverage'],
  [403, 'missing_credentials', 'source-authentication-failed'],
] as const)('HTTP %s 的合法来源错误优先于裸状态码分类', (status, sourceCode, code) => {
  const response = structuredClone(unavailable.response) as MarketNewsResponseV3;
  response.errors[0]!.code = sourceCode;
  expect(mapNewsV3HttpError(status, response, request)).toMatchObject({
    code,
    sourceReason: sourceCode,
    response,
  });
});
