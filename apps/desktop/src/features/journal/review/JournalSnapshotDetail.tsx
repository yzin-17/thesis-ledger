import { useQuery } from '@tanstack/react-query';
import { LoadingState } from '@/components/ui/spinner';
import { getDesktopApiClient } from '@/shared/api/client';
import { formatDateTime } from '@/lib/date-display';
import { JournalDecimalResult } from './JournalMetricTable.js';
import { JournalRequestError } from './JournalReviewFeedback.js';
import { JournalSourceFacts } from './JournalSourceFacts.js';
import { JournalSavedAiExplanation } from './JournalSavedAiExplanation.js';

export function JournalSnapshotDetail({
  id,
  accountId,
  mode,
  instrumentLabel,
}: {
  id: string;
  accountId: string;
  mode: 'actual' | 'shadow';
  instrumentLabel?: string | undefined;
}) {
  const query = useQuery({
    queryKey: ['journal-review-snapshot', accountId, mode, id],
    queryFn: ({ signal }) =>
      getDesktopApiClient().journalReviews.snapshot(id, { accountId, mode }, signal),
    retry: false,
  });
  if (query.isPending) return <LoadingState label="正在读取历史快照" />;
  if (query.isError)
    return (
      <JournalRequestError
        title="历史快照读取失败"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  const view = query.data;
  if (view.compatibility === 'LEGACY_UNSUPPORTED')
    return (
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">旧快照待确认</h3>
          <p className="text-xs text-muted-foreground">保存于 {formatDateTime(view.createdAt)}</p>
          <p className="text-sm text-muted-foreground">
            保留原始输入和结果；当前合同无法安全读取，不计入正式统计。
          </p>
        </div>
        <details>
          <summary className="cursor-pointer">高级调试：旧快照原始记录</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(view, null, 2)}
          </pre>
        </details>
      </section>
    );
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold break-words">
          {instrumentLabel ?? view.snapshot.inputSnapshot.trade.symbol}
        </h2>
        <h3 className="text-lg font-semibold">
          {view.snapshot.status === 'STALE' ? '历史结果 · 证据已变化' : '已保存的复盘结果'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(view.snapshot.createdAt)} · 读取保留保存时的输入与结果
        </p>
      </div>
      <JournalDecimalResult result={view.snapshot.outputSnapshot} showSavedAiReference={false} />
      {view.snapshot.outputSnapshot.aiExplanation && (
        <JournalSavedAiExplanation snapshot={view.snapshot} accountId={accountId} mode={mode} />
      )}
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">
          保存时的成交、计划与草稿
        </summary>
        <div className="flex flex-col gap-4 py-3">
          <JournalSourceFacts input={view.snapshot.inputSnapshot} />
          <div className="text-sm">
            <h3 className="font-medium">保存时的本次草稿</h3>
            {view.snapshot.inputSnapshot.analysisDraft ? (
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries({
                  plannedEntry: '计划入场价',
                  plannedExit: '计划退出价',
                  stopLoss: '计划止损价',
                  expectedHoldingDays: '计划持有天数',
                  note: '草稿说明',
                }).map(([key, label]) => {
                  const draft = view.snapshot.inputSnapshot.analysisDraft;
                  const value = draft?.[key as keyof NonNullable<typeof draft>];
                  return (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{value === undefined ? '沿用原计划' : (value ?? '本次清除')}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p>未补充草稿，沿用原计划。</p>
            )}
          </div>
        </div>
      </details>
      <details>
        <summary className="cursor-pointer">高级调试：保存时的原始输入</summary>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(view.snapshot.inputSnapshot, null, 2)}
        </pre>
      </details>
    </section>
  );
}
