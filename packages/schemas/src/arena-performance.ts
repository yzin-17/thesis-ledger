import { marketQuoteSymbolSchema } from './market-quote-identity.js';
import { z } from 'zod';
const value = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const arenaPeriodSchema = z
  .strictObject({ start: z.iso.date().optional(), end: z.iso.date().optional() })
  .refine((p) => !p.start || !p.end || p.start <= p.end, '区间起止日期无效');
export type ArenaPeriod = z.infer<typeof arenaPeriodSchema>;
export const arenaMetricsSchema = z.strictObject({
  startNav: value.nullable(),
  endNav: value.nullable(),
  returnRatio: value.nullable(),
  drawdown: value.nullable(),
  turnover: value.nullable(),
  tradeFees: value.nullable(),
  validCloses: z.number().int().nonnegative(),
  expectedCloses: z.number().int().nonnegative(),
});
export const arenaComparisonSchema = z.strictObject({
  arenaId: z.uuid(),
  start: z.iso.date(),
  end: z.iso.date(),
  currency: z.string(),
  planned: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
  rows: z.array(
    z.strictObject({
      id: z.string(),
      label: z.string(),
      kind: z.enum(['model', 'cash', 'equal_weight']),
      metrics: arenaMetricsSchema,
      rank: z.number().int().positive().nullable(),
      decisions: z.number().int().nonnegative(),
    }),
  ),
});
export type ArenaComparison = z.infer<typeof arenaComparisonSchema>;

export const arenaPointQuerySchema = z
  .strictObject({
    symbol: marketQuoteSymbolSchema,
    start: z.iso.date(),
    end: z.iso.date(),
    entrantId: z.uuid().optional(),
  })
  .refine((v) => v.start <= v.end, '点位区间无效');
export type ArenaPointQuery = z.infer<typeof arenaPointQuerySchema>;
export const arenaPointSchema = z.strictObject({
  id: z.uuid(),
  arenaId: z.uuid(),
  roundId: z.uuid(),
  entrantId: z.uuid(),
  model: z.string(),
  symbol: marketQuoteSymbolSchema,
  day: z.iso.date(),
  executedAt: z.iso.datetime(),
  side: z.enum(['buy', 'sell']),
  price: z.string(),
  quantity: z.string(),
});
export type ArenaPoint = z.infer<typeof arenaPointSchema>;
export const arenaLivePointSchema = arenaPointSchema.omit({ roundId: true }).extend({
  protocolVersion: z.literal(2), roundId: z.null(),
});
export type ArenaPricePoint = ArenaPoint | z.infer<typeof arenaLivePointSchema>;
