import type { ImportDraftReviewRecord, ImportDraftRow } from '@thesis-ledger/schemas';

export function reviewSnapshot(
  opened: ImportDraftReviewRecord | null,
  current: ImportDraftReviewRecord | undefined,
  rows: ImportDraftRow[],
) {
  const storedRows = opened?.review?.rows ?? [];
  const signature = (draft: ImportDraftReviewRecord | null | undefined) =>
    JSON.stringify({
      id: draft?.id,
      accountId: draft?.accountId,
      status: draft?.status,
      review: draft?.review,
    });
  return {
    storedRows,
    dirty: JSON.stringify(rows) !== JSON.stringify(storedRows),
    stale: Boolean(opened) && signature(opened) !== signature(current),
  };
}
