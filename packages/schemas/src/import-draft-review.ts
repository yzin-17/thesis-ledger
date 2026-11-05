import { z } from 'zod';
import { importDraftRowSchema } from './baseline-import.js';

const reviewRevisionSchema = z
  .object({
    revision: z.number().int().positive(),
    parserVersion: z.string().min(1),
    rawEvidenceRef: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    scope: z.enum(['FULL', 'PARTIAL']),
    observedAt: z.union([z.iso.date(), z.iso.datetime()]).nullable(),
    capturedAt: z.iso.datetime().nullable(),
    timePrecision: z.enum(['INSTANT', 'DATE', 'UNKNOWN']),
    sourceTimezone: z.string().min(1).nullable(),
    rows: z.array(importDraftRowSchema),
    frozenRowIds: z.array(z.string().min(1)),
  })
  .strict();

export const importDraftReviewRecordSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    source: z.string().min(1),
    status: z.enum(['pending', 'reviewed', 'partial', 'committed', 'cancelled']),
    createdAt: z.iso.datetime(),
    review: reviewRevisionSchema.nullable(),
  })
  .strict();

export const importDraftReviewListSchema = z.array(importDraftReviewRecordSchema);
export type ImportDraftReviewRecord = z.infer<typeof importDraftReviewRecordSchema>;
