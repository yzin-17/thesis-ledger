import { useState } from 'react';
import { journalReviewWindow } from '@thesis-ledger/domain';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { formatDateTime } from '@/lib/date-display';
import { StickyTableActionCell, StickyTableActionHeader } from '../../shared/StickyTableActions.js';
import { JournalWindowTimeInput } from './JournalWindowTimeInput.js';
import { JournalEmpty, JournalRequestError } from './JournalReviewFeedback.js';
import { JournalSnapshotDetail } from './JournalSnapshotDetail.js';
import { JournalPeriodSnapshotDetail } from './JournalPeriodSnapshotDetail.js';
import { useJournalSnapshotHistory, type JournalSnapshotRow } from './useJournalSnapshotHistory.js';

export function JournalSnapshotHistory({
  accountId,
  mode,
  reviewObjectId,
}: {
  accountId: string;
  mode: 'actual' | 'shadow';
  reviewObjectId: string | null;
}) {
  const [selected, setSelected] = useState<JournalSnapshotRow | null>(null);
  const [draft, setDraft] = useState({ start: '', end: '' });
  const [window, setWindow] = useState(draft);
  const [filterError, setFilterError] = useState<Error | null>(null);
  const query = useJournalSnapshotHistory({ accountId, mode, reviewObjectId, ...window });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const applyFilter = () => {
    try {
      journalReviewWindow({
        ...(draft.start ? { start: draft.start } : {}),
        ...(draft.end ? { end: draft.end } : {}),
      });
      setFilterError(null);
      setSelected(null);
      setWindow({ ...draft });
    } catch {
      setFilterError(new Error('请选择有效时间，结束时间不能早于开始时间'));
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {reviewObjectId && (
        <p className="text-xs text-muted-foreground">仅显示所选复盘对象的历史快照。</p>
      )}
      <FieldGroup className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field>
          <FieldLabel>开始时间</FieldLabel>
          <JournalWindowTimeInput
            aria-label="快照开始时间"
            value={draft.start}
            onValueChange={(start) => setDraft({ ...draft, start })}
          />
        </Field>
        <Field>
          <FieldLabel>结束时间</FieldLabel>
          <JournalWindowTimeInput
            aria-label="快照结束时间"
            value={draft.end}
            onValueChange={(end) => setDraft({ ...draft, end })}
          />
        </Field>
        <Button
          className="self-end justify-self-start sm:col-span-2 lg:col-span-1"
          onClick={applyFilter}
        >
          查询历史
        </Button>
      </FieldGroup>
      {filterError && <JournalRequestError title="时间范围无效" error={filterError} />}
      {query.isPending && <LoadingState label="正在读取快照列表" />}
      {query.isError && (
        <JournalRequestError
          title="历史列表读取失败"
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      <ListRefreshRegion
        refreshing={query.isRefetching && query.data !== undefined}
        label="正在刷新快照列表"
      >
        {query.isSuccess && items.length === 0 && (
          <JournalEmpty
            title="没有复盘快照"
            description="单笔或周期复盘完成后保存快照，即可在这里查看保存时的输入与结果。"
          />
        )}
        {items.length > 0 && (
          <Table className="min-w-[48rem]" aria-label="复盘历史快照">
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>标的 / 统计周期</TableHead>
                <TableHead>保存时间</TableHead>
                <TableHead>证据状态</TableHead>
                <TableHead>AI 解读</TableHead>
                <StickyTableActionHeader className="w-28 min-w-28">操作</StickyTableActionHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => {
                const active = selected?.kind === row.kind && selected.id === row.id;
                return (
                  <TableRow
                    key={`${row.kind}:${row.id}`}
                    data-state={active ? 'selected' : undefined}
                  >
                    <TableCell>
                      <Badge variant="secondary">
                        {row.kind === 'single' ? '单笔复盘' : '周期复盘'}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-64 whitespace-normal">
                      <p>{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.description}</p>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(row.createdAt)}</TableCell>
                    <TableCell>
                      {row.evidenceStatus ? (
                        <Badge variant="outline">{row.evidenceStatus}</Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {row.aiSaved === null && '—'}
                      {row.aiSaved !== null && (
                        <Badge variant="outline">{row.aiSaved ? '已保存' : '未保存'}</Badge>
                      )}
                    </TableCell>
                    <StickyTableActionCell className="w-28 min-w-28 p-2 text-right align-middle whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-pressed={active}
                        onClick={() => setSelected(row)}
                      >
                        {active ? '查看中' : '查看快照'}
                      </Button>
                    </StickyTableActionCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ListRefreshRegion>
      {query.hasNextPage && (
        <Button
          aria-busy={query.isFetchingNextPage}
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage && <Spinner data-icon="inline-start" aria-hidden="true" />}
          读取下一页快照
        </Button>
      )}
      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent size="detail" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.kind === 'period' ? '周期复盘快照' : '快照详情'}</SheetTitle>
            <SheetDescription className="sr-only">
              查看保存时的复盘数据、计算结果和 AI 解读。
            </SheetDescription>
          </SheetHeader>
          {selected?.kind === 'single' && (
            <JournalSnapshotDetail
              key={selected.id}
              id={selected.id}
              accountId={accountId}
              mode={mode}
              instrumentLabel={selected.title}
            />
          )}
          {selected?.kind === 'period' && (
            <JournalPeriodSnapshotDetail
              key={selected.id}
              id={selected.id}
              accountId={accountId}
              mode={mode}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
