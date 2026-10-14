import { journalReviewObjectTimes, journalStatisticsEligibility } from '@thesis-ledger/domain';
import {
  journalReviewCandidateContractSchema,
  journalReviewEvidenceInputSchema,
  type JournalReviewCandidateContract,
  type JournalReviewEvidenceInput,
} from '@thesis-ledger/schemas';
import {
  journalReviewEvidenceFingerprint,
  journalReviewEvidenceReferences,
  journalReviewScopedNotes,
} from './journal-review-evidence.js';

function costEvidence(input: JournalReviewEvidenceInput) {
  const trade = input.trade;
  if (input.reference.reviewObjectType === 'TRADE_CYCLE')
    return {
      costEstimated: trade.costEstimated,
      costConflict:
        trade.completeness === 'CONFLICTED' ||
        trade.costIssues.some((code) =>
          ['BASELINE_COST_CONFLICT', 'FEE_CURRENCY_MISMATCH', 'TRADE_CURRENCY_MISMATCH'].includes(
            code,
          ),
        ),
      complete:
        trade.completeness === 'COMPLETE' &&
        trade.netRealizedPnl !== null &&
        trade.closeSlices.length > 0 &&
        trade.closeSlices.every((slice) => slice.price !== null),
    };
  const sliceId = input.reference.closeSliceId;
  const slice = trade.closeSlices.find((row) => row.id === sliceId)!;
  const sourceFacts = new Set(slice.allocations.map((row) => row.sourceFactId));
  const sources = [...trade.entryLegs, ...trade.baselineComponents].filter((row) =>
    sourceFacts.has(row.factId),
  );
  const knownSources = new Set(sources.map((row) => row.factId));
  return {
    costEstimated: slice.costEstimated || sources.some((row) => row.rawCostEstimated),
    costConflict:
      slice.netRealizedPnl === null &&
      trade.costIssues.some((code) =>
        ['BASELINE_COST_CONFLICT', 'FEE_CURRENCY_MISMATCH', 'TRADE_CURRENCY_MISMATCH'].includes(
          code,
        ),
      ),
    complete:
      slice.netRealizedPnl !== null &&
      slice.price !== null &&
      slice.allocations.length > 0 &&
      slice.allocations.every(
        (row) => row.originalCost !== null && knownSources.has(row.sourceFactId),
      ),
  };
}

export function journalReviewCandidate(input: {
  evidence: JournalReviewEvidenceInput;
  fxMissing: boolean;
  projectionStale: boolean;
  previousEvidenceFingerprint?: string | null;
}): JournalReviewCandidateContract {
  const evidence = journalReviewEvidenceInputSchema.parse(input.evidence);
  evidence.journalEntries = journalReviewScopedNotes(evidence);
  const refs = journalReviewEvidenceReferences(evidence);
  const evidenceFingerprint = journalReviewEvidenceFingerprint(evidence);
  const snapshotStale =
    input.previousEvidenceFingerprint !== undefined &&
    input.previousEvidenceFingerprint !== evidenceFingerprint;
  const times = journalReviewObjectTimes(evidence.trade, evidence.reference);
  const cost = costEvidence(evidence);
  const statisticsEligibility = journalStatisticsEligibility({
    reviewObjectType: evidence.reference.reviewObjectType,
    lifecycle: evidence.trade.lifecycle,
    endEvidence: evidence.trade.endEvidence,
    openedAt: times.openedAt,
    statisticsAt:
      evidence.reference.reviewObjectType === 'TRADE_CYCLE'
        ? times.effectiveClosedAt
        : times.executedAt,
    costEstimated: cost.costEstimated,
    costConflict: cost.costConflict,
    fxMissing: input.fxMissing,
    evidenceComplete: cost.complete,
    stale: input.projectionStale,
    legacyUnconfirmed: false,
  });
  return journalReviewCandidateContractSchema.parse({
    input: { ...evidence, projection: { ...evidence.projection, ...refs, evidenceFingerprint } },
    ...times,
    statisticsEligibility,
    reviewStatus: snapshotStale ? 'STALE' : 'CURRENT',
    missingEvidence: [
      ...statisticsEligibility.reasons,
      ...(evidence.plan === null ? ['PLAN_MISSING'] : []),
    ],
  });
}
