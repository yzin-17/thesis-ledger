import type { JournalPeriodReviewResponse } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalAiRunPanel } from './JournalAiRunPanel.js';

export function JournalPeriodAiExplanation({
  analysis,
  disabled,
}: {
  analysis: JournalPeriodReviewResponse;
  disabled: boolean;
}) {
  const api = getDesktopApiClient().journalReviews;
  const request = {
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
  return (
    <JournalAiRunPanel
      accountId={analysis.accountId}
      mode={analysis.mode}
      kind="period"
      scope={request}
      disabled={disabled}
      createRun={() => api.explainPeriod(request)}
      readRun={async (id, signal) => {
        const run = await api.periodExplanation(
          id,
          { accountId: analysis.accountId, mode: analysis.mode },
          signal,
        );
        const fingerprints = request.objectFingerprints;
        if (
          run.accountId !== request.accountId ||
          run.mode !== request.mode ||
          run.start !== request.start ||
          run.end !== request.end ||
          run.symbol !== (request.symbol ?? null) ||
          run.ledgerRevision !== request.expectedLedgerRevision ||
          run.projectionGeneration !== request.expectedProjectionGeneration ||
          run.algorithmVersion !== request.expectedAlgorithmVersion ||
          Object.keys(run.objectFingerprints).length !== Object.keys(fingerprints).length ||
          Object.entries(fingerprints).some(([key, value]) => run.objectFingerprints[key] !== value)
        )
          throw new Error('已保存的 AI 任务引用与本次周期输入不一致，请清除引用后重试');
        return run;
      }}
    />
  );
}
