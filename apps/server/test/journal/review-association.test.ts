import { describe, expect, it } from 'vitest';
import { journalReviewEvidenceInputSchema } from '@thesis-ledger/schemas';
import { journalReviewAssociation } from '../../src/journal/journal-review-association.js';
import { journalReviewEvidenceFingerprint } from '../../src/journal/journal-review-evidence.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';

import {
  reviewPlanId as planId,
  reviewPlanFixture as plan,
  reviewNoteFixture as note,
} from './review-association.fixture.js';

describe('复盘计划与 Journal 的显式关联', () => {
  it('唯一直接 Trade 引用保留 Prisma decimal 和原始说明', () => {
    const evidence = reviewEvidenceFixture();
    const related = journalReviewAssociation({
      trade: evidence.trade,
      plans: [plan()],
      entries: [note()],
    });
    expect(related.plan!.plannedEntry).toBe('1234567890123456.00000001');
    expect(related.plan!.association.kind).toBe('DIRECT_TRADE');
    expect(related.journalEntries[0]!.notes).toBe('复盘说明');
    expect(
      journalReviewEvidenceInputSchema.safeParse({
        ...evidence,
        ...related,
        missingEvidence: undefined,
      }).success,
    ).toBe(false);
    expect(
      journalReviewEvidenceInputSchema.safeParse({
        ...evidence,
        plan: related.plan,
        journalEntries: related.journalEntries,
      }).success,
    ).toBe(true);
  });
  it('Journal 事件 + planId 显式引用提供关联证明，保留原始空 tradeId', () => {
    const evidence = reviewEvidenceFixture();
    const related = journalReviewAssociation({
      trade: evidence.trade,
      plans: [plan({ tradeId: null })],
      entries: [note()],
    });
    expect(related.plan!.tradeId).toBeNull();
    expect(related.plan!.association).toEqual({
      kind: 'JOURNAL_EVENT',
      journalEntryIds: [note().id],
      eventIds: [note().ledgerEventId],
      references: [
        {
          journalEntryId: note().id,
          ledgerEventId: note().ledgerEventId,
          tradePlanId: planId,
          accountId: evidence.trade.accountId,
        },
      ],
    });
    expect(
      journalReviewEvidenceInputSchema.safeParse({
        ...evidence,
        plan: related.plan,
        journalEntries: related.journalEntries,
      }).success,
    ).toBe(true);
  });
  it('同标的、价格和时间不构成关联，无指针说明不进入分析', () => {
    const related = journalReviewAssociation({
      trade: reviewEvidenceFixture().trade,
      plans: [plan({ tradeId: null })],
      entries: [note({ ledgerEventId: null, tradePlanId: null })],
    });
    expect(related.plan).toBeNull();
    expect(related.journalEntries).toEqual([]);
  });
  it('Journal 关联证明独立于正文，矛盾账户、计划、事件或重复引用不能伪造证明', () => {
    const evidence = reviewEvidenceFixture();
    const related = journalReviewAssociation({
      trade: evidence.trade,
      plans: [plan({ tradeId: null })],
      entries: [note()],
    });
    const input = { ...evidence, plan: related.plan, journalEntries: [] };
    expect(journalReviewEvidenceInputSchema.safeParse(input).success).toBe(true);
    for (const field of ['accountId', 'tradePlanId', 'ledgerEventId', 'journalEntryId'] as const) {
      const changed = structuredClone(input);
      changed.plan!.association.references[0]![field] = '00000000-0000-4000-8000-000000000099';
      expect(journalReviewEvidenceInputSchema.safeParse(changed).success).toBe(false);
    }
    input.plan!.association.references.push(input.plan!.association.references[0]!);
    expect(journalReviewEvidenceInputSchema.safeParse(input).success).toBe(false);
  });
  it('不同账户记录不能参与该对象', () => {
    const foreignAccount = '00000000-0000-4000-8000-000000000099';
    const related = journalReviewAssociation({
      trade: reviewEvidenceFixture().trade,
      plans: [plan({ accountId: foreignAccount })],
      entries: [note({ accountId: foreignAccount })],
    });
    expect(related.plan).toBeNull();
    expect(related.journalEntries).toEqual([]);
  });
  it('多重直接或直接/事件冲突均保留待确认，不按创建时间挑选', () => {
    const other = plan({ id: '00000000-0000-4000-8000-000000000011' });
    const direct = journalReviewAssociation({
      trade: reviewEvidenceFixture().trade,
      plans: [plan(), other],
      entries: [],
    });
    expect(direct.plan).toBeNull();
    expect(direct.missingEvidence).toEqual(['PLAN_ASSOCIATION_AMBIGUOUS']);
    const mixed = journalReviewAssociation({
      trade: reviewEvidenceFixture().trade,
      plans: [plan(), { ...other, tradeId: null }],
      entries: [note({ tradePlanId: other.id })],
    });
    expect(mixed.plan).toBeNull();
    expect(mixed.missingEvidence).toEqual(['PLAN_ASSOCIATION_AMBIGUOUS']);
  });
  it('明确事件关联的外部 Trade 计划不能覆盖当前 Trade', () => {
    const related = journalReviewAssociation({
      trade: reviewEvidenceFixture().trade,
      plans: [plan({ tradeId: 'foreign' })],
      entries: [note()],
    });
    expect(related.plan).toBeNull();
    expect(related.missingEvidence).toEqual(['PLAN_ASSOCIATION_UNCONFIRMED']);
  });
  it('只有计划指针的说明可进入已确认计划，对外部事件的矛盾指针不进入', () => {
    const related = journalReviewAssociation({
      trade: reviewEvidenceFixture().trade,
      plans: [plan()],
      entries: [
        note({ ledgerEventId: null }),
        note({
          id: '00000000-0000-4000-8000-000000000021',
          ledgerEventId: '00000000-0000-4000-8000-000000000099',
        }),
      ],
    });
    expect(related.journalEntries).toHaveLength(1);
    expect(related.journalEntries[0]!.ledgerEventId).toBeNull();
  });
  it('相关说明正文变化改变对象指纹', () => {
    const evidence = reviewEvidenceFixture();
    const related = journalReviewAssociation({
      trade: evidence.trade,
      plans: [],
      entries: [note({ tradePlanId: null })],
    });
    const input = { ...evidence, journalEntries: related.journalEntries };
    const previous = journalReviewEvidenceFingerprint(input);
    input.journalEntries[0]!.notes = '修订后的复盘说明';
    expect(journalReviewEvidenceFingerprint(input)).not.toBe(previous);
  });
  it('显式 Trade 指针与计划标的矛盾时保留原始计划，不把价格套到另一标的', () => {
    const original = plan({ symbol: 'OTHER.US' });
    const related = journalReviewAssociation({
      trade: reviewEvidenceFixture().trade,
      plans: [original],
      entries: [],
    });
    expect(related.plan).toBeNull();
    expect(related.missingEvidence).toEqual(['PLAN_SYMBOL_CONFLICT']);
    expect(original.symbol).toBe('OTHER.US');
  });
});
