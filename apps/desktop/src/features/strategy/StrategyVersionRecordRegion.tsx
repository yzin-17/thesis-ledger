import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { EmptyListState } from '../shared/EmptyStates.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';

export function useVersionRecordPage() {
  const [cursors, setCursors] = useState(['']);
  return {
    cursor: cursors.at(-1) ?? '',
    page: cursors.length,
    previous: () => setCursors((current) => current.slice(0, -1)),
    next: (cursor: string) => setCursors((current) => [...current, cursor]),
  };
}

export function StrategyVersionRecordRegion({ loading, refreshing, error, empty, label, retry,
  page, previous, next, nextCursor, children }: {
  loading: boolean; refreshing: boolean; error: Error | null; empty: boolean;
  label: string; retry: () => void; page: number; previous: () => void;
  next: (cursor: string) => void; nextCursor: string | null | undefined; children: ReactNode;
}) {
  return <div className="flex min-w-0 flex-col gap-3">
    <ListRefreshRegion refreshing={refreshing && !loading} label={`正在刷新${label}`}>
      {loading && <LoadingState label={`正在读取${label}`} className="min-h-32" />}
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <p>{label}读取失败：{requestFailureMessage(error)}</p>
        <Button type="button" size="sm" variant="outline" onClick={retry}>重新读取</Button>
      </div>}
      {!loading && !error && empty && <EmptyListState title={`当前版本暂无${label}`} />}
      {!loading && !empty && children}
    </ListRefreshRegion>
    {(!empty || page > 1) && <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">第 {page} 页</span>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page === 1 || refreshing} onClick={previous}>上一页</Button>
        <Button type="button" size="sm" variant="outline" disabled={!nextCursor || refreshing} onClick={() => { if (nextCursor) next(nextCursor); }}>下一页</Button>
      </div>
    </div>}
  </div>;
}
