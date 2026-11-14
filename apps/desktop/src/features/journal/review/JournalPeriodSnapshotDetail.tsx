import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LoadingState } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import { formatDateTime } from '@/lib/date-display';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalAiResult } from './JournalAiResult.js';
import { JournalPeriodResult } from './JournalPeriodResult.js';
import { JournalRequestError } from './JournalReviewFeedback.js';
import { JournalFactSummary } from './JournalFactSummary.js';

export function JournalPeriodSnapshotDetail({
  id,
  accountId,
  mode,
}: {
  id: string;
  accountId: string;
  mode: 'actual' | 'shadow';
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['journal-period-snapshot', accountId, mode, id],
    queryFn: ({ signal }) =>
      getDesktopApiClient().journalReviews.periodSnapshot(id, { accountId, mode }, signal),
    retry: false,
  });
  if (query.isPending) return <LoadingState label="正在读取周期快照" />;
  if (query.isError)
    return (
      <JournalRequestError
        title="周期快照读取失败"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  const snapshot = query.data;
  const result = snapshot.analysis.result;
  const sample = snapshot.analysis.candidates?.find(
    (row) => row.input.reference.reviewObjectId === selected,
  );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {formatDateTime(result.window.start)} — {formatDateTime(result.window.end)}
        {' · '}保存于 {formatDateTime(snapshot.createdAt)}
      </p>
      <p className="text-sm">保存时的冻结结果</p>
      <JournalPeriodResult
        result={result}
        onSelect={snapshot.analysis.candidates?.length ? setSelected : undefined}
      />
      {sample && (
        <section className="flex min-w-0 flex-col gap-3" aria-label="保存时的样本事实">
          <Separator />
          <h3 className="text-xl font-semibold">保存时的样本事实</h3>
          <JournalFactSummary candidate={sample} />
        </section>
      )}
      {snapshot.aiExplanation?.result && (
        <section className="flex min-w-0 flex-col gap-3">
          <Separator />
          <h3 className="text-xl font-semibold">保存时的 AI 解读</h3>
          <JournalAiResult result={snapshot.aiExplanation.result} />
        </section>
      )}
    </div>
  );
}
