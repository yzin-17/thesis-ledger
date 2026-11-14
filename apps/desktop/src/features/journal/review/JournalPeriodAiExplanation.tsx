import type {
  JournalPeriodAiExplanation,
  JournalPeriodReviewResponse,
} from '@thesis-ledger/schemas';

export function journalPeriodExplanationInput(analysis: JournalPeriodReviewResponse) {
  return {
    accountId: analysis.accountId,
    mode: analysis.mode,
    ...(analysis.symbol ? { symbol: analysis.symbol } : {}),
    start: analysis.result.window.start,
    end: analysis.result.window.end,
    expectedLedgerRevision: analysis.ledgerRevision,
    expectedProjectionGeneration: analysis.projectionGeneration,
    expectedAlgorithmVersion: analysis.result.algorithmVersion,
    objectFingerprints: Object.fromEntries(
      analysis.candidates.map((row) => [
        row.input.reference.reviewObjectId,
        row.input.projection.evidenceFingerprint,
      ]),
    ),
  };
}

export function matchesCurrentPeriodExplanation(
  run: JournalPeriodAiExplanation,
  analysis: JournalPeriodReviewResponse,
) {
  const input = journalPeriodExplanationInput(analysis);
  return (
    run.accountId === input.accountId &&
    run.mode === input.mode &&
    run.start === input.start &&
    run.end === input.end &&
    run.symbol === (input.symbol ?? null) &&
    run.ledgerRevision === input.expectedLedgerRevision &&
    run.projectionGeneration === input.expectedProjectionGeneration &&
    run.algorithmVersion === input.expectedAlgorithmVersion &&
    Object.keys(run.objectFingerprints).length === Object.keys(input.objectFingerprints).length &&
    Object.entries(input.objectFingerprints).every(
      ([id, value]) => run.objectFingerprints[id] === value,
    )
  );
}
