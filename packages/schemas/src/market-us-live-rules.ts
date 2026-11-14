import { z } from 'zod';

/** 独立当前规则，生效期不能代替已经核查的日期范围。 */
export const marketUsLiveRulesSchema = z.object({
  version: z.literal(1), ruleSetId: z.string().min(1),
  market: z.literal('US'), currency: z.literal('USD'),
  assetTypes: z.array(z.enum(['STOCK', 'ETF'])).min(1),
  exchanges: z.array(z.enum(['US_NYSE', 'US_NASDAQ', 'US_AMEX'])).min(1),
  effectiveFrom: z.iso.date(), effectiveUntil: z.iso.date(), verifiedThrough: z.iso.date(),
  reviewedAt: z.iso.datetime({ offset: true }), observedAt: z.iso.datetime({ offset: true }),
  provider: z.literal('official-us-rules'),
  priceIncrements: z.object({ atOrAboveOne: z.literal('0.01'), belowOne: z.literal('0.0001') }).strict(),
  positionSettlementDays: z.literal(1), sellCashSettlementDays: z.literal(1),
  section31SellRate: z.literal('0.0000206'), tafSellRatePerShare: z.literal('0'), tafSellMaximum: z.literal('0'),
  sources: z.array(z.object({
    id: z.string().min(1), url: z.url(), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict()).min(1),
}).strict();
