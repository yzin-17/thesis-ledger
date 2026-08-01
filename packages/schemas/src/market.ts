import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true });
const finite = z.number().finite();

export const provenanceSchema = z.object({
  provider: z.string().min(1),
  sourceUrl: z.url().optional(),
  marketTime: isoDate,
  fetchedAt: isoDate,
  freshness: z.enum(['live', 'delayed', 'stale', 'unknown']),
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
  engineVersion: z.string().min(1),
});

export const chipDistributionSchemaV1 = z.object({
  version: z.literal(1),
  symbol: z.string().min(1),
  buckets: z.array(z.object({ price: finite.nonnegative(), weight: finite.min(0).max(1) })).min(1),
  averageCost: finite.nonnegative(),
  mainPeak: finite.nonnegative(),
  profitRatio: finite.min(0).max(1),
  range70: z.tuple([finite.nonnegative(), finite.nonnegative()]),
  range90: z.tuple([finite.nonnegative(), finite.nonnegative()]),
  concentration: finite.min(0).max(1),
  provider: z.string().min(1),
  engineVersion: z.string().min(1),
  calculatedAt: isoDate,
});

export type QuoteV1 = z.infer<typeof quoteSchemaV1>;
export type BarV1 = z.infer<typeof barSchemaV1>;
export type IndicatorV1 = z.infer<typeof indicatorSchemaV1>;
export type ChipDistributionV1 = z.infer<typeof chipDistributionSchemaV1>;
