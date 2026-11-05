import {
  reviseImportDraftCommandSchema,
  type ImportDraftReviewRecord,
  type ImportDraftRow,
} from '@thesis-ledger/schemas';

export const draftIsFrozen = (draft: ImportDraftReviewRecord) =>
  !draft.review || draft.status === 'committed' || draft.status === 'cancelled';

export function rowCanSubmit(draft: ImportDraftReviewRecord, row: ImportDraftRow) {
  const review = draft.review;
  return (
    !draftIsFrozen(draft) &&
    draft.status !== 'partial' &&
    review !== null &&
    row.kind === 'POSITION_BASELINE' &&
    !review.frozenRowIds.includes(row.rowId) &&
    row.issues.length === 0 &&
    Boolean(row.observedAt ?? review.observedAt) &&
    Boolean(row.capturedAt ?? review.capturedAt) &&
    Boolean(row.sourceTimezone ?? review.sourceTimezone)
  );
}

export async function reviewedDraftCommand(
  draft: ImportDraftReviewRecord,
  rows: ImportDraftRow[],
  digest: (value: string) => Promise<string>,
) {
  if (!draft.review || draftIsFrozen(draft)) throw new Error('当前草稿已冻结或缺少修订。');
  const review = draft.review;
  const editableRows = rows.filter((row) => !review.frozenRowIds.includes(row.rowId));
  return reviseImportDraftCommandSchema.parse({
    command: 'REVISE_IMPORT_DRAFT',
    draftId: draft.id,
    expectedRevision: review.revision,
    parserVersion: 'manual-position-review@1',
    rawEvidenceRef: review.rawEvidenceRef,
    contentHash: await digest(JSON.stringify(editableRows)),
    scope: review.scope,
    ...(review.observedAt ? { observedAt: review.observedAt } : {}),
    ...(review.capturedAt ? { capturedAt: review.capturedAt } : {}),
    ...(review.timePrecision === 'UNKNOWN' ? {} : { timePrecision: review.timePrecision }),
    ...(review.sourceTimezone ? { sourceTimezone: review.sourceTimezone } : {}),
    rows: editableRows,
  });
}
