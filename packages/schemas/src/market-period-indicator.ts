import { z } from 'zod';
import {
  barSeriesIdentitySchema,
  indicatorCalculateRequestSchema,
  indicatorRequestSchema,
  refineUniqueIndicatorRequests,
} from './market-bar-series.js';
import { marketDerivedTimeframeSchema } from './market-period.js';

export const MARKET_PERIOD_INDICATOR_PROTOCOL = 'market-period-indicator-v1' as const;
export const MARKET_PERIOD_INDICATOR_MAX_POINTS = 3650;
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);

export const marketPeriodIndicatorContextSchema = z.strictObject({
  protocol: z.literal(MARKET_PERIOD_INDICATOR_PROTOCOL),
  aggregationFingerprint: fingerprint,
  pointFingerprint: fingerprint,
});
export type MarketPeriodIndicatorContext = z.infer<typeof marketPeriodIndicatorContextSchema>;

export const canonicalMarketPeriodIndicatorEncoding = (context: MarketPeriodIndicatorContext) =>
  JSON.stringify([
    MARKET_PERIOD_INDICATOR_PROTOCOL,
    context.aggregationFingerprint,
    context.pointFingerprint,
  ]);

export const marketPeriodIndicatorRequestSchema = z
  .strictObject({
    contractVersion: z.literal(3),
    identity: barSeriesIdentitySchema
      .extend({
        assetType: z.enum(['STOCK', 'ETF']),
        timeframe: marketDerivedTimeframeSchema,
      })
      .strict(),
    inputFingerprint: fingerprint,
    points: indicatorCalculateRequestSchema.shape.points
      .min(1)
      .max(MARKET_PERIOD_INDICATOR_MAX_POINTS),
    requests: z
      .array(
        indicatorRequestSchema.extend({
          parameters: z.record(z.string(), z.number().int().min(2).max(200)),
        }),
      )
      .min(1),
    periodContext: marketPeriodIndicatorContextSchema,
  })
  .superRefine(refineUniqueIndicatorRequests);
export type MarketPeriodIndicatorRequest = z.infer<typeof marketPeriodIndicatorRequestSchema>;

const periodCapabilitySchema = z.strictObject({
  timeframe: marketDerivedTimeframeSchema,
  kind: z.literal('derived'),
  maxInputPoints: z.literal(MARKET_PERIOD_INDICATOR_MAX_POINTS),
  parameterRange: z.strictObject({ minimum: z.literal(2), maximum: z.literal(200) }),
  indicators: z.tuple([z.literal('MA'), z.literal('MACD'), z.literal('RSI')]),
  warmupRules: z.strictObject({
    MA: z.literal('max(period,60)-1'),
    MACD: z.literal('slow+signal'),
    RSI: z.literal('max(short,mid,long)+1'),
  }),
});
export const marketPeriodIndicatorCapabilitiesSchema = z
  .strictObject({
    contractVersion: z.literal(3),
    engineVersion: z.literal('dsa-indicator-v3'),
    calculation: z.literal('provided-points'),
    periodProtocol: z.literal(MARKET_PERIOD_INDICATOR_PROTOCOL),
    nativeTimeframes: z.tuple([z.literal('1m'), z.literal('1d')]),
    periods: z.array(periodCapabilitySchema).length(4),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.periods.map((period) => period.timeframe)).size !== 4)
      ctx.addIssue({ code: 'custom', path: ['periods'], message: '必须分别声明四种派生周期' });
  });
export type MarketPeriodIndicatorCapabilities = z.infer<
  typeof marketPeriodIndicatorCapabilitiesSchema
>;
