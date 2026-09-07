import { z } from 'zod';
import { portfolioModeSchema } from './api.js';

export const allocationCategorySchema = z.enum(['stock', 'etf', 'fund', 'index', 'cash']);
export type AllocationCategory = z.infer<typeof allocationCategorySchema>;

export const performanceSeriesRangeSchema = z.enum([
  '1D',
  '5D',
  '1M',
  '3M',
  'YTD',
  '1Y',
  '5Y',
  'ALL',
]);
export type PerformanceSeriesRange = z.infer<typeof performanceSeriesRangeSchema>;

export const performanceSeriesIntervalSchema = z.enum(['1min', '1h', '1d', '1w', '1mo', '1y']);
export type PerformanceSeriesInterval = z.infer<typeof performanceSeriesIntervalSchema>;

export const performanceSeriesQuerySchema = z
  .object({
    scope: z.enum(['account', 'portfolio']).default('portfolio'),
    accountId: z.uuid().optional(),
    range: performanceSeriesRangeSchema.default('1Y'),
    interval: performanceSeriesIntervalSchema.default('1d'),
    mode: portfolioModeSchema.default('actual'),
    baseCurrency: z.enum(['CNY', 'HKD', 'USD']).default('CNY'),
  })
  .superRefine((value, context) => {
    if (value.scope === 'account' && !value.accountId) {
      context.addIssue({
        code: 'custom',
        path: ['accountId'],
        message: '账户范围必须提供 accountId',
      });
    }
    if (value.scope === 'portfolio' && value.accountId) {
      context.addIssue({
        code: 'custom',
        path: ['accountId'],
        message: '组合范围不能提供 accountId',
      });
    }
  });

export const performanceCalculateInputSchema = z.object({
  valuations: z.array(
    z.object({
      date: z.iso.datetime({ offset: true }),
      value: z.number().finite(),
      externalFlow: z.number().finite().optional(),
    }),
  ),
  cashFlows: z.array(
    z.object({ date: z.iso.datetime({ offset: true }), amount: z.number().finite() }),
  ),
});

export const performanceAllocationInputSchema = z.object({
  positions: z.array(z.object({ category: z.string().min(1), marketValue: z.number().finite() })),
  targets: z.record(z.string(), z.number().finite()).optional(),
  dataQuality: z
    .object({
      partial: z.boolean(),
      missingSymbols: z.array(z.string()),
    })
    .optional(),
});

export const performanceTargetsInputSchema = z.object({
  scope: z.enum(['account', 'portfolio']),
  accountId: z.uuid().optional(),
  targets: z.record(z.string(), z.number().finite()),
});
