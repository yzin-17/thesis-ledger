import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { JournalStoredSnapshotView } from '@thesis-ledger/schemas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalDecimalResult } from './JournalMetricTable.js';
import { JournalEmpty, JournalRequestError } from './JournalReviewFeedback.js';
import { reviewObjectLabels } from './journal-review-display.js';
import { JournalSourceFacts } from './JournalSourceFacts.js';

function SnapshotDetail({
  id,
  accountId,
  mode,
}: {
  id: string;
  accountId: string;
  mode: 'actual' | 'shadow';
}) {
  const query = useQuery({
    queryKey: ['journal-review-snapshot', accountId, mode, id],
    queryFn: ({ signal }) =>
      getDesktopApiClient().journalReviews.snapshot(id, { accountId, mode }, signal),
    retry: false,
  });
  if (query.isPending) return <Skeleton className="h-40 w-full" />;
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
      <Card>
        <CardHeader>
          <CardTitle>旧快照待确认</CardTitle>
          <CardDescription>
            保留原始输入和结果；当前合同无法安全读取，不计入正式统计。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details>
            <summary className="cursor-pointer">高级调试：旧快照原始记录</summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(view, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {view.snapshot.status === 'STALE' ? '历史结果 · 证据已变化' : '已保存的复盘结果'}
        </CardTitle>
        <CardDescription>{view.snapshot.createdAt} · 读取保留保存时的输入与结果</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <JournalDecimalResult result={view.snapshot.outputSnapshot} />
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
        <details>
          <summary className="cursor-pointer">高级调试：保存时的原始输入</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(view.snapshot.inputSnapshot, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
function snapshotLabel(view: JournalStoredSnapshotView) {
  if (view.compatibility === 'LEGACY_UNSUPPORTED') return `${view.createdAt} · 旧快照待确认`;
  const input = view.snapshot.inputSnapshot;
  return `${view.snapshot.createdAt} · ${input.trade.symbol} · ${reviewObjectLabels[input.reference.reviewObjectType]} · ${view.snapshot.status === 'STALE' ? '证据已变化' : '证据一致'}`;
}
export function JournalSnapshotHistory({
  accountId,
  mode,
  reviewObjectId,
}: {
  accountId: string;
  mode: 'actual' | 'shadow';
  reviewObjectId: string | null;
}) {
  const [id, setId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ start: '', end: '' });
  const [window, setWindow] = useState(draft);
  const query = useInfiniteQuery({
    queryKey: ['journal-review-history', accountId, mode, reviewObjectId, window],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      getDesktopApiClient().journalReviews.history(
        {
          accountId,
          mode,
          ...(reviewObjectId ? { reviewObjectId } : {}),
          ...(window.start ? { start: window.start } : {}),
          ...(window.end ? { end: window.end } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: 20,
        },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        按保存时间查询历史。{reviewObjectId ? '当前仅显示所选对象。' : '当前显示此账户全部对象。'}
      </p>
      <FieldGroup className="sm:flex-row">
        <Field className="flex-1">
          <FieldLabel>保存时间起点（可选）</FieldLabel>
          <Input
            aria-label="快照开始时间"
            placeholder="带时区的 ISO 8601 时间"
            value={draft.start}
            onChange={(event) => setDraft({ ...draft, start: event.target.value })}
          />
        </Field>
        <Field className="flex-1">
          <FieldLabel>保存时间终点（不含，可选）</FieldLabel>
          <Input
            aria-label="快照结束时间"
            placeholder="带时区的 ISO 8601 时间"
            value={draft.end}
            onChange={(event) => setDraft({ ...draft, end: event.target.value })}
          />
        </Field>
      </FieldGroup>
      <Button
        variant="outline"
        className="self-start"
        onClick={() => {
          setId(null);
          setWindow({ ...draft });
        }}
      >
        查询历史
      </Button>
      {query.isPending && <Skeleton className="h-20 w-full" />}
      {query.isError && (
        <JournalRequestError
          title="历史列表读取失败"
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && items.length === 0 && (
        <JournalEmpty
          title="没有复盘快照"
          description="完成分析后显式保存，才能在这里查看历史输入与结果。"
        />
      )}
      {items.map((item) => {
        const snapshotId = item.compatibility === 'CURRENT_CONTRACT' ? item.snapshot.id : item.id;
        return (
          <Button
            key={snapshotId}
            className="h-auto justify-start whitespace-normal text-left"
            variant="outline"
            onClick={() => setId(snapshotId)}
          >
            {snapshotLabel(item)}
          </Button>
        );
      })}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          读取下一页快照
        </Button>
      )}
      {id && <SnapshotDetail key={id} id={id} accountId={accountId} mode={mode} />}
    </div>
  );
}
