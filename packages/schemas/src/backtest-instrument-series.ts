import { z } from 'zod';
import { decimalStringSchema } from './monetary-values.js';
import { backtestCurrencySchema, backtestTimeframeSchema } from './backtest-values.js';

const common = { schemaVersion: z.literal('1'), runId: z.uuid() };
export const backtestInstrumentSeriesSchema = z.discriminatedUnion('status', [
  z
    .object({
      ...common,
      status: z.literal('available'),
      source: z
        .object({
          symbol: z.string().min(1),
          currency: backtestCurrencySchema.nullable(),
          adjustment: z.enum(['none', 'qfq', 'hfq']),
          timeframe: backtestTimeframeSchema,
          timezone: z.string().min(1),
          providerId: z.string().min(1),
          upstreamSource: z.string().min(1),
          snapshotId: z.string().min(1),
          dataAsOf: z.iso.datetime({ offset: true }),
          artifactHash: z.string().min(1),
        })
        .strict(),
      points: z
        .array(
          z
            .object({
              occurredAt: z.iso.datetime({ offset: true }),
              close: decimalStringSchema.nullable(),
            })
            .strict(),
        )
        .min(1)
        .max(100_000),
    })
    .strict(),
  z
    .object({
      ...common,
      status: z.literal('unavailable'),
      reason: z.enum([
        'NOT_READY',
        'SNAPSHOT_UNAVAILABLE',
        'EXECUTION_PRICE_UNAVAILABLE',
        'ARTIFACT_UNAVAILABLE',
        'INTEGRITY_ERROR',
        'EMPTY_SERIES',
        'SERIES_TOO_LARGE',
      ]),
      message: z.string().min(1),
    })
    .strict(),
]);
export type BacktestInstrumentSeries = z.infer<typeof backtestInstrumentSeriesSchema>;
