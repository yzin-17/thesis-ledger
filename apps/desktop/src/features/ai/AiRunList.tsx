import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LoadState } from '../shared/types.js';
import type { AiRunFilterStatus, AiRunRecord } from './ai.types.js';
import {
  contextSummary,
  formatDateTime,
  questionSummary,
  scopeLabel,
  statusLabel,
  statusVariant,
} from './ai.display.js';

const filters: Array<{ value: AiRunFilterStatus; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '研究中' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '失败' },
];

export function AiRunList({
  runs,
  selectedId,
  filter,
  loadState,
  onFilterChange,
  onSelect,
  onRefresh,
  onCreate,
  hasMore = false,
  onLoadMore = () => undefined,
  isLoadingMore = false,
}: {
  runs: AiRunRecord[];
  selectedId: string | null;
  filter: AiRunFilterStatus;
  loadState: LoadState;
  onFilterChange: (filter: AiRunFilterStatus) => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}) {
  const showSkeleton = loadState === 'loading' && runs.length === 0;
  const showError = loadState === 'error' && runs.length === 0;
  const showEmpty = !showSkeleton && !showError && loadState === 'empty';

  return (
    <aside
      className="flex min-h-0 flex-col gap-3 rounded-xl border bg-card p-3"
      aria-label="研究任务列表"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <h2 className="text-base font-semibold">研究任务</h2>
          <p className="text-xs text-muted-foreground">按问题和业务上下文识别任务</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRefresh}
          aria-label="刷新研究任务"
        >
          <RefreshCw />
        </Button>
      </div>
      <Tabs value={filter} onValueChange={(value) => onFilterChange(value as AiRunFilterStatus)}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto overflow-y-hidden">
          {filters.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="shrink-0 px-2 text-xs">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {showSkeleton && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="正在加载研究任务">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}
      {showError && (
        <Empty className="min-h-52 border-0 p-4">
          <EmptyHeader>
            <EmptyTitle>任务列表读取失败</EmptyTitle>
            <EmptyDescription>保留当前页面，重新加载后再试。</EmptyDescription>
          </EmptyHeader>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
            重新加载
          </Button>
        </Empty>
      )}
      {showEmpty && (
        <Empty className="min-h-52 border-0 p-4">
          <EmptyHeader>
            <EmptyTitle>{filter === 'all' ? '还没有研究任务' : '当前筛选没有任务'}</EmptyTitle>
            <EmptyDescription>
              {filter === 'all'
                ? '开始一次研究，任务状态和结论会在这里持续更新。'
                : '尝试切换筛选，或开始一次新的研究。'}
            </EmptyDescription>
          </EmptyHeader>
          <Button type="button" size="sm" onClick={onCreate}>
            新建研究
          </Button>
        </Empty>
      )}
      {runs.length > 0 && (
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-1" role="list">
          {runs.map((run) => {
            const selected = run.id === selectedId;
            return (
              <div key={run.id} role="listitem">
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(run.id)}
                  className="flex w-full flex-col gap-2 rounded-lg border border-transparent p-3 text-left transition-colors hover:bg-muted/60 aria-[current=true]:border-border aria-[current=true]:bg-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-medium leading-5">
                      {questionSummary(run)}
                    </span>
                    <Badge variant={statusVariant(run.status)}>{statusLabel(run.status)}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {run.context ? scopeLabel(run.context.scope) : '上下文未记录'} ·{' '}
                      {contextSummary(run.context)}
                    </span>
                    <time dateTime={run.updatedAt ?? run.createdAt}>
                      {formatDateTime(run.updatedAt ?? run.createdAt)}
                    </time>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
      {runs.length > 0 && hasMore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? '加载中…' : '加载更多'}
        </Button>
      )}
      {loadState === 'stale' && runs.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground" role="status">
          列表可能不是最新，后台连接恢复后会自动更新。
        </p>
      )}
    </aside>
  );
}
