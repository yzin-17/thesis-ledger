import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  correlateMarketNewsRead,
  marketNewsReadInputSchema,
  marketNewsReadResultSchema,
} from '../src/market-news-read.js';
import { marketNewsRequestV3Schema, marketNewsResponseV3Schema } from '../src/market-news-v3.js';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/news-search-v1.samples.json', import.meta.url), 'utf8'),
) as {
  samples: { name: string; request: unknown; response: unknown; requestValid: boolean }[];
};
const samples = fixture.samples.filter((sample) => sample.requestValid && sample.response !== null);
function readModel(raw: unknown) {
  const {
    instrument,
    status,
    items,
    coverage,
    errors,
    route,
    fetchedAt,
    upstreamAttempts,
    nextCursor,
  } = marketNewsResponseV3Schema.parse(raw);
  return {
    instrument,
    status,
    items,
    coverage,
    errors,
    source: route,
    fetchedAt,
    upstreamAttempts,
    nextCursor,
    cacheIdentity: status === 'unavailable' ? null : `market-news-v1:${'a'.repeat(64)}`,
  };
}
function input(raw: unknown) {
  const { instrument, publishedStart, publishedEnd, limit, cursor, requestBudgetMs } =
    marketNewsRequestV3Schema.parse(raw);
  return { instrument, publishedStart, publishedEnd, limit, cursor, requestBudgetMs };
}
const sample = samples.find((value) => value.name === 'available')!;
it.each(samples)('Market 读模型复用 V3 $name 的数据约束', (value) => {
  const result = readModel(value.response);
  expect(correlateMarketNewsRead(input(value.request), result)).toEqual(result);
});
it('允许服务失败的未知抓取时间和未知尝试数', () => {
  const value = readModel(sample.response);
  expect(
    marketNewsReadResultSchema.parse({
      ...value,
      status: 'unavailable',
      items: [],
      fetchedAt: null,
      upstreamAttempts: null,
      source: null,
      cacheIdentity: null,
      coverage: {
        ...value.coverage,
        complete: false,
        returnedCount: 0,
        uniqueEvidenceCount: 0,
        missingReasons: ['service_unavailable'],
      },
      errors: [
        {
          code: 'service_unavailable',
          message: '服务不可用',
          providerId: null,
          upstreamSource: null,
        },
      ],
    }).upstreamAttempts,
  ).toBeNull();
});
it.each([
  { publishedStart: '2026-10-22T00:00:00Z', publishedEnd: '2026-10-21T00:00:00Z' },
  { requestId: '客户端不得指定内部关联身份' },
  { accountId: '私人材料' },
  { requestBudgetMs: 30_001 },
])('拒绝无效输入 %j', (extra) => {
  expect(marketNewsReadInputSchema.safeParse({ ...input(sample.request), ...extra }).success).toBe(
    false,
  );
});
it.each(['instrument', 'window', 'binding', 'count', 'reference', 'attempt', 'cache'])(
  '拒绝错绑或不实的 %s',
  (kind) => {
    const result = readModel(sample.response);
    if (kind === 'instrument') result.instrument.symbol = '600000.SH';
    if (kind === 'window') result.coverage.publishedStart = '2026-10-16T00:00:00Z';
    if (kind === 'binding')
      result.items[0]!.relatedInstruments = [
        { market: 'US', assetType: 'STOCK', symbol: 'MSFT.US' },
      ];
    if (kind === 'count') result.coverage.returnedCount += 1;
    if (kind === 'reference') result.items[0]!.sourceUrls = [];
    if (kind === 'attempt') result.upstreamAttempts = 0;
    if (kind === 'cache') result.cacheIdentity = null;
    expect(() => correlateMarketNewsRead(input(sample.request), result)).toThrow();
  },
);
