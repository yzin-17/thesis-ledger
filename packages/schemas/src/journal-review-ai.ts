import { z } from 'zod';
import { aiRunStatusSchema } from './ai.js';
import { researchResultSchema } from './research.js';
import { journalAnalysisDraftSchema } from './journal-analysis-draft.js';
import {
  journalDeterministicReviewSchema,
  journalReviewSnapshotRequestSchema,
} from './journal-review.js';
export const journalReviewExplanationRequestSchema = journalReviewSnapshotRequestSchema.omit({
  aiRunId: true,
});

export const journalAiFrozenEvidenceSchema = z
  .object({
    version: z.literal('journal-review-ai-v1'),
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']),
    reviewObjectId: z.string().regex(/^(TRADE_CYCLE|CLOSE_SLICE):.+$/),
    evidenceFingerprint: z.string().min(1),
    analysisDraft: journalAnalysisDraftSchema.nullable(),
    facts: z.record(z.string(), z.unknown()),
    result: journalDeterministicReviewSchema,
  })
  .strict()
  .refine(
    (value) => value.reviewObjectId === value.result.reviewObjectId,
    'AI 事实与结果必须对应同一对象',
  );
export const journalAiExplanationSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']),
    reviewObjectId: z.string().regex(/^(TRADE_CYCLE|CLOSE_SLICE):.+$/),
    evidenceFingerprint: z.string().min(1),
    analysisDraft: journalAnalysisDraftSchema.nullable(),
    provider: z.string().min(1),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    status: aiRunStatusSchema,
    errorCode: z.string().nullable(),
    errorSummary: z.string().nullable(),
    algorithmVersion: z.string().min(1),
    result: researchResultSchema.nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type JournalAiExplanation = z.infer<typeof journalAiExplanationSchema>;
