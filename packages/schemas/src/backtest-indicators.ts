import { z } from 'zod';
import {
  decimalStringSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from './ledger-v2.js';
import { backtestTimeframeSchema, seriesFieldSchema } from './backtest-v2.js';

const isoDateTime = z.iso.datetime({ offset: true });

export const backtestIndicatorNameSchema = z.enum([
  'MA',
  'EMA',
  'RSI',
  'MACD',
  'ATR',
  'VWAP',
  'Highest',
  'Lowest',
]);

export const backtestIndicatorOutputSchema = z.enum(['value', 'macd', 'signal', 'histogram']);

export const backtestSeriesPointSchema = z
  .object({
    occurredAt: isoDateTime,
    availableAt: isoDateTime,
    value: decimalStringSchema.optional(),
    status: z.enum(['available', 'unavailable']).optional(),
    reason: z.string().min(1).optional(),
    high: decimalStringSchema.optional(),
    low: decimalStringSchema.optional(),
    close: decimalStringSchema.optional(),
    volume: decimalStringSchema.optional(),
  })
  .strict();

export const backtestSeriesSchema = z
  .object({
    sourceId: z.string().min(1),
    symbol: z.string().min(1).optional(),
    field: seriesFieldSchema,
    timeframe: backtestTimeframeSchema,
    adjusted: z.boolean(),
    points: z.array(backtestSeriesPointSchema),
  })
  .strict();

export const corporateActionForSeriesSchema = z
  .object({
    symbol: z.string().min(1),
    occurredAt: isoDateTime,
    availableAt: isoDateTime,
    type: z.enum(['CASH_DIVIDEND', 'SPLIT', 'REVERSE_SPLIT']),
    cashAmount: nonNegativeDecimalStringSchema.optional(),
    ratio: positiveDecimalStringSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === 'CASH_DIVIDEND') {
      if (value.cashAmount === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['cashAmount'],
          message: '现金分红必须提供 cashAmount',
        });
      }
      if (value.ratio !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['ratio'], message: '现金分红不接受 ratio' });
      }
      return;
    }
    if (value.ratio === undefined) {
      ctx.addIssue({ code: 'custom', path: ['ratio'], message: '拆并股必须提供 ratio' });
    }
    if (value.cashAmount !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['cashAmount'], message: '拆并股不接受 cashAmount' });
    }
  });

export const indicatorPointSchema = backtestSeriesPointSchema.extend({
  status: z.enum(['available', 'unavailable']),
});

export const indicatorResultSchema = z
  .object({
    name: backtestIndicatorNameSchema,
    output: backtestIndicatorOutputSchema,
    period: z.number().int().positive(),
    requiredLookback: z.number().int().positive(),
    points: z.array(indicatorPointSchema),
  })
  .strict();

export const warmupResultSchema = z
  .object({
    requiredLookback: z.number().int().positive(),
    warmupPoints: z.array(backtestSeriesPointSchema),
    outputPoints: z.array(backtestSeriesPointSchema),
    status: z.enum(['available', 'unavailable']),
    reason: z.string().min(1).optional(),
  })
  .strict();
