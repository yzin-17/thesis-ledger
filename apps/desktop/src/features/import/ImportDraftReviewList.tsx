import type { ReactNode } from 'react';
import type { ImportDraftReviewRecord } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { useDraftReviewsQuery } from './draft-review.queries.js';
import { draftSourceLabel, draftStatusLabels } from './draft-review.helpers.js';

export function ImportDraftReviewList({
  query,
  selectedId,
  readError,
  busy,
  reloading,
  onReload,
  onChoose,
  children,
}: {
  query: ReturnType<typeof useDraftReviewsQuery>;
  selectedId: string | null;
  readError: string | null;
  busy: boolean;
  reloading: boolean;
  onReload: () => void;
  onChoose: (draft: ImportDraftReviewRecord) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="m-0 text-sm text-muted-foreground">
        审核已有持仓草稿。保存修订不会改变持仓；截图上传与识别尚未开放。
      </p>
      <Button
        variant="outline"
        className="self-start"
        disabled={query.isFetching || busy || reloading}
        onClick={onReload}
      >
        重新读取草稿
      </Button>
      {query.isPending && <p role="status">正在读取草稿……</p>}
      {(query.isError || readError) && (
        <Alert variant="destructive">
          <AlertTitle>草稿读取失败</AlertTitle>
          <AlertDescription>
            {readError ?? '已保留当前审核内容，请重新读取后再保存或提交。'}
          </AlertDescription>
        </Alert>
      )}
      {!query.isPending && !query.isError && query.data?.length === 0 && (
        <p role="status">当前账户暂无导入草稿。</p>
      )}
      <nav className="flex flex-wrap gap-2" aria-label="导入草稿列表">
        {query.data?.map((draft) => (
          <Button
            key={draft.id}
            disabled={busy || reloading || readError !== null}
            variant={draft.id === selectedId ? 'default' : 'outline'}
            onClick={() => onChoose(draft)}
          >
            {draftSourceLabel(draft.source)} · {draftStatusLabels[draft.status]} ·{' '}
            {draft.createdAt.slice(0, 10)}
          </Button>
        ))}
      </nav>
      {children}
    </div>
  );
}
