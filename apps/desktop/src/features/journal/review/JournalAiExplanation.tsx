import type { JournalReviewSnapshotRequest } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalAiRunPanel } from './JournalAiRunPanel.js';

export function JournalAiExplanation({
  request,
  disabled,
  onRunSelected,
}: {
  request: JournalReviewSnapshotRequest;
  disabled: boolean;
  onRunSelected: (id: string | null) => void;
}) {
  const api = getDesktopApiClient().journalReviews;
  return (
    <JournalAiRunPanel
      accountId={request.accountId}
      mode={request.mode}
      kind="object"
      scope={request}
      disabled={disabled}
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
          throw new Error('已保存的 AI 任务引用与本次输入不一致，请清除引用后重试');
        return run;
      }}
      onRunSelected={onRunSelected}
    />
  );
}
