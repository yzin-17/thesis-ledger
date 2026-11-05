import { z } from 'zod';
import { portfolioModeSchema } from './api.js';
import { currencySchema } from './market.js';

export const performancePnlRangeSchema = z.enum(['1M', '3M', '1Y', 'YTD', 'ALL']);
export const performancePnlQuerySchema = z
  .object({
    mode: portfolioModeSchema.default('actual'),
    accountId: z.uuid().optional(),
    symbol: z.string().regex(/^(?:\d{6}\.(?:SH|SZ|BJ|OF)|\d{5}\.HK|\^?[A-Z][A-Z0-9.-]{0,31}\.US)$/).optional(),
    asOf: z.iso.datetime({ offset: true }).optional(),
    baseCurrency: currencySchema.default('CNY'),
    range: performancePnlRangeSchema.default('1M'),
  })
  .strict();
export const performancePnlPointSchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
    value: z.number().finite().nullable(),
    unrealizedPnl: z.number().finite().nullable(),
    realizedPnl: z.number().finite().nullable(),
    sourceSnapshotId: z.string().min(1),
    reason: z
      .enum(['price_unavailable', 'position_unavailable', 'scope_unavailable', 'realized_unavailable', 'fx_unavailable'])
      .nullable(),
  })
  .refine((point) => (point.reason === null) === (point.value !== null), '盈亏值与可用状态不一致');
export const performancePnlResponseSchema = z.object({
  mode: portfolioModeSchema,
  accountId: z.uuid().nullable(),
  symbol: z.string().nullable().optional(),
  asOf: z.iso.datetime({ offset: true }).optional(),
  currentRealizedPnl: z.number().finite().nullable().optional(),
  currency: currencySchema,
  range: performancePnlRangeSchema,
  basis: z.literal('REALIZED_PLUS_UNREALIZED'),
  historyStart: z.iso.datetime({ offset: true }).nullable(),
  truncated: z.boolean(),
  points: z.array(performancePnlPointSchema),
});
export type PerformancePnlQuery = z.infer<typeof performancePnlQuerySchema>;
export type PerformancePnlQueryInput = z.input<typeof performancePnlQuerySchema>;
export type PerformancePnlPoint = z.infer<typeof performancePnlPointSchema>;
export type PerformancePnlResponse = z.infer<typeof performancePnlResponseSchema>;
export type PerformancePnlRange = z.infer<typeof performancePnlRangeSchema>;
