import { z } from 'zod';
import { arenaDecisionSchema } from './arena-research.js';
import { arenaComparisonSchema } from './arena-performance.js';
export const arenaWeekSummarySchema = z.strictObject({
  id: z.uuid(),
  arenaId: z.uuid(),
  title: z.string(),
  week: z.iso.date(),
  revision: z.number().int().positive(),
  publishedAt: z.iso.datetime(),
});
export const arenaWeeklySchema = z.strictObject({
  method: z.literal('weekly-v1'),
  calendarVersion: z.string(),
  week: z.iso.date(),
  cutoff: z.iso.datetime(),
  timeZone: z.string(),
  comparison: arenaComparisonSchema,
  divergences: z
    .array(
      z.strictObject({
        roundId: z.uuid(),
        day: z.iso.date(),
        symbol: z.string(),
        spreadBps: z.string(),
        lowest: z.uuid(),
        highest: z.uuid(),
      }),
    )
    .default([]),
  observations: z
    .array(
      z.strictObject({
        roundId: z.uuid(),
        day: z.iso.date(),
        symbol: z.string(),
        window: z.union([z.literal(5), z.literal(20)]),
        state: z.enum(['pending', 'missing_price', 'basis_unverified', 'ready']),
        endDay: z.iso.date().nullable(),
        change: z.string().nullable(),
        high: z.string().nullable(),
        low: z.string().nullable(),
        sourceRefs: z.array(z.string()),
      }),
    )
    .default([]),
  laterNews: z
    .array(
      z.strictObject({
        roundId: z.uuid(),
        symbol: z.string(),
        publishedAt: z.iso.datetime(),
        title: z.string(),
        ref: z.string(),
        url: z.url(),
      }),
    )
    .default([]),
  attribution: z
    .array(
      z.strictObject({
        entrantId: z.uuid(),
        symbols: z.array(z.strictObject({ symbol: z.string(), amount: z.string() })),
        fees: z.string(),
        residual: z.string().nullable(),
      }),
    )
    .default([]),
  rounds: z.array(
    z.strictObject({
      id: z.uuid(),
      day: z.iso.date(),
      state: z.string(),
      reason: z.string().nullable(),
      fingerprint: z.string().nullable(),
      entries: z.array(
        z.strictObject({
          entrantId: z.uuid(),
          model: z.string(),
          state: z.string(),
          decision: arenaDecisionSchema.nullable(),
          modelCost: z.string().nullable(),
          costStatus: z.enum(['known', 'estimated', 'unknown']).default('unknown'),
          costCurrency: z.string().nullable(),
          requestId: z.uuid().nullable(),
        }),
      ),
    }),
  ),
  fills: z.array(
    z.strictObject({
      id: z.uuid(),
      entrantId: z.uuid(),
      roundId: z.uuid(),
      symbol: z.string(),
      side: z.enum(['buy', 'sell']),
      quantity: z.string(),
      price: z.string(),
      fee: z.string(),
      executedAt: z.iso.datetime(),
      sourceRef: z.string(),
    }),
  ),
});
export const arenaWeekDetailSchema = arenaWeekSummarySchema.extend({
  digest: z.string(),
  report: arenaWeeklySchema,
});
export type ArenaWeekly = z.infer<typeof arenaWeeklySchema>;
