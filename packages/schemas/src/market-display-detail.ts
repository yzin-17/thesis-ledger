import { z } from 'zod';
import { barSeriesSchema } from './market-bar-series.js';
import { marketPeriodBarSeriesSchema } from './market-period.js';
import {
  marketDetailResponseEnvelopeSchema,
  refineMarketDetailResponse,
  type MarketDetailCapability,
  type MarketDetailDataByCapability,
  type MarketDetailResponse,
  type MarketDetailSection,
} from './market.js';

export const marketDisplayBarSeriesSchema = z.union([barSeriesSchema, marketPeriodBarSeriesSchema]);
export type MarketDisplayBarSeries = z.infer<typeof marketDisplayBarSeriesSchema>;
export type MarketDisplayDetailSection =
  | Exclude<MarketDetailSection, { capability: 'bars' }>
  | {
      capability: 'bars';
      status: MarketDetailSection['status'];
      data?: MarketDisplayBarSeries | null;
      error?: MarketDetailSection['error'];
    };
export type MarketDisplayDetailResponse = Omit<MarketDetailResponse, 'barSeries' | 'sections'> & {
  barSeries?: MarketDisplayBarSeries;
  sections: Partial<Record<MarketDetailCapability, MarketDisplayDetailSection>>;
};
export type MarketDisplayDetailDataByCapability = Omit<MarketDetailDataByCapability, 'bars'> & {
  bars: MarketDisplayBarSeries;
};

const displayResponse = marketDetailResponseEnvelopeSchema
  .extend({
    barSeries: marketDisplayBarSeriesSchema.optional(),
  })
  .superRefine((response, context) => {
    refineMarketDetailResponse(response, context, marketDisplayBarSeriesSchema);
    const section = response.sections.bars;
    if (!section || (section.status !== 'ready' && section.status !== 'stale')) return;
    const parsed = marketDisplayBarSeriesSchema.safeParse(section.data);
    if (!parsed.success) return;
    const series = response.barSeries;
    if (
      !series ||
      series.inputFingerprint !== parsed.data.inputFingerprint ||
      series.identity.symbol !== parsed.data.identity.symbol ||
      series.identity.timeframe !== parsed.data.identity.timeframe ||
      series.identity.adjustment !== parsed.data.identity.adjustment ||
      JSON.stringify(series) !== JSON.stringify(parsed.data)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sections', 'bars', 'data'],
        message: '根显示序列与 bars 分段必须绑定同一证券、周期、口径及指纹。',
      });
    }
  });
export const marketDisplayDetailResponseSchema =
  displayResponse as z.ZodType<MarketDisplayDetailResponse>;
