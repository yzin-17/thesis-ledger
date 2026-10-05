import { z } from 'zod';
import { journalReviewSnapshotContractSchema } from './journal-review.js';

const objectId = z.string().regex(/^(TRADE_CYCLE|CLOSE_SLICE):.+$/);
export const journalSnapshotIdSchema = z.uuid();
export const journalSnapshotDetailQuerySchema = z
  .object({
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']).default('actual'),
  })
  .strict();
export const journalSnapshotHistoryQuerySchema = z
  .object({
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']).default('actual'),
    reviewObjectId: objectId.optional(),
    start: z.iso.datetime({ offset: true }).optional(),
    end: z.iso.datetime({ offset: true }).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const journalSnapshotHistoryCursorSchema = z
  .object({
    version: z.literal(1),
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']),
    reviewObjectId: objectId.nullable(),
    start: z.iso.datetime({ offset: true }).nullable(),
    end: z.iso.datetime({ offset: true }).nullable(),
    afterSnapshotId: z.uuid(),
  })
  .strict();

export const journalStoredSnapshotViewSchema = z.discriminatedUnion('compatibility', [
  z
    .object({
      compatibility: z.literal('CURRENT_CONTRACT'),
      accountId: z.uuid(),
      mode: z.enum(['actual', 'shadow']),
      snapshot: journalReviewSnapshotContractSchema,
    })
    .strict()
    .refine(
      (value) =>
        value.snapshot.inputSnapshot.trade.accountId === value.accountId &&
        value.snapshot.inputSnapshot.trade.accountMode === value.mode,
      '快照账户模式与原始输入不一致',
    ),
  z
    .object({
      compatibility: z.literal('LEGACY_UNSUPPORTED'),
      id: z.uuid(),
      accountId: z.uuid(),
      mode: z.enum(['actual', 'shadow']),
      reviewObjectType: z.string(),
      tradeId: z.string(),
      closeSliceId: z.string().nullable(),
      status: z.literal('LEGACY_REVIEW_NEEDS_CONFIRMATION'),
      reasons: z.array(z.string().min(1)).min(1),
      inputSnapshot: z.unknown(),
      outputSnapshot: z.unknown(),
      savedMetadata: z.record(z.string(), z.unknown()),
      createdAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
]);

export type JournalSnapshotHistoryQuery = z.infer<typeof journalSnapshotHistoryQuerySchema>;
export type JournalSnapshotHistoryCursor = z.infer<typeof journalSnapshotHistoryCursorSchema>;
export type JournalStoredSnapshotView = z.infer<typeof journalStoredSnapshotViewSchema>;
