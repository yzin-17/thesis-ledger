import { z } from 'zod';
import { journalReviewNoteSchema, journalReviewObjectReferenceSchema } from './journal-review.js';

export const journalUnlinkedReviewSchema = z
  .object({
    id: z.string().startsWith('unlinked:'),
    accountId: z.uuid(),
    accountMode: z.enum(['actual', 'shadow']).nullable(),
    reviewStatus: z.literal('NEEDS_REVIEW_ASSOCIATION'),
    reason: z.enum(['SELL_MAPPING_MISSING', 'SELL_MAPPING_AMBIGUOUS']),
    journalEntry: journalReviewNoteSchema,
    possibleReferences: z.array(journalReviewObjectReferenceSchema),
    statisticsEligibility: z
      .object({ eligible: z.literal(false), reasons: z.tuple([z.literal('UNLINKED_JOURNAL_ENTRY')]) })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.id !== `unlinked:${value.journalEntry.id}` ||
      value.accountId !== value.journalEntry.accountId
    )
      ctx.addIssue({ code: 'custom', message: '待核对记录必须保留原始账户与交易日志来源' });
    if (value.possibleReferences.some((row) => row.reviewObjectType !== 'CLOSE_SLICE'))
      ctx.addIssue({ code: 'custom', message: '卖出日志只能关联减仓片段' });
    if (value.reason === 'SELL_MAPPING_MISSING' && value.possibleReferences.length !== 0)
      ctx.addIssue({ code: 'custom', message: '未匹配来源不能伪造复盘对象' });
    if (value.reason === 'SELL_MAPPING_AMBIGUOUS' && value.possibleReferences.length < 2)
      ctx.addIssue({ code: 'custom', message: '歧义映射必须保留全部候选来源' });
  });

export type JournalUnlinkedReview = z.infer<typeof journalUnlinkedReviewSchema>;
