import { z } from 'zod';
import {
  journalReviewCandidateContractSchema,
  journalDeterministicReviewSchema,
} from './journal-review.js';
import { journalLegacyReviewContractSchema } from './journal-review-legacy.js';
import { instrumentDirectorySchema } from './market.js';
import { journalStoredSnapshotViewSchema } from './journal-review-history.js';
import { journalPeriodReviewResultSchema } from './journal-period-review.js';

export const journalReviewObjectLocatorSchema = z
  .object({
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']).default('actual'),
    reviewObjectId: z.string().regex(/^(TRADE_CYCLE|CLOSE_SLICE):.+$/),
  })
  .strict();
export const journalReviewReferenceLocatorSchema = z.discriminatedUnion('reviewObjectType', [
  z
    .object({
      accountId: z.uuid(),
      mode: z.enum(['actual', 'shadow']).default('actual'),
      reviewObjectType: z.literal('TRADE_CYCLE'),
      tradeId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      accountId: z.uuid(),
      mode: z.enum(['actual', 'shadow']).default('actual'),
      reviewObjectType: z.literal('CLOSE_SLICE'),
      tradeId: z.string().min(1),
      closeSliceId: z.string().min(1),
    })
    .strict(),
]);
export type JournalReviewReferenceLocator = z.infer<typeof journalReviewReferenceLocatorSchema>;

export const journalReviewListContractSchema = z
  .object({
    items: z.array(journalReviewCandidateContractSchema),
    legacyItems: z.array(journalLegacyReviewContractSchema),
    total: z.number().int().nonnegative(),
    nextCursor: z.string().min(1).nullable(),
    ledgerRevision: z.string().regex(/^\d+$/),
    projectionGeneration: z.string().regex(/^\d+$/),
    instrumentDirectory: instrumentDirectorySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.items.some(
        (row) =>
          row.input.projection.ledgerRevision !== value.ledgerRevision ||
          row.input.projection.projectionGeneration !== value.projectionGeneration,
      )
    )
      context.addIssue({ code: 'custom', message: '列表包含不同世代的复盘对象' });
  });
export const journalReviewAnalysisResponseSchema = z
  .object({
    candidate: journalReviewCandidateContractSchema,
    result: journalDeterministicReviewSchema,
  })
  .strict()
  .refine(
    (value) => value.candidate.input.reference.reviewObjectId === value.result.reviewObjectId,
    '分析结果必须对应当前候选对象',
  );
export const journalSnapshotHistoryResponseSchema = z
  .object({
    items: z.array(journalStoredSnapshotViewSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();
export const journalPeriodReviewResponseSchema = z
  .object({
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']),
    symbol: z.string().nullable(),
    ledgerRevision: z.string().regex(/^\d+$/),
    projectionGeneration: z.string().regex(/^\d+$/),
    candidates: z.array(journalReviewCandidateContractSchema),
    result: journalPeriodReviewResultSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.candidates.some(
        (row) =>
          row.input.trade.accountId !== value.accountId ||
          row.input.trade.accountMode !== value.mode ||
          row.input.projection.ledgerRevision !== value.ledgerRevision ||
          row.input.projection.projectionGeneration !== value.projectionGeneration,
      )
    )
      context.addIssue({ code: 'custom', message: '周期分析输入必须来自同一账户、模式和投影世代' });
  });
export type JournalReviewListContract = z.infer<typeof journalReviewListContractSchema>;
export type JournalReviewAnalysisResponse = z.infer<typeof journalReviewAnalysisResponseSchema>;
export type JournalSnapshotHistoryResponse = z.infer<typeof journalSnapshotHistoryResponseSchema>;
export type JournalPeriodReviewResponse = z.infer<typeof journalPeriodReviewResponseSchema>;
