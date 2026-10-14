import { z } from 'zod';
import { marketQuoteSymbolSchema } from './market-quote-identity.js';
import { securityLotSharesSchema } from './market-security-lot-size.js';

export const securityStaticSymbolSchema = marketQuoteSymbolSchema
  .refine(value => !value.startsWith('^') && (value.endsWith('.HK') || value.endsWith('.US')), '静态资料仅接入港美股票或 ETF');
export const securityStaticAssetTypeSchema = z.enum(['STOCK', 'ETF']);
export const securityStaticInfoRequestSchema = z.strictObject({
  contractVersion: z.literal(3), consumer: z.literal('thesis-ledger'),
  requestId: z.string().trim().min(1), symbol: securityStaticSymbolSchema,
  assetType: securityStaticAssetTypeSchema,
});

export const securityStaticInfoResponseSchema = securityStaticInfoRequestSchema.extend({
  market: z.enum(['HK', 'US']), name: z.string().trim().min(1).nullable(),
  securityId: z.string().regex(/^[1-9]\d*$/).nullable(), sharesPerLot: securityLotSharesSchema.nullable(),
  listingDate: z.iso.date().nullable(), delisted: z.boolean().nullable(),
  exchange: z.string().trim().min(1).nullable(), provider: z.literal('futu'),
  historicalChanges: z.literal('unverified'), observedAt: z.iso.datetime({ offset: true }),
  fetchedAt: z.iso.datetime({ offset: true }), policyRevision: z.number().int().positive(),
  routeTarget: z.strictObject({
    providerId: z.literal('futu'), upstreamSource: z.literal('futu'),
    routeIndex: z.number().int().min(0).max(1),
  }),
}).superRefine((value, context) => {
  if (!value.symbol.endsWith(`.${value.market}`))
    context.addIssue({ code: 'custom', path: ['market'], message: '静态资料市场与证券不一致' });
  if (Date.parse(value.observedAt) > Date.parse(value.fetchedAt))
    context.addIssue({ code: 'custom', path: ['observedAt'], message: '资料观察不能晚于响应时间' });
});
export type SecurityStaticInfoResponse = z.infer<typeof securityStaticInfoResponseSchema>;
export type SecurityStaticAssetType = z.infer<typeof securityStaticAssetTypeSchema>;
