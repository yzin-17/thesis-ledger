import { z } from 'zod';

/** 当前来源快照，不能用作历史可见事实或法定交易规则。 */
export const marketQuoteExecutionFactsSchema = z
  .object({
    version: z.literal(1),
    symbol: z.string().regex(/^(?:[A-Z][A-Z0-9.-]*\.US|[0-9]{5}\.HK)$/),
    market: z.enum(['HK', 'US']),
    assetType: z.enum(['STOCK', 'ETF']),
    exchange: z.string().min(1).nullable(),
    securityId: z.string().min(1).nullable(),
    sharesPerLot: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .nullable(),
    delisted: z.boolean().nullable(),
    tradingState: z.enum(['normal', 'suspended', 'unknown']),
    securityStatus: z.string().min(1).nullable(),
    marketTime: z.iso.datetime({ offset: true }).nullable(),
    observedAt: z.iso.datetime({ offset: true }),
    provider: z.literal('futu'),
    responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine((value) => value.symbol.endsWith('.' + value.market), '当前执行观察的市场与证券不符');
