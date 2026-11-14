import { useQuery } from '@tanstack/react-query';
import type { JournalStoredSnapshotView } from '@thesis-ledger/schemas';
import { Separator } from '@/components/ui/separator';
import { LoadingState } from '@/components/ui/spinner';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalAiResult } from './JournalAiResult.js';
import { JournalRequestError } from './JournalReviewFeedback.js';

type SavedSnapshot = Extract<
  JournalStoredSnapshotView,
  { compatibility: 'CURRENT_CONTRACT' }
>['snapshot'];

export function JournalSavedAiExplanation({
  snapshot,
  accountId,
  mode,
}: {
  snapshot: SavedSnapshot;
  accountId: string;
  mode: 'actual' | 'shadow';
}) {
  const ai = snapshot.outputSnapshot.aiExplanation;
  const query = useQuery({
    queryKey: ['journal-snapshot-saved-ai', accountId, mode, ai?.id],
    enabled: Boolean(ai),
    queryFn: async ({ signal }) => {
      if (!ai) throw new Error('快照未保存 AI 任务引用');
      const run = await getDesktopApiClient().journalReviews.explanation(
        ai.id,
        { accountId, mode },
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
        run.id !== ai.id ||
        run.reviewObjectId !== snapshot.inputSnapshot.reference.reviewObjectId ||
        run.evidenceFingerprint !== snapshot.inputSnapshot.projection.evidenceFingerprint ||
        run.algorithmVersion !== snapshot.outputSnapshot.algorithmVersion ||
        draftKeys.some(
          (key) => run.analysisDraft?.[key] !== snapshot.inputSnapshot.analysisDraft?.[key],
        )
      ) {
        throw new Error('快照关联的 AI 解读与保存时的复盘证据不一致');
      }
      return run;
    },
    retry: false,
  });
  if (!ai) return null;

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="保存时的 AI 解读">
      <Separator />
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">保存时的 AI 解读</h3>
      </div>
      {query.isPending && <LoadingState label="正在读取快照关联的 AI 解读" />}
      {query.isError && (
        <JournalRequestError
          title="保存的 AI 解读读取失败"
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">保存时的模型运行信息</summary>
        <p className="break-all py-3 text-xs leading-6 text-muted-foreground">
          {ai.provider} · {ai.model} · {ai.promptVersion} · {ai.id}
        </p>
      </details>
      {query.data?.status === 'succeeded' && query.data.result ? (
        <JournalAiResult result={query.data.result} />
      ) : (
        query.data && (
          <p className="text-sm text-muted-foreground">
            保存的 AI 任务状态为{query.data.status}，没有可展示的解读正文。
          </p>
        )
      )}
    </section>
  );
}
