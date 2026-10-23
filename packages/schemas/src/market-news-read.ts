import { z } from 'zod';
import {
  marketNewsErrorV3Schema,
  marketNewsRequestV3Schema,
  marketNewsResponseV3Schema,
  isOrderedNewsWindowV3,
  validateMarketNewsContentV3,
} from './market-news-v3.js';

const request = marketNewsRequestV3Schema.shape;
export const marketNewsReadInputSchema = z
  .strictObject({
    instrument: request.instrument,
    publishedStart: request.publishedStart,
    publishedEnd: request.publishedEnd,
    limit: request.limit,
    cursor: request.cursor,
    requestBudgetMs: request.requestBudgetMs,
  })
  .refine(isOrderedNewsWindowV3, '新闻发布时间窗口必须有序');

const response = marketNewsResponseV3Schema.shape;
const readError = marketNewsErrorV3Schema.extend({
  code: z.union([
    marketNewsErrorV3Schema.shape.code,
    z.enum(['invalid_response', 'service_unauthorized', 'service_unavailable']),
  ]),
});
export const marketNewsReadResultSchema = z
  .strictObject({
    instrument: response.instrument,
    status: response.status,
    items: response.items,
    coverage: response.coverage,
    errors: z.array(readError).max(50),
    source: response.route,
    fetchedAt: response.fetchedAt.nullable(),
    upstreamAttempts: response.upstreamAttempts.nullable(),
    nextCursor: response.nextCursor,
    cacheIdentity: z
      .string()
      .regex(/^market-news-v1:[a-f0-9]{64}$/)
      .nullable(),
  })
  .superRefine((value, context) => {
    validateMarketNewsContentV3({ ...value, route: value.source }, context);
    if (value.status === 'unavailable' && value.cacheIdentity !== null)
      context.addIssue({ code: 'custom', message: '不可用新闻不能复用成功缓存' });
    if (
      value.status !== 'unavailable' &&
      (value.fetchedAt === null || value.cacheIdentity === null)
    )
      context.addIssue({ code: 'custom', message: '新闻结果缺少抓取时间或作用域缓存身份' });
  });

export type MarketNewsReadInput = z.input<typeof marketNewsReadInputSchema>;
export type MarketNewsResult = z.infer<typeof marketNewsReadResultSchema>;
export type MarketNewsReadError = z.infer<typeof readError>;

export function correlateMarketNewsRead(input: MarketNewsReadInput, raw: unknown) {
  const checked = marketNewsReadInputSchema.parse(input);
  const result = marketNewsReadResultSchema.parse(raw);
  if (
    result.instrument.symbol !== checked.instrument.symbol ||
    result.instrument.market !== checked.instrument.market ||
    result.instrument.assetType !== checked.instrument.assetType ||
    result.coverage.publishedStart !== checked.publishedStart ||
    result.coverage.publishedEnd !== checked.publishedEnd ||
    result.items.length > checked.limit
  )
    throw new Error('新闻结果没有绑定本次标的与时间窗口');
  return result;
}
