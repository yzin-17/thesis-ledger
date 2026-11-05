import { z } from 'zod';
import { quoteSchema } from './market.js';
import { marketQuoteSymbolSchema, quoteAssetTypeSchema } from './market-quote-identity.js';

export const MARKET_QUOTE_BATCH_MAX_ITEMS = 100;
export const marketQuoteIdentitySchema = z.strictObject({
  symbol: z.string().trim().toUpperCase().pipe(marketQuoteSymbolSchema),
  assetType: quoteAssetTypeSchema,
});
export type MarketQuoteIdentity = z.infer<typeof marketQuoteIdentitySchema>;
export const marketQuoteBatchRequestSchema = z.strictObject({
  items: z.array(marketQuoteIdentitySchema).min(1).max(MARKET_QUOTE_BATCH_MAX_ITEMS),
});
export type MarketQuoteBatchRequest = z.infer<typeof marketQuoteBatchRequestSchema>;
const result = z.discriminatedUnion('status', [
  z.strictObject({
    identity: marketQuoteIdentitySchema,
    status: z.enum(['ready', 'stale']),
    quote: quoteSchema,
  }),
  z.strictObject({
    identity: marketQuoteIdentitySchema,
    status: z.literal('unavailable'),
    error: z.strictObject({
      code: z.string().regex(/^[a-z][a-z_-]{0,63}$/),
      reason: z.enum(['disabled', 'not_selected', 'not_eligible']).optional(),
    }),
  }),
]);
export const marketQuoteBatchResponseSchema = z
  .strictObject({
    version: z.literal('market-quote-batch-v1'),
    requestedCount: z.number().int().min(1).max(MARKET_QUOTE_BATCH_MAX_ITEMS),
    results: z.array(result).min(1).max(MARKET_QUOTE_BATCH_MAX_ITEMS),
  })
  .superRefine((value, context) => {
    const keys = value.results.map((item) => `${item.identity.symbol}:${item.identity.assetType}`);
    if (
      keys.length > value.requestedCount ||
      new Set(keys).size !== keys.length ||
      value.results.some(
        (item) =>
          item.status !== 'unavailable' &&
          (item.quote.symbol !== item.identity.symbol ||
            (item.status === 'stale') !== item.quote.stale),
      )
    )
      context.addIssue({ code: 'custom', message: '批量报价的身份、状态或去重数量不一致' });
  });
export type MarketQuoteBatchResponse = z.infer<typeof marketQuoteBatchResponseSchema>;
