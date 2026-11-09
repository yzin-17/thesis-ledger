import { z } from 'zod';
import { currencySchema } from './market.js';
import { marketQuoteSymbolSchema } from './market-quote-identity.js';
import { positiveDecimalStringSchema } from './monetary-values.js';

const tradeChartSymbolSchema = z.union([marketQuoteSymbolSchema, z.string().regex(/^\d{6}\.OF$/)]);

export const tradeChartQuerySchema = z
  .strictObject({
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']).default('actual'),
    symbol: tradeChartSymbolSchema,
    start: z.iso.date(),
    end: z.iso.date(),
  })
  .refine((value) => value.start <= value.end, '成交叠加日期窗口必须有序');
export type TradeChartQuery = z.infer<typeof tradeChartQuerySchema>;
export const tradeChartMarkerSchema = z.strictObject({
  id: z.string().min(1),
  eventId: z.string().min(1),
  factId: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  occurredAt: z.iso.datetime({ offset: true }),
  tradingDate: z.iso.date(),
  timePrecision: z.enum(['INSTANT', 'DATE']),
  currency: currencySchema,
  price: positiveDecimalStringSchema,
  quantity: positiveDecimalStringSchema,
});
export type TradeChartMarker = z.infer<typeof tradeChartMarkerSchema>;
const scope = z.strictObject({
  version: z.literal('trade-chart-v1'),
  accountId: z.uuid(),
  mode: z.enum(['actual', 'shadow']),
  symbol: tradeChartSymbolSchema,
  start: z.iso.date(),
  end: z.iso.date(),
  ledgerRevision: z.string().regex(/^\d+$/),
  projectionGeneration: z.string().regex(/^\d+$/),
  generatedAt: z.iso.datetime({ offset: true }),
});
export const tradeChartResponseSchema = z.discriminatedUnion('status', [
  scope.extend({
    status: z.literal('ready'),
    markers: z.array(tradeChartMarkerSchema).max(1000),
    omittedCount: z.number().int().nonnegative(),
    unplacedCount: z.number().int().nonnegative(),
    unplacedCountScope: z.literal('symbol-all-dates'),
  }),
  scope.extend({
    status: z.literal('unavailable'),
    reason: z.enum([
      'account_scope_unavailable',
      'marker_budget_exceeded',
      'projection_inconsistent',
    ]),
  }),
]);
export type TradeChartResponse = z.infer<typeof tradeChartResponseSchema>;
