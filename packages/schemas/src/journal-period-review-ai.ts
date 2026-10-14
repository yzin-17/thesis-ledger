import { z } from 'zod';
import {
  journalPeriodReviewRequestSchema,
  journalPeriodReviewResultSchema,
} from './journal-period-review.js';
import { journalAiExplanationSchema } from './journal-review-ai.js';

const fingerprints = z.record(
  z.string().regex(/^(TRADE_CYCLE|CLOSE_SLICE):.+$/),
  z.string().min(1),
);
const revision = z.string().regex(/^\d+$/);
export const journalPeriodExplanationRequestSchema = journalPeriodReviewRequestSchema.extend({
  expectedLedgerRevision: revision,
  expectedProjectionGeneration: revision,
  expectedAlgorithmVersion: z.string().min(1),
  objectFingerprints: fingerprints,
});
export const journalPeriodAiFrozenEvidenceSchema = z
  .object({
    version: z.literal('journal-period-ai-v1'),
    request: journalPeriodExplanationRequestSchema,
    facts: z.array(z.record(z.string(), z.unknown())),
    result: journalPeriodReviewResultSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.request.start === value.result.window.start &&
      value.request.end === value.result.window.end &&
      value.request.expectedAlgorithmVersion === value.result.algorithmVersion,
    '周期解读的范围与算法必须一致',
  );
export const journalPeriodAiExplanationSchema = journalAiExplanationSchema
  .omit({
    reviewObjectId: true,
    evidenceFingerprint: true,
    analysisDraft: true,
  })
  .extend({
    symbol: z.string().nullable(),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    ledgerRevision: revision,
    projectionGeneration: revision,
    objectFingerprints: fingerprints,
  });
export type JournalPeriodExplanationRequest = z.infer<typeof journalPeriodExplanationRequestSchema>;
export type JournalPeriodAiExplanation = z.infer<typeof journalPeriodAiExplanationSchema>;
