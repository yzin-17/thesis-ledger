import { z } from 'zod';
import { marketFrozenWindowRefV3Schema } from './market-frozen-window.js';
import { backtestResearchDataScopeSchema } from './backtest-research-data-scope.js';

export const priceResearchProtocolV1 = 'price-research-v1' as const;
export const priceResearchCoordinateSchema = z.enum(['research', 'actual']);
export const backtestPriceResearchSchema = z.strictObject({
  protocolVersion: z.literal(priceResearchProtocolV1),
  dailyObservationContract: z.literal('market-daily-tradability-window-v1').optional(),
  actualPriceWindow: marketFrozenWindowRefV3Schema.optional(),
  dataScope: backtestResearchDataScopeSchema.optional(),
});
export type BacktestPriceResearch = z.infer<typeof backtestPriceResearchSchema>;

export const priceResearchReferenceArtifactKey = 'research/actual-price-bars-v1.parquet';
export const priceResearchEvidenceArtifactKey = 'metadata/actual-price-evidence-v1.parquet';

export const priceResearchSizingSchema = z.strictObject({
  actualPrice: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/),
  referenceQuantity: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/),
  requestedNotional: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/),
});
