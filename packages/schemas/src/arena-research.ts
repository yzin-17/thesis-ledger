import { z } from 'zod';
import { marketInstrumentFactSchema } from './market-instrument-fact.js';
const symbol = z.string().min(1).max(80);
const money = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const ref = z.string().min(1).max(500);
export const arenaBookSchema = z.strictObject({
  asOf: z.iso.datetime(),
  cash: money,
  nav: money,
  positions: z.array(z.strictObject({ symbol, quantity: money, close: money })).max(50),
});
export type ArenaBook = z.infer<typeof arenaBookSchema>;
const rationale = z.strictObject({
  symbol,
  reason: z.string().trim().min(1).max(1200),
  invalidatedBy: z.string().trim().min(1).max(500),
  references: z.array(ref).min(1).max(12),
});
export const arenaDecisionSchema = z.strictObject({
  actions: z
    .array(
      z.discriminatedUnion('action', [
        rationale.extend({ action: z.literal('hold') }),
        rationale.extend({ action: z.literal('observe') }),
        rationale.extend({
          action: z.literal('target'),
          weightBps: z.number().int().min(0).max(10000),
        }),
      ]),
    )
    .min(1)
    .max(50),
});
export type ArenaDecision = z.infer<typeof arenaDecisionSchema>;

export const arenaMarkSchema = z.strictObject({
  entrantId: z.uuid(),
  book: arenaBookSchema.nullable(),
  reason: z
    .enum(['pending_execution', 'valuation_unavailable', 'corporate_action_unverified'])
    .nullable(),
});
export type ArenaMark = z.infer<typeof arenaMarkSchema>;

export const arenaRoundReportSchema = z.strictObject({
  id: z.uuid(),
  arenaId: z.uuid(),
  tradingDate: z.iso.date(),
  asOf: z.iso.datetime().nullable(),
  fingerprint: z.string().nullable(),
  closeMarks: arenaMarkSchema.array(),
  facts: marketInstrumentFactSchema.array(),
  entries: z.array(
    z.strictObject({
      entrantId: z.uuid(),
      providerId: z.string(),
      model: z.string(),
      state: z.string(),
      requestId: z.uuid().nullable(),
      actualModel: z.string().nullable(),
      modelCost: z.string().nullable(),
      costStatus: z.enum(['known', 'estimated', 'unknown']).default('unknown'),
      costCurrency: z.string().nullable(),
      receivedAt: z.iso.datetime().nullable(),
      executionReasons: z.record(z.string(), z.string()),

      decision: arenaDecisionSchema.nullable(),
      book: arenaBookSchema.nullable(),
      settledAt: z.iso.datetime().nullable(),
      executionAt: z.iso.datetime().nullable(),
      fills: z.array(
        z.strictObject({
          symbol: z.string(),
          side: z.enum(['buy', 'sell']),
          quantity: money,
          price: money,
          fee: money,
          sourceRef: ref,
          executedAt: z.iso.datetime(),
        }),
      ),
    }),
  ),
});
export type ArenaRoundReport = z.infer<typeof arenaRoundReportSchema>;
