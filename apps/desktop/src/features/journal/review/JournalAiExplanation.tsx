import type { JournalReviewSnapshotRequest } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalAiRunPanel } from './JournalAiRunPanel.js';

export function JournalAiExplanation({
  request,
  disabled,
  onRunSelected,
  embedded = false,
  autoStart = false,
  onRunStatusChange,
}: {
  request: JournalReviewSnapshotRequest;
  disabled: boolean;
  onRunSelected: (id: string | null) => void;
  embedded?: boolean;
  autoStart?: boolean;
  onRunStatusChange?: (status: 'running' | 'succeeded' | 'failed') => void;
}) {
  const api = getDesktopApiClient().journalReviews;
  return (
    <JournalAiRunPanel
      accountId={request.accountId}
      mode={request.mode}
      kind="object"
      disabled={disabled}
      embedded={embedded}
      autoStart={autoStart}
      onRunStatusChange={onRunStatusChange}
      createRun={() => api.explain(request)}
      readRun={async (id, signal) => {
        const run = await api.explanation(
          id,
          { accountId: request.accountId, mode: request.mode },
          signal,
        );
        const draftKeys = [
          'plannedEntry',
          'plannedExit',
          'stopLoss',
          'expectedHoldingDays',
          'note',
        ] as const;
        if (
          run.accountId !== request.accountId ||
          run.mode !== request.mode ||
          run.reviewObjectId !== request.reference.reviewObjectId ||
          run.evidenceFingerprint !== request.evidenceFingerprint ||
          run.algorithmVersion !== request.expectedAlgorithmVersion ||
          draftKeys.some((key) => run.analysisDraft?.[key] !== request.analysisDraft?.[key])
        )
          throw new Error('本次 AI 解读与复盘输入不一致，请重新分析');
        return run;
      }}
      onRunSelected={onRunSelected}
    />
  );
}
