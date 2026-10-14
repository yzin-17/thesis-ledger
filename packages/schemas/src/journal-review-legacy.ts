import { z } from 'zod';
import { journalReviewNoteSchema, journalReviewObjectReferenceSchema } from './journal-review.js';

export const journalLegacyReviewContractSchema = z
  .object({
    id: z.string().startsWith('legacy:'),
    accountId: z.uuid(),
    accountMode: z.enum(['actual', 'shadow']).nullable(),
    reviewStatus: z.literal('LEGACY_REVIEW_NEEDS_CONFIRMATION'),
    reason: z.enum(['SELL_MAPPING_MISSING', 'SELL_MAPPING_AMBIGUOUS']),
    journalEntry: journalReviewNoteSchema,
    possibleReferences: z.array(journalReviewObjectReferenceSchema),
    statisticsEligibility: z
      .object({ eligible: z.literal(false), reasons: z.tuple([z.literal('LEGACY_UNCONFIRMED')]) })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.id !== `legacy:${value.journalEntry.id}` ||
      value.accountId !== value.journalEntry.accountId
    )
      ctx.addIssue({ code: 'custom', message: '旧复盘必须保留原始账户与 Journal 来源' });
    if (value.possibleReferences.some((row) => row.reviewObjectType !== 'CLOSE_SLICE'))
      ctx.addIssue({ code: 'custom', message: '旧 SELL 只能映射减仓片段' });
    if (value.reason === 'SELL_MAPPING_MISSING' && value.possibleReferences.length !== 0)
      ctx.addIssue({ code: 'custom', message: '未匹配来源不能伪造复盘对象' });
    if (value.reason === 'SELL_MAPPING_AMBIGUOUS' && value.possibleReferences.length < 2)
      ctx.addIssue({ code: 'custom', message: '歧义映射必须保留全部候选来源' });
  });

export type JournalLegacyReviewContract = z.infer<typeof journalLegacyReviewContractSchema>;
