import { z } from 'zod';
import { decimalStringSchema } from './monetary-values.js';

export const journalAnalysisDraftSchema = z
  .object({
    plannedEntry: decimalStringSchema.nullable().optional(),
    plannedExit: decimalStringSchema.nullable().optional(),
    stopLoss: decimalStringSchema.nullable().optional(),
    expectedHoldingDays: z.number().int().nonnegative().nullable().optional(),
    note: z.string().max(4000).optional(),
  })
  .strict();
export type JournalAnalysisDraft = z.infer<typeof journalAnalysisDraftSchema>;
