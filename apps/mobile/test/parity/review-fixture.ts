import type { ImportDraftReviewRecord } from '@thesis-ledger/schemas';
export const reviewAccountId = '00000000-0000-4000-8000-000000000001';
export const reviewDraft: ImportDraftReviewRecord = {
  id: '00000000-0000-4000-8000-000000000002',
  accountId: reviewAccountId,
  source: 'unknown',
  status: 'pending',
  createdAt: '2026-10-22T01:00:00.000Z',
  review: {
    revision: 1,
    parserVersion: 'controlled@1',
    rawEvidenceRef: 'controlled://mobile-review',
    contentHash: 'a'.repeat(64),
    scope: 'PARTIAL',
    observedAt: '2026-10-21',
    capturedAt: '2026-10-22T01:00:00.000Z',
    timePrecision: 'DATE',
    sourceTimezone: 'Asia/Shanghai',
    frozenRowIds: [],
    rows: ['510300.SH', '159919.SZ'].map((symbol, index) => ({
      rowId: `row-${index}`,
      kind: 'POSITION_BASELINE',
      symbol,
      quantity: '100',
      averageCost: '3.12345678',
      currency: 'CNY',
      costIncludesFees: 'UNKNOWN',
      issues: [],
    })),
  },
};
