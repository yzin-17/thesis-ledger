import {
  journalReviewCandidateContractSchema,
  type JournalAnalysisDraft,
  type JournalReviewCandidateContract,
} from '@thesis-ledger/schemas';

export const journalReviewWithDraft = (
  candidate: JournalReviewCandidateContract,
  draft: JournalAnalysisDraft | null | undefined,
) =>
  journalReviewCandidateContractSchema.parse({
    ...candidate,
    input: { ...candidate.input, analysisDraft: draft ?? null },
  });
