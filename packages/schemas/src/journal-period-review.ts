import { z } from 'zod';
import {
  journalDecimalMetricSchema,
  journalStatisticsExclusionReasonSchema,
} from './journal-review.js';

export const journalPeriodReviewRequestSchema = z
  .object({
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']).default('actual'),
    symbol: z.string().trim().min(1).optional(),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
  })
  .strict();

const group = (prefix: 'TRADE_CYCLE:' | 'CLOSE_SLICE:') =>
  z
    .object({
      observedSampleCount: z.number().int().nonnegative(),
      includedObjectIds: z.array(z.string().startsWith(prefix)),
      excluded: z.array(
        z
          .object({
            reviewObjectId: z.string().startsWith(prefix),
            reasons: z.array(journalStatisticsExclusionReasonSchema).min(1),
          })
          .strict(),
      ),
      metrics: z
        .object({
          sampleCount: journalDecimalMetricSchema,
          netRealizedPnl: journalDecimalMetricSchema,
          winRate: journalDecimalMetricSchema,
          profitLossRatio: journalDecimalMetricSchema,
          averageHoldingDays: journalDecimalMetricSchema,
        })
        .strict(),
    })
    .strict()
    .superRefine((value, context) => {
      const units = {
        sampleCount: 'COUNT',
        netRealizedPnl: 'AMOUNT',
        winRate: 'RATIO',
        profitLossRatio: 'RATIO',
        averageHoldingDays: 'DAYS',
      } as const;
      for (const key of Object.keys(units) as Array<keyof typeof units>)
        if (value.metrics[key].unit !== units[key])
          context.addIssue({
            code: 'custom',
            path: ['metrics', key],
            message: '周期指标单位与口径不一致',
          });
      if (value.observedSampleCount !== value.includedObjectIds.length + value.excluded.length)
        context.addIssue({ code: 'custom', message: '周期样本数量与资格分组不一致' });
      if (
        value.metrics.sampleCount.status !== 'AVAILABLE' ||
        value.metrics.sampleCount.unit !== 'COUNT' ||
        value.metrics.sampleCount.value !== String(value.includedObjectIds.length)
      )
        context.addIssue({
          code: 'custom',
          path: ['metrics', 'sampleCount'],
          message: '统计数量必须等于合格对象数量',
        });
    });

export const journalPeriodReviewResultSchema = z
  .object({
    algorithmVersion: z.string().min(1),
    window: z
      .object({
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
        startEpochSeconds: z.string(),
        endEpochSeconds: z.string(),
      })
      .strict(),
    tradeCycles: group('TRADE_CYCLE:'),
    closeSlices: group('CLOSE_SLICE:'),
    unknownTime: z.array(
      z
        .object({
          reviewObjectId: z.string().regex(/^(TRADE_CYCLE|CLOSE_SLICE):.+$/),
          reasons: z.array(z.string()).min(1),
        })
        .strict(),
    ),
    assumptions: z.array(z.string()),
    rounding: z
      .object({
        mode: z.literal('HALF_UP'),
        amountFractionDigits: z.number().int().nonnegative(),
        ratioFractionDigits: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type JournalPeriodReviewRequest = z.infer<typeof journalPeriodReviewRequestSchema>;
export type JournalPeriodReviewResult = z.infer<typeof journalPeriodReviewResultSchema>;
