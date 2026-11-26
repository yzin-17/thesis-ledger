import { z } from 'zod';
import {
  barPointSchema,
  barSeriesCoverageSchema,
  barSeriesIdentitySchema,
} from './market-bar-series.js';
import {
  marketMinutePeriodSchema,
  marketPeriodDerivationSchema,
  marketPeriodProvenanceSchema,
} from './market-period.js';

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const marketMinuteRuleVersionSchema = z.literal('market-minute-aggregation-v1');
export const marketMinuteDisplayPointSchema = barPointSchema
  .extend({
    tradingDate: z.iso.date(),
    bucketEndAt: z.iso.datetime({ offset: true }),
    observedEndAt: z.iso.datetime({ offset: true }),
    expectedMinutes: z.number().int().positive().max(60),
    observedMinutes: z.number().int().nonnegative().max(60),
    openingBoundaryPoints: z.number().int().min(0).max(1),
  })
  .strict()
  .superRefine((point, context) => {
    if (
      Date.parse(point.timestamp) >= Date.parse(point.bucketEndAt) ||
      Date.parse(point.bucketEndAt) - Date.parse(point.timestamp) !==
        point.expectedMinutes * 60_000 ||
      Date.parse(point.observedEndAt) - Date.parse(point.timestamp) !==
        point.observedMinutes * 60_000 ||
      point.observedMinutes > point.expectedMinutes ||
      point.observedMinutes + point.openingBoundaryPoints === 0 ||
      point.high < Math.max(point.open, point.close, point.low) ||
      point.low > Math.min(point.open, point.close, point.high) ||
      (point.completionStatus === 'complete' &&
        (point.observedMinutes !== point.expectedMinutes ||
          Date.parse(point.availableAt) < Date.parse(point.bucketEndAt)))
    )
      context.addIssue({ code: 'custom', message: '分钟桶的覆盖或完成时点无效' });
  });
export const marketMinuteBarSeriesSchema = z
  .strictObject({
    contractVersion: z.literal(1),
    identity: barSeriesIdentitySchema.extend({
      assetType: z.enum(['STOCK', 'ETF']),
      timeframe: marketMinutePeriodSchema,
      adjustment: z.literal('none'),
    }),
    points: z.array(marketMinuteDisplayPointSchema).max(3650),
    coverage: barSeriesCoverageSchema,
    provenance: marketPeriodProvenanceSchema.extend({
      providerRevision: marketMinuteRuleVersionSchema,
    }),
    derivation: marketPeriodDerivationSchema.extend({
      ruleVersion: marketMinuteRuleVersionSchema,
      baseTimeframe: z.literal('1m'),
      timestampConvention: z.literal('interval-end'),
      session: z.literal('regular'),
      includeOpeningBoundary: z.boolean(),
      basePointCount: z.number().int().min(1).max(64_000),
      baseObservedEndAt: z.iso.datetime({ offset: true }),
      cutoffAt: z.iso.datetime({ offset: true }).optional(),
      anchorTradingDate: z.never().optional(),
      coverageEvidence: z.array(z.never()).length(0),
    }),
    inputFingerprint: fingerprint,
  })
  .superRefine((series, context) => {
    if (
      !/\.(HK|US)$/.test(series.identity.symbol) ||
      series.derivation.includeOpeningBoundary !== series.identity.symbol.endsWith('.HK') ||
      series.provenance.baseSources.length !== 1 ||
      series.provenance.baseSources[0]?.upstreamSource !== 'futu' ||
      series.coverage.actualStart !== (series.points[0]?.timestamp ?? null) ||
      series.coverage.actualEnd !== (series.points.at(-1)?.timestamp ?? null) ||
      series.provenance.baseSources.some(
        (source) => source.priceBasisFingerprint !== series.derivation.priceBasisFingerprint,
      )
    )
      context.addIssue({ code: 'custom', message: '分钟展示身份、基础口径或覆盖边界不一致' });
    series.points.forEach((point, index) => {
      if (
        point.expectedMinutes > Number.parseInt(series.identity.timeframe, 10) ||
        (!series.derivation.includeOpeningBoundary && point.openingBoundaryPoints !== 0) ||
        Date.parse(point.availableAt) > Date.parse(series.derivation.evaluationAsOf) ||
        Date.parse(point.observedEndAt) > Date.parse(series.derivation.baseObservedEndAt) ||
        (series.derivation.cutoffAt !== undefined &&
          Date.parse(point.observedEndAt) > Date.parse(series.derivation.cutoffAt)) ||
        (point.completionStatus === 'complete' &&
          Date.parse(point.bucketEndAt) > Date.parse(series.derivation.evaluationAsOf)) ||
        (index > 0 &&
          Date.parse(series.points[index - 1]!.timestamp) >= Date.parse(point.timestamp))
      )
        context.addIssue({
          code: 'custom',
          path: ['points', index],
          message: '分钟展示时点、完成状态或排序无效',
        });
    });
  });
export type MarketMinuteBarSeries = z.infer<typeof marketMinuteBarSeriesSchema>;
