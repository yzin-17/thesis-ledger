import { z } from 'zod';
import {
  isOrderedNewsWindowV3,
  marketNewsRequestV3Schema,
  marketNewsResponseV3Schema,
  validateMarketNewsContentV3,
} from './market-news-v3.js';
import { marketNewsReadResultSchema } from './market-news-read.js';

export const marketNewsFeedEndpointV3 = '/api/v3/thesis-ledger/market/news-feed';
const requestFields = z
  .strictObject(marketNewsRequestV3Schema.shape)
  .omit({ instrument: true }).shape;
const { instrument: responseInstrument, ...responseFields } = marketNewsResponseV3Schema.shape;
const feedItem = responseFields.items.element.safeExtend({
  relatedInstruments: z.array(responseInstrument).max(0),
});
const coverage = z
  .strictObject({
    ...responseFields.coverage.shape,
    basis: z.literal('current-feed').default('current-feed'),
  })
  .refine(isOrderedNewsWindowV3, '快讯时间窗口必须有序');
export const marketNewsFeedRequestV3Schema = z
  .strictObject({
    ...requestFields,
    contractVersion: z.literal('news-feed-v1').default('news-feed-v1'),
    capability: z.literal('NEWS_FEED').default('NEWS_FEED'),
    market: z.literal('CN'),
    providerId: z.string().min(1).max(128).nullable().default(null),
  })
  .refine(isOrderedNewsWindowV3, '快讯时间窗口必须有序');
export const marketNewsFeedResponseV3Schema = z
  .strictObject({
    ...responseFields,
    contractVersion: z.literal('news-feed-v1').default('news-feed-v1'),
    capability: z.literal('NEWS_FEED').default('NEWS_FEED'),
    market: z.literal('CN'),
    items: z.array(feedItem).max(50),
    coverage,
  })
  .superRefine(validateMarketNewsContentV3);

const readFields = z
  .strictObject(marketNewsFeedRequestV3Schema.shape)
  .omit({ version: true, contractVersion: true, capability: true, requestId: true }).shape;
export const marketNewsFeedReadInputSchema = z
  .strictObject(readFields)
  .refine(isOrderedNewsWindowV3, '快讯时间窗口必须有序');
const readResultFields = z
  .strictObject(marketNewsReadResultSchema.shape)
  .omit({ instrument: true }).shape;
export const marketNewsFeedReadResultSchema = z
  .strictObject({
    ...readResultFields,
    market: z.literal('CN'),
    items: z.array(feedItem).max(50),
    coverage,
    cacheIdentity: z
      .string()
      .regex(/^market-news-feed-v1:[a-f0-9]{64}$/)
      .nullable(),
  })
  .superRefine((value, context) => {
    validateMarketNewsContentV3({ ...value, route: value.source }, context);
    if (value.status === 'unavailable' && value.cacheIdentity !== null)
      context.addIssue({ code: 'custom', message: '不可用快讯不能复用成功缓存' });
    if (
      value.status !== 'unavailable' &&
      (value.fetchedAt === null || value.cacheIdentity === null)
    )
      context.addIssue({ code: 'custom', message: '快讯结果缺少抓取时间或缓存身份' });
  });

export type MarketNewsFeedRequestV3 = z.infer<typeof marketNewsFeedRequestV3Schema>;
export type MarketNewsFeedResponseV3 = z.infer<typeof marketNewsFeedResponseV3Schema>;
export type MarketNewsFeedReadInput = z.input<typeof marketNewsFeedReadInputSchema>;
export type MarketNewsFeedResult = z.infer<typeof marketNewsFeedReadResultSchema>;

function checkFeedScope(
  input: z.infer<typeof marketNewsFeedReadInputSchema>,
  result: Pick<MarketNewsFeedResponseV3, 'market' | 'coverage' | 'items'>,
  source: MarketNewsFeedResponseV3['route'],
) {
  if (
    result.market !== input.market ||
    result.coverage.publishedStart !== input.publishedStart ||
    result.coverage.publishedEnd !== input.publishedEnd ||
    result.items.length > input.limit ||
    (source !== null && input.providerId !== null && source.providerId !== input.providerId)
  )
    throw new Error('快讯结果没有绑定本次市场、来源与时间窗口');
}

export function correlateMarketNewsFeedV3(input: MarketNewsFeedRequestV3, raw: unknown) {
  const checked = marketNewsFeedRequestV3Schema.parse(input);
  const result = marketNewsFeedResponseV3Schema.parse(raw);
  checkFeedScope(checked, result, result.route);
  if (result.requestId !== checked.requestId) throw new Error('快讯响应请求身份不一致');
  return result;
}

export function correlateMarketNewsFeedRead(input: MarketNewsFeedReadInput, raw: unknown) {
  const checked = marketNewsFeedReadInputSchema.parse(input);
  const result = marketNewsFeedReadResultSchema.parse(raw);
  checkFeedScope(checked, result, result.source);
  return result;
}
