import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true });
const finite = z.number().finite();
const freshnessSchema = z.enum(['live', 'delayed', 'stale', 'unknown']);

export const provenanceSchema = z.object({
  provider: z.string().min(1),
  sourceUrl: z.url().optional(),
  marketTime: isoDate,
  fetchedAt: isoDate,
  freshness: freshnessSchema,
});

export const quoteSchemaV1 = z
  .object({
    version: z.literal(1),
    symbol: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
    open: finite.nonnegative(),
    high: finite.nonnegative(),
    low: finite.nonnegative(),
    price: finite.nonnegative(),
    previousClose: finite.nonnegative(),
    volume: finite.nonnegative(),
    amount: finite.nonnegative(),
    stale: z.boolean(),
    fallbackUsed: z.boolean().optional(),
    servedFromCache: z.boolean().optional(),
  })
  .merge(provenanceSchema)
  .refine(
    (quote) => quote.high >= Math.max(quote.open, quote.low, quote.price),
    '最高价低于其他价格',
  )
  .refine(
    (quote) => quote.low <= Math.min(quote.open, quote.high, quote.price),
    '最低价高于其他价格',
  );

export const barSchemaV1 = z
  .object({
    version: z.literal(1),
    symbol: z.string().min(1),
    timeframe: z.enum(['1m', '1d']),
    timestamp: isoDate,
    open: finite.nonnegative(),
    high: finite.nonnegative(),
    low: finite.nonnegative(),
    close: finite.nonnegative(),
    volume: finite.nonnegative(),
    amount: finite.nonnegative(),
    provider: z.string().min(1),
    fetchedAt: isoDate.default(() => new Date().toISOString()),
    freshness: freshnessSchema.default('unknown'),
    fallbackUsed: z.boolean().default(false),
    servedFromCache: z.boolean().default(false),
  })
  .refine((bar) => bar.high >= Math.max(bar.open, bar.close, bar.low), 'OHLC 最高价非法')
  .refine((bar) => bar.low <= Math.min(bar.open, bar.close, bar.high), 'OHLC 最低价非法');

export const barsSchemaV1 = z.array(barSchemaV1).superRefine((bars, context) => {
  for (let index = 1; index < bars.length; index += 1) {
    if (bars[index - 1]!.timestamp >= bars[index]!.timestamp) {
      context.addIssue({
        code: 'custom',
        message: 'Bar 必须按时间升序且时间唯一',
        path: [index, 'timestamp'],
      });
    }
  }
});

export const indicatorSchemaV1 = z.object({
  version: z.literal(1),
  symbol: z.string().min(1),
  name: z.enum(['MA', 'MACD', 'RSI', 'ATR']),
  parameters: z.record(z.string(), z.number()),
  timeframe: z.enum(['1m', '1d']),
  marketTime: isoDate,
  calculatedAt: isoDate,
  values: z.record(z.string(), z.union([z.number(), z.array(z.number())])),
  provider: z.string().min(1),
  fallbackUsed: z.boolean().optional(),
  engineVersion: z.string().min(1),
});

export const chipDistributionSchemaV1 = z.object({
  version: z.literal(1),
  symbol: z.string().min(1),
  buckets: z
    .array(z.object({ price: finite.nonnegative(), weight: finite.min(0).max(1) }))
    .min(1)
    .optional(),
  averageCost: finite.nonnegative(),
  mainPeak: finite.nonnegative().optional(),
  profitRatio: finite.min(0).max(1),
  range70: z.tuple([finite.nonnegative(), finite.nonnegative()]),
  range90: z.tuple([finite.nonnegative(), finite.nonnegative()]),
  concentration: finite.min(0).max(1),
  provider: z.string().min(1),
  fallbackUsed: z.boolean().optional(),
  engineVersion: z.string().min(1),
  calculatedAt: isoDate,
});

export const fundNavSchemaV1 = z.object({
  version: z.literal(1),
  symbol: z.string().regex(/^\d{6}\.OF$/),
  unitNav: finite.nonnegative(),
  navDate: isoDate,
  provider: z.string().min(1),
  fetchedAt: isoDate,
  freshness: z.enum(['delayed', 'stale', 'unavailable']),
  fallbackUsed: z.boolean().optional(),
  servedFromCache: z.boolean().optional(),
});

export const fundNavHistorySchemaV1 = z.array(fundNavSchemaV1).superRefine((points, context) => {
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1]!.navDate >= points[index]!.navDate) {
      context.addIssue({
        code: 'custom',
        message: '基金净值历史必须按时间升序且日期唯一',
        path: [index, 'navDate'],
      });
    }
  }
});

export const controlEnvelopeSchema = z.object({
  contractVersion: z.literal(1),
  consumer: z.literal('thesis-ledger'),
  requestId: z.string().min(1),
});

export const providerRouteMatrixSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(z.string())),
);

export const desiredProviderPolicySchema = controlEnvelopeSchema.extend({
  revision: z.number().int().positive(),
  enabled: z.boolean(),
  routes: providerRouteMatrixSchema,
});

export const providerManifestSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  version: z.number().int().positive(),
  capabilities: z.record(z.string(), z.array(z.string())),
  configured: z.boolean(),
  enabled: z.boolean(),
  credentialConfigured: z.boolean(),
  requiresCredential: z.boolean().optional(),
  updatedAt: isoDate.nullable().optional(),
});

export const effectiveProviderPolicySchema = z.object({
  contractVersion: z.literal(1),
  consumer: z.literal('thesis-ledger'),
  revision: z.number().int().nonnegative(),
  sourceDesiredRevision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  routes: providerRouteMatrixSchema,
  routeStatus: z.record(z.string(), z.record(z.string(), z.unknown())),
  appliedAt: isoDate,
});

export const catalogItemSchema = z.object({
  canonicalCode: z.string().min(1),
  instrumentType: z.string().min(1),
  market: z.string().min(1),
  displayName: z.string().min(1),
});

export const catalogSnapshotSchema = z.object({
  contractVersion: z.literal(1),
  generation: z.number().int().positive(),
  checksum: z.string().min(1),
  cursor: z.string().min(1),
  complete: z.boolean(),
  items: z.array(catalogItemSchema),
});
export const catalogDeltaSchema = catalogSnapshotSchema.extend({
  fromCursor: z.string().min(1),
  deleted: z.array(
    catalogItemSchema.pick({ canonicalCode: true, instrumentType: true, market: true }),
  ),
  requiresFullSnapshot: z.boolean().optional(),
});
export type QuoteV1 = z.infer<typeof quoteSchemaV1>;
export type BarInputV1 = z.input<typeof barSchemaV1>;
export type BarV1 = z.output<typeof barSchemaV1>;
export type IndicatorV1 = z.infer<typeof indicatorSchemaV1>;
export type ChipDistributionV1 = z.infer<typeof chipDistributionSchemaV1>;
export type FundNavV1 = z.infer<typeof fundNavSchemaV1>;
export type FundNavHistoryV1 = z.infer<typeof fundNavHistorySchemaV1>;
export type ControlEnvelope = z.infer<typeof controlEnvelopeSchema>;
export type DesiredProviderPolicy = z.infer<typeof desiredProviderPolicySchema>;
export type ProviderManifest = z.infer<typeof providerManifestSchema>;
export type EffectiveProviderPolicy = z.infer<typeof effectiveProviderPolicySchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export type CatalogDelta = z.infer<typeof catalogDeltaSchema>;
