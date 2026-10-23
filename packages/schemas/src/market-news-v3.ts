import { z } from 'zod';
import {
  canonicalNewsUrlV3,
  isNewsInstrumentV3,
  newsTimeMicrosV3,
} from './market-news-v3-primitives.js';

export const marketNewsEndpointV3 = '/api/v3/thesis-ledger/market/news';
export const marketNewsContractVersionV3 = 'news-search-v1';
const text = (max: number) => z.string().min(1).max(max);
const timestamp = z
  .string()
  .refine((value) => newsTimeMicrosV3(value) !== null, '新闻时间必须有效且包含时区');
const nullableTime = timestamp.nullable();
const url = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => {
    try {
      canonicalNewsUrlV3(value);
      return true;
    } catch {
      return false;
    }
  }, '新闻引用必须是无凭据的 HTTP(S) URL');
const instrument = z
  .strictObject({
    market: z.enum(['CN', 'HK', 'US']),
    assetType: z.enum(['STOCK', 'ETF', 'INDEX', 'MUTUAL_FUND']),
    symbol: text(80),
  })
  .refine(isNewsInstrumentV3, '新闻标的必须使用与市场一致的规范代码');
const identity = {
  version: z.literal(3).default(3),
  contractVersion: z.literal(marketNewsContractVersionV3).default(marketNewsContractVersionV3),
  capability: z.literal('NEWS_SEARCH').default('NEWS_SEARCH'),
  requestId: text(128),
  instrument,
};
const window = {
  publishedStart: nullableTime.default(null),
  publishedEnd: nullableTime.default(null),
};
export const isOrderedNewsWindowV3 = (value: {
  publishedStart: string | null;
  publishedEnd: string | null;
}) =>
  value.publishedStart === null ||
  value.publishedEnd === null ||
  (newsTimeMicrosV3(value.publishedStart) ?? 0n) <= (newsTimeMicrosV3(value.publishedEnd) ?? 0n);

export const marketNewsRequestV3Schema = z
  .strictObject({
    ...identity,
    ...window,
    limit: z.number().int().min(1).max(50).default(20),
    cursor: text(2048).nullable().default(null),
    requestBudgetMs: z.number().int().min(1).max(30_000).default(30_000),
  })
  .refine(isOrderedNewsWindowV3, '新闻发布时间窗口必须有序');

export const marketNewsErrorV3Schema = z.strictObject({
  code: z.enum([
    'not_admitted',
    'missing_credentials',
    'configuration_failure',
    'rate_limited',
    'timeout',
    'upstream_failure',
    'ambiguous_instrument',
    'invalid_request',
    'not_covered',
    'unsupported',
  ]),
  message: text(512),
  providerId: z.string().nullable().default(null),
  upstreamSource: z.string().nullable().default(null),
});
const route = z.strictObject({
  providerId: text(128),
  upstreamSource: text(128),
  policyRevision: text(200),
  routeRevision: text(200),
  credentialRevision: text(200).nullable().default(null),
});
const itemShape = z.strictObject({
  id: z.string().regex(/^news-item-v1:[a-f0-9]{64}$/),
  title: text(1000).refine((value) => value.trim().length > 0),
  url,
  originalUrl: url.nullable().default(null),
  publisher: text(256).nullable().default(null),
  providerId: text(128),
  sourceItemId: text(256).nullable().default(null),
  contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceGroupId: z.string().regex(/^news-evidence-v1:[a-f0-9]{64}$/),
  excerpt: z.string().max(20_000).nullable().default(null),
  summaryKind: z.literal('provider-excerpt').default('provider-excerpt'),
  publishedAt: nullableTime,
  sourceAvailableAt: nullableTime,
  fetchedAt: timestamp,
  relatedInstruments: z.array(instrument).min(1),
  sourceUrls: z.array(url).min(1).max(100),
});
type NewsItem = z.infer<typeof itemShape>;
const item = itemShape.superRefine((value, context) => {
  const fetched = newsTimeMicrosV3(value.fetchedAt);
  for (const name of ['publishedAt', 'sourceAvailableAt'] as const) {
    const time = value[name] === null ? null : newsTimeMicrosV3(value[name]);
    if (fetched !== null && time !== null && time > fetched)
      context.addIssue({ code: 'custom', message: '新闻来源时间不能晚于抓取时间', path: [name] });
  }
  try {
    const urls = new Set(value.sourceUrls.map(canonicalNewsUrlV3));
    if (
      !urls.has(canonicalNewsUrlV3(value.url)) ||
      (value.originalUrl !== null && !urls.has(canonicalNewsUrlV3(value.originalUrl)))
    )
      context.addIssue({ code: 'custom', message: '新闻引用缺少条目或已知原始出处' });
  } catch {
    context.addIssue({ code: 'custom', message: '新闻引用无效' });
  }
});
const coverage = z
  .strictObject({
    basis: z.literal('current-search').default('current-search'),
    ...window,
    complete: z.boolean(),
    truncated: z.boolean(),
    unknownPublishedTimeCount: z.number().int().nonnegative(),
    examinedCount: z.number().int().nonnegative().nullable().default(null),
    returnedCount: z.number().int().nonnegative(),
    uniqueEvidenceCount: z.number().int().nonnegative(),
    missingReasons: z.array(z.string().refine((value) => value.trim().length > 0)).max(50),
  })
  .refine(isOrderedNewsWindowV3, '新闻覆盖窗口必须有序');
const responseShape = z.strictObject({
  ...identity,
  status: z.enum(['available', 'partial', 'unavailable']),
  items: z.array(item).max(50),
  fetchedAt: timestamp,
  route: route.nullable(),
  upstreamAttempts: z.number().int().nonnegative(),
  nextCursor: text(2048).nullable().default(null),
  coverage,
  errors: z.array(marketNewsErrorV3Schema).max(50),
});
type NewsResponse = z.infer<typeof responseShape>;
type NewsContent = Pick<NewsResponse, 'status' | 'items' | 'route' | 'nextCursor'> & {
  instrument?: NewsResponse['instrument'];
  coverage: Omit<NewsResponse['coverage'], 'basis'> & { basis: string };
  errors: { code: string }[];
  fetchedAt: string | null;
  upstreamAttempts: number | null;
};
const fail = (context: z.RefinementCtx, message: string) =>
  context.addIssue({ code: 'custom', message });
const sameInstrument = (left: z.infer<typeof instrument>, right: z.infer<typeof instrument>) =>
  left.market === right.market &&
  left.assetType === right.assetType &&
  left.symbol === right.symbol;

function validateCounts(value: NewsContent, context: z.RefinementCtx) {
  const { coverage, items } = value;
  if (
    coverage.returnedCount !== items.length ||
    coverage.unknownPublishedTimeCount !==
      items.filter((entry) => entry.publishedAt === null).length ||
    coverage.uniqueEvidenceCount !== new Set(items.map((entry) => entry.evidenceGroupId)).size
  )
    fail(context, '新闻条数、未知时间或独立证据计数不一致');
  if (coverage.examinedCount !== null && coverage.examinedCount < items.length)
    fail(context, '已检查条数不能小于返回条数');
  try {
    if (
      new Set(items.map((entry) => canonicalNewsUrlV3(entry.url))).size !== items.length ||
      new Set(items.map((entry) => entry.id)).size !== items.length
    )
      fail(context, '新闻响应存在重复条目');
  } catch {
    fail(context, '新闻引用无效');
  }
}

function validateItemBinding(entry: NewsItem, value: NewsContent, context: z.RefinementCtx) {
  let scopeMatches = entry.relatedInstruments.length === 0;
  if (value.instrument) {
    scopeMatches = entry.relatedInstruments.some((related) =>
      sameInstrument(related, value.instrument!),
    );
  }
  if (!scopeMatches || entry.providerId !== value.route?.providerId)
    fail(context, '新闻条目必须绑定本次范围与实际来源');
  const fetched = value.fetchedAt === null ? null : newsTimeMicrosV3(value.fetchedAt);
  const itemFetched = newsTimeMicrosV3(entry.fetchedAt);
  if (fetched !== null && itemFetched !== null && itemFetched > fetched)
    fail(context, '新闻条目抓取时间不能晚于响应时间');
  const published = entry.publishedAt === null ? null : newsTimeMicrosV3(entry.publishedAt);
  const start =
    value.coverage.publishedStart === null ? null : newsTimeMicrosV3(value.coverage.publishedStart);
  const end =
    value.coverage.publishedEnd === null ? null : newsTimeMicrosV3(value.coverage.publishedEnd);
  if (
    published !== null &&
    ((start !== null && published < start) || (end !== null && published > end))
  )
    fail(context, '新闻发布时间超出请求闭区间');
}

function validateStatus(value: NewsContent, context: z.RefinementCtx) {
  const { coverage } = value;
  if (value.status === 'unavailable') {
    if (value.items.length || !value.errors.length || coverage.complete)
      fail(context, '不可用新闻必须保留错误且不能伪装完整结果');
  } else if (
    value.route === null ||
    value.upstreamAttempts === null ||
    value.upstreamAttempts === 0
  ) {
    fail(context, '可用新闻必须来自实际执行的检索');
  }
  if (
    value.errors.some((error) => error.code === 'not_admitted') &&
    (value.status !== 'unavailable' || value.upstreamAttempts !== 0)
  )
    fail(context, '未准入新闻请求必须为零上游尝试');
  const incomplete = Boolean(
    value.errors.length ||
    coverage.truncated ||
    coverage.unknownPublishedTimeCount ||
    coverage.missingReasons.length,
  );
  if (value.status === 'available' && (!coverage.complete || incomplete))
    fail(context, 'available 不能掩盖不完整原因');
  if (value.status === 'partial' && (coverage.complete || !incomplete))
    fail(context, 'partial 必须披露不完整原因');
}

function validateCoverageDisclosure(value: NewsContent, context: z.RefinementCtx) {
  const { coverage } = value;
  if (value.nextCursor !== null && !coverage.truncated) fail(context, '后续游标必须披露分页截断');
  if (coverage.truncated && !coverage.missingReasons.includes('pagination_truncated'))
    fail(context, '分页截断缺少原因');
  if (
    coverage.unknownPublishedTimeCount > 0 &&
    !coverage.missingReasons.includes('published_time_unknown')
  )
    fail(context, '未知发布时间必须保留未知覆盖');
}

export function validateMarketNewsContentV3(value: NewsContent, context: z.RefinementCtx) {
  validateCounts(value, context);
  for (const entry of value.items) validateItemBinding(entry, value, context);
  validateStatus(value, context);
  validateCoverageDisclosure(value, context);
}

export const marketNewsResponseV3Schema = responseShape.superRefine(validateMarketNewsContentV3);
export type MarketNewsRequestV3 = z.infer<typeof marketNewsRequestV3Schema>;
export type MarketNewsResponseV3 = z.infer<typeof marketNewsResponseV3Schema>;

export function correlateMarketNewsV3(request: MarketNewsRequestV3, raw: unknown) {
  const checked = marketNewsRequestV3Schema.parse(request);
  const response = marketNewsResponseV3Schema.parse(raw);
  if (
    response.requestId !== checked.requestId ||
    !sameInstrument(response.instrument, checked.instrument) ||
    response.coverage.publishedStart !== checked.publishedStart ||
    response.coverage.publishedEnd !== checked.publishedEnd ||
    response.items.length > checked.limit
  )
    throw new Error('新闻响应没有绑定本次请求');
  return response;
}

export { canonicalNewsUrlV3, newsTimeMicrosV3 } from './market-news-v3-primitives.js';
