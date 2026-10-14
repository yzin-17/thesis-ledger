import { z } from 'zod';

const nonEmptyUnique = <T extends z.ZodType<string>>(item: T) => z.array(item).min(1)
  .refine((values) => new Set(values).size === values.length);
/** 来源参数资格事实；不是本次窗口已经完整的证明。 */
export const statusQuerySupportV1Schema = z.discriminatedUnion('capability', [
  z.strictObject({ capability: z.literal('DAILY_TRADING_STATUS'), granularity: z.literal('day'), maximumWindowDays: z.number().int().positive() }),
  z.strictObject({ capability: z.literal('RISK_WARNING'), detailKinds: nonEmptyUnique(z.enum(['coarseST', 'riskCategories'])),
    riskCategories: z.array(z.enum(['delisting', 'other'])).max(2).refine((values) => new Set(values).size === values.length),
  }).refine((value) => value.detailKinds.includes('riskCategories') === (value.riskCategories.length > 0)),
  z.strictObject({ capability: z.literal('DAILY_PRICE_RULE'), representations: nonEmptyUnique(z.enum(['rule', 'exactPrices'])) }),
  z.strictObject({ capability: z.literal('SECURITY_BASIC_DATES'), fields: nonEmptyUnique(z.enum(['ipoDate', 'outDate'])) }),
  z.strictObject({ capability: z.literal('LISTING_PHASE'), phases: nonEmptyUnique(z.enum(['notListed', 'initialListing', 'listed', 'delistingPeriod', 'delisted'])) }),
]);
export type StatusQuerySupportV1 = z.infer<typeof statusQuerySupportV1Schema>;
