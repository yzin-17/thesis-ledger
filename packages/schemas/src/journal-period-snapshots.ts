import { z } from 'zod';
import {
  journalPeriodExplanationRequestSchema,
  journalPeriodAiExplanationSchema,
} from './journal-period-review-ai.js';
import { journalPeriodReviewResponseSchema } from './journal-review-api.js';
import {
  journalSnapshotDetailQuerySchema,
  journalSnapshotIdSchema,
} from './journal-review-history.js';

export const journalPeriodSnapshotSaveRequestSchema = journalPeriodExplanationRequestSchema.extend({
  aiRunId: journalSnapshotIdSchema.optional(),
});

export const journalPeriodSnapshotListQuerySchema = journalSnapshotDetailQuerySchema.extend({
  cursor: journalSnapshotIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const journalStoredPeriodSnapshotSchema = z
  .object({
    id: journalSnapshotIdSchema,
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']),
    symbol: z.string().nullable(),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    ledgerRevision: z.string().regex(/^\d+$/),
    projectionGeneration: z.string().regex(/^\d+$/),
    algorithmVersion: z.string().min(1),
    analysis: journalPeriodReviewResponseSchema,
    aiExplanation: journalPeriodAiExplanationSchema.nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((row, ctx) => {
    const result = row.analysis;
    if (!analysisMatchesSnapshotScope(result, row))
      ctx.addIssue({ code: 'custom', message: '周期快照范围、投影或算法不一致' });
    const ai = row.aiExplanation;
    if (ai) {
      const fingerprintMap = Object.fromEntries(
        result.candidates.map((candidate) => [
          candidate.input.reference.reviewObjectId,
          candidate.input.projection.evidenceFingerprint,
        ]),
      );
      if (
        ai.accountId !== row.accountId ||
        ai.mode !== row.mode ||
        ai.symbol !== row.symbol ||
        ai.start !== row.start ||
        ai.end !== row.end ||
        ai.ledgerRevision !== row.ledgerRevision ||
        ai.projectionGeneration !== row.projectionGeneration ||
        ai.algorithmVersion !== row.algorithmVersion ||
        ai.status !== 'succeeded' ||
        !ai.result ||
        Object.keys(ai.objectFingerprints).length !== Object.keys(fingerprintMap).length ||
        Object.entries(fingerprintMap).some(([key, value]) => ai.objectFingerprints[key] !== value)
      )
        ctx.addIssue({ code: 'custom', message: '周期快照仅允许保存本次成功的 AI 解读' });
    }
  });

export const journalPeriodSnapshotHistorySchema = z
  .object({
    items: z.array(journalStoredPeriodSnapshotSchema),
    nextCursor: journalSnapshotIdSchema.nullable(),
  })
  .strict();

export type JournalPeriodSnapshotSaveRequest = z.infer<
  typeof journalPeriodSnapshotSaveRequestSchema
>;
export type JournalPeriodSnapshotListQuery = z.infer<typeof journalPeriodSnapshotListQuerySchema>;
export type JournalStoredPeriodSnapshot = z.infer<typeof journalStoredPeriodSnapshotSchema>;

type SnapshotScope = Pick<
  z.infer<typeof journalPeriodAiExplanationSchema>,
  | 'accountId'
  | 'mode'
  | 'symbol'
  | 'start'
  | 'end'
  | 'ledgerRevision'
  | 'projectionGeneration'
  | 'algorithmVersion'
>;

function analysisMatchesSnapshotScope(
  result: z.infer<typeof journalPeriodReviewResponseSchema>,
  row: SnapshotScope,
) {
  return (
    result.accountId === row.accountId &&
    result.mode === row.mode &&
    result.symbol === row.symbol &&
    result.ledgerRevision === row.ledgerRevision &&
    result.projectionGeneration === row.projectionGeneration &&
    result.result.algorithmVersion === row.algorithmVersion &&
    result.result.window.start === row.start &&
    result.result.window.end === row.end
  );
}
