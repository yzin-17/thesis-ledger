import { z } from 'zod';
import { performanceSummaryResponseSchema, portfolioModeSchema } from './api.js';
import { currencySchema } from './market.js';
import {
  performanceSeriesIntervalSchema,
  performanceSeriesRangeSchema,
  type performanceSeriesQuerySchema,
  type performanceTargetsInputSchema,
  type performanceAllocationInputSchema,
} from './performance.js';
const amount = z
  .union([
    z.number().finite(),
    z
      .string()
      .regex(/^-?\d+(?:\.\d+)?$/)
      .transform(Number),
  ])
  .refine(Number.isFinite);
const date = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const quality = z
  .object({
    partial: z.boolean(),
    missingSymbols: z.array(z.string()),
    missingCurrencies: z.array(currencySchema).optional(),
  })
  .passthrough();
export const performanceFxResponseSchema = z
  .object({
    enabled: z.boolean(),
    status: z.enum(['disabled', 'not_needed', 'ready', 'stale', 'blocked']),
    missingCurrencies: z.array(currencySchema),
    rates: z.array(
      z
        .object({
          fromCurrency: currencySchema,
          toCurrency: currencySchema,
          rate: amount.optional(),
          freshness: z.enum(['live', 'delayed', 'stale', 'unavailable']),
          stale: z.boolean(),
          ageDays: z.number().nullable(),
          available: z.boolean(),
        })
        .passthrough(),
    ),
    baseCurrency: currencySchema.optional(),
  })
  .passthrough();
export const performanceReadQuerySchema = z
  .object({
    mode: portfolioModeSchema.optional(),
    accountId: z.uuid().optional(),
    start: date.optional(),
    end: date.optional(),
    fxMerge: z.boolean().optional(),
    baseCurrency: currencySchema.optional(),
  })
  .strict()
  .refine(
    (value) => !value.start || !value.end || Date.parse(value.start) <= Date.parse(value.end),
    '开始日期不能晚于结束日期',
  );
export const performanceSummaryManagementSchema = performanceSummaryResponseSchema.extend({
  fx: performanceFxResponseSchema.optional(),
  currency: currencySchema.optional(),
});
export const performanceHistoryResponseSchema = z.array(
  z
    .object({
      id: z.string().min(1),
      capturedAt: date,
      marketValue: amount,
      costValue: amount,
      cashValue: amount,
      currency: currencySchema.optional(),
      payload: z
        .object({
          partial: z.boolean().optional(),
          missingSymbols: z.array(z.string()).optional(),
          dataQuality: quality.optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
);
const total = z
  .object({
    marketValue: amount,
    costValue: amount,
    cashValue: amount,
    partial: z.boolean(),
    missingSymbols: z.array(z.string()),
    currency: currencySchema.optional(),
    nativeCostValue: amount.optional(),
    nativeMarketValue: amount.optional(),
    nativeCashValue: amount.optional(),
  })
  .passthrough();
export const performanceLayersResponseSchema = z
  .object({
    security: z.array(
      z
        .object({
          accountId: z.uuid(),
          symbol: z.string(),
          assetType: z.string(),
          costValue: amount,
          marketValue: amount.nullable(),
          unrealizedPnl: amount.nullable(),
          nativeCostValue: amount.optional(),
          nativeMarketValue: amount.nullable().optional(),
          currency: currencySchema.optional(),
        })
        .passthrough(),
    ),
    account: z.array(total.extend({ accountId: z.uuid() })),
    portfolio: total.nullable(),
    byCurrency: z.array(total).optional(),
    valuedAt: date,
    dataQuality: quality,
    fx: performanceFxResponseSchema.optional(),
  })
  .passthrough();
export const performanceTargetsResponseSchema = z
  .object({
    scope: z.enum(['account', 'portfolio']),
    accountId: z.uuid().nullable(),
    targets: z.record(z.string(), z.number().finite()),
    version: z.number().int().positive().optional(),
    source: z.enum(['explicit', 'account-aggregate', 'none']).optional(),
    createdAt: date.optional(),
    aggregatedAccountCount: z.number().int().nonnegative().optional(),
    aggregationUnavailableReason: z.literal('mixed-currency').optional(),
  })
  .passthrough();
export const performanceAllocationResponseSchema = z
  .object({
    allocation: z.array(
      z.object({
        category: z.enum(['stock', 'etf', 'fund', 'index', 'cash']),
        value: amount,
        weight: z.number().finite().nullable(),
      }),
    ),
    rebalance: z.array(
      z.object({
        category: z.enum(['stock', 'etf', 'fund', 'index', 'cash']),
        currentWeight: z.number().finite(),
        targetWeight: z.number().finite(),
        weightGap: z.number().finite(),
        amountGap: amount,
        direction: z.enum(['increase', 'decrease', 'balanced']),
      }),
    ),
    partial: z.boolean(),
    missingSymbols: z.array(z.string()),
    fx: performanceFxResponseSchema.optional(),
  })
  .passthrough();
const seriesQuality = z.enum(['COMPLETE', 'PARTIAL', 'LOW_COVERAGE', 'UNAVAILABLE']);
export const performanceSeriesResponseSchema = z.object({
  range: performanceSeriesRangeSchema,
  interval: performanceSeriesIntervalSchema,
  currency: currencySchema,
  availableIntervals: z.array(performanceSeriesIntervalSchema),
  defaultInterval: performanceSeriesIntervalSchema,
  dataQuality: seriesQuality,
  historyStart: date.nullable(),
  points: z.array(
    z.object({
      at: date,
      value: amount,
      currency: currencySchema,
      valuationBasis: z.enum(['ESTIMATED', 'OFFICIAL']),
      disclosureCoverage: z.number().finite(),
      pricedCoverage: z.number().finite(),
      dataQuality: seriesQuality,
      sourceSnapshotId: z.string().nullable(),
    }),
  ),
});
export type PerformanceReadQuery = z.infer<typeof performanceReadQuerySchema>;
export type PerformanceLayersWire = z.infer<typeof performanceLayersResponseSchema>;
export type PerformanceSeriesWire = z.infer<typeof performanceSeriesResponseSchema>;
export type PerformanceTargetsWire = z.infer<typeof performanceTargetsResponseSchema>;
export type PerformanceTargetsWireInput = z.infer<typeof performanceTargetsInputSchema>;
export type PerformanceSeriesWireInput = z.input<typeof performanceSeriesQuerySchema>;
export type PerformanceAllocationWireInput = z.infer<typeof performanceAllocationInputSchema>;
