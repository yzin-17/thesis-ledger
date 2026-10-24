import {
  journalAnalysisDraftSchema,
  type JournalReviewCandidateContract,
  type JournalAnalysisDraft,
} from '@thesis-ledger/schemas';

export type DraftFields = {
  plannedEntry: string;
  plannedExit: string;
  stopLoss: string;
  expectedHoldingDays: string;
  note: string;
};
export const emptyJournalDraft = (): DraftFields => ({
  plannedEntry: '',
  plannedExit: '',
  stopLoss: '',
  expectedHoldingDays: '',
  note: '',
});
export function parseJournalDraft(value: DraftFields): JournalAnalysisDraft {
  return journalAnalysisDraftSchema.parse({
    plannedEntry: value.plannedEntry.trim() || null,
    plannedExit: value.plannedExit.trim() || null,
    stopLoss: value.stopLoss.trim() || null,
    expectedHoldingDays: value.expectedHoldingDays.trim()
      ? Number(value.expectedHoldingDays)
      : null,
    note: value.note,
  });
}
export function journalObjectRequest(
  candidate: JournalReviewCandidateContract,
  analysisDraft: JournalAnalysisDraft,
) {
  return {
    accountId: candidate.input.trade.accountId,
    mode: candidate.input.trade.accountMode,
    reference: candidate.input.reference,
    evidenceFingerprint: candidate.input.projection.evidenceFingerprint,
    analysisDraft,
  };
}
export function journalResultChanged(
  result: { fingerprint: string; draft: string } | undefined,
  candidate: JournalReviewCandidateContract | undefined,
  draft: DraftFields,
) {
  return Boolean(
    result &&
    (!candidate ||
      result.fingerprint !== candidate.input.projection.evidenceFingerprint ||
      result.draft !== JSON.stringify(draft)),
  );
}
export function journalWindow(start: string, end: string) {
  const explicitZone = /(Z|[+-]\d{2}:\d{2})$/;
  if (!explicitZone.test(start) || !explicitZone.test(end))
    throw new Error('时间须带时区，例如 2026-10-01T00:00:00+08:00。');
  const a = Date.parse(start),
    b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b)
    throw new Error('开始时间须早于结束时间。');
  return { start: new Date(a).toISOString(), end: new Date(b).toISOString() };
}
