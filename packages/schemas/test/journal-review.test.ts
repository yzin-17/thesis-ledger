import { describe, expect, it } from 'vitest';
import {
  journalReviewCandidateSchema,
  journalReviewCandidatesQuerySchema,
  journalReviewCandidatesResponseSchema,
} from '../src/index.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000002';

const base = {
  id: 'review:account:symbol:entry:exit',
  accountId,
  symbol: '600519.SH',
  entryAt: '2026-01-01T09:30:00.000Z',
  exitAt: '2026-01-03T09:30:00.000Z',
  pnl: -10,
  quantity: 100,
  plan: null,
  evidenceCompleteness: 'actual-only' as const,
  missingEvidence: ['交易计划'],
  sources: { entryEventIds: [eventId], exitEventIds: [eventId], journalEntryIds: [] },
};

describe('投资复盘候选契约', () => {
  it('接受完整、部分和仅实际交易三种证据状态，但不补齐缺失字段', () => {
    expect(journalReviewCandidateSchema.parse(base).plan).toBeNull();
    expect(
      journalReviewCandidateSchema.parse({
        ...base,
        evidenceCompleteness: 'partial',
        missingEvidence: ['计划止损价'],
        plan: { id: '00000000-0000-4000-8000-000000000003', plannedEntry: 10 },
      }).plan,
    ).toMatchObject({ plannedEntry: 10 });
    expect(
      journalReviewCandidateSchema.parse({
        ...base,
        evidenceCompleteness: 'complete',
        missingEvidence: [],
        plan: { id: '00000000-0000-4000-8000-000000000003', plannedEntry: 10 },
      }),
    ).toMatchObject({ evidenceCompleteness: 'complete' });
  });

  it('要求账户范围并拒绝反向时间窗口和越界分页', () => {
    expect(() => journalReviewCandidatesQuerySchema.parse({})).toThrow();
    expect(() =>
      journalReviewCandidatesQuerySchema.parse({
        accountId,
        start: '2026-01-04T00:00:00.000Z',
        end: '2026-01-03T00:00:00.000Z',
      }),
    ).toThrow('结束时间');
    expect(() => journalReviewCandidatesQuerySchema.parse({ accountId, limit: 101 })).toThrow();
  });

  it('响应保留稳定 cursor，不把数组下标作为分页依据', () => {
    expect(
      journalReviewCandidatesResponseSchema.parse({ items: [base], total: 1, nextCursor: base.id }),
    ).toMatchObject({ total: 1, nextCursor: base.id });
  });
});
