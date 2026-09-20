import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExternalLink, Search } from 'lucide-react';
import type { LoadState } from '../shared/types.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import type { AiRunFilterStatus, AiRunRecord, AiRunSourceFilter } from './ai.types.js';
import { formatDateTime, formatFullDateTime, questionSummary, statusLabel } from './ai.display.js';

const statusFilters: Array<{ value: AiRunFilterStatus; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '研究中' },
  { value: 'succeeded', label: '执行完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

const sourceFilters: Array<{ value: AiRunSourceFilter; label: string }> = [
  { value: 'all', label: '全部来源' },
  { value: 'portfolio', label: '组合研究' },
  { value: 'account', label: '账户研究' },
  { value: 'position', label: '持仓研究' },
  { value: 'strategy', label: '策略研究' },
  { value: 'strategy_experiment', label: '策略实验' },
  { value: 'unknown', label: '来源未识别' },
];

const displayQuestion = (run: AiRunRecord) => run.display?.question?.trim() || questionSummary(run);

const displaySummary = (run: AiRunRecord) => {
  if (run.display?.verificationReason) return run.display.verificationReason;
  if (run.display?.summary) return run.display.summary;
  if (run.status === 'queued') return '等待研究执行';
  if (run.status === 'running') return '研究进行中';
  return '暂无摘要';
};

const displayObject = (run: AiRunRecord) => {
  const object = run.display?.object;
  if (!object) return '研究对象未提供';
  const identity = [object.name, object.code, object.version].filter(Boolean).join(' · ');
  return identity ? `${object.label} · ${identity}` : `${object.label} · 对象未提供`;
};

const displaySource = (run: AiRunRecord) => {
  const source = run.display?.source;
  if (!source) return '来源未识别';
  return source.name ? `${source.label} · ${source.name}` : source.label;
};

const primaryStatusLabel = (run: AiRunRecord) => {
  const primary = run.display?.primaryStatus;
  const labels: Record<string, string> = {
    queued: '排队中',
    running: '研究中',
    completed: '已完成',
    result_gap: '结果有缺口',
    pending_verification: '结果待核验',
    result_unavailable: '结果不可用',
    failed: '研究失败',
    cancelled: '已取消',
    unrecognized: '状态暂不可识别',
  };
  return primary ? (labels[primary] ?? '状态暂不可识别') : statusLabel(run.status);
};

const primaryStatusVariant = (run: AiRunRecord) => {
  const primary = run.display?.primaryStatus;
  if (primary === 'failed' || primary === 'result_unavailable') return 'destructive' as const;
  if (primary === 'queued' || primary === 'running' || primary === 'result_gap') {
    return 'secondary' as const;
  }
  return 'outline' as const;
};

function ResearchSource({ run, onOpen }: { run: AiRunRecord; onOpen: (href: string) => void }) {
  const href = run.display?.source.href;
  if (!href) return <span>{displaySource(run)}</span>;
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto max-w-full justify-start p-0 text-left whitespace-normal"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(href);
      }}
    >
      <span className="truncate">{displaySource(run)}</span>
      <ExternalLink data-icon="inline-end" aria-hidden="true" />
    </Button>
  );
}

function ResearchMobileRow({
  run,
  selected,
  onSelect,
  onOpenSource,
}: {
  run: AiRunRecord;
  selected: boolean;
  onSelect: (id: string, trigger: HTMLButtonElement) => void;
  onOpenSource: (href: string) => void;
}) {
  return (
    <article className="flex flex-col gap-2 border-b p-3 last:border-b-0" data-selected={selected}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium" title={displayQuestion(run)}>
            {displayQuestion(run)}
          </h3>
          <p
            className="mt-1 line-clamp-2 text-xs text-muted-foreground"
            title={displaySummary(run)}
          >
            {displaySummary(run)}
          </p>
        </div>
        <Badge variant={primaryStatusVariant(run)}>{primaryStatusLabel(run)}</Badge>
      </div>
      <p className="truncate text-xs text-muted-foreground" title={displayObject(run)}>
        {displayObject(run)}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResearchSource run={run} onOpen={onOpenSource} />
        <div className="flex items-center gap-2">
          <time
            className="text-xs text-muted-foreground"
            dateTime={run.display?.updatedAt ?? run.updatedAt ?? run.createdAt}
            title={formatFullDateTime(run.display?.updatedAt ?? run.updatedAt ?? run.createdAt)}
          >
            {formatDateTime(run.display?.updatedAt ?? run.updatedAt ?? run.createdAt)}
          </time>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(event) => onSelect(run.id, event.currentTarget)}
          >
            查看
          </Button>
        </div>
      </div>
    </article>
  );
}

interface AiRunListProps {
  runs: AiRunRecord[];
  selectedId: string | null;
  status: AiRunFilterStatus;
  source: AiRunSourceFilter;
  includeInternal: boolean;
  search: string;
  loadState: LoadState;
  refreshing: boolean;
  onStatusChange: (status: AiRunFilterStatus) => void;
  onSourceChange: (source: AiRunSourceFilter) => void;
  onIncludeInternalChange: (include: boolean) => void;
  onSearchChange: (search: string) => void;
  onSelect: (id: string, trigger: HTMLButtonElement) => void;
  onOpenSource: (href: string) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

function ResearchListToolbar(
  props: Pick<
    AiRunListProps,
    | 'status'
    | 'source'
    | 'includeInternal'
    | 'search'
    | 'refreshing'
    | 'onStatusChange'
    | 'onSourceChange'
    | 'onIncludeInternalChange'
    | 'onSearchChange'
    | 'onRefresh'
  >,
) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
      <div className="relative min-w-52 flex-1 basis-72">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.currentTarget.value)}
          className="pl-8"
          placeholder="搜索研究问题"
          aria-label="搜索研究问题"
        />
      </div>
      <Select
        value={props.status}
        onValueChange={(value) => props.onStatusChange(value as AiRunFilterStatus)}
      >
        <SelectTrigger size="sm" aria-label="执行状态">
          <SelectValue>
            {statusFilters.find((item) => item.value === props.status)?.label ?? '全部状态'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {statusFilters.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        value={props.source}
        onValueChange={(value) => props.onSourceChange(value as AiRunSourceFilter)}
      >
        <SelectTrigger size="sm" aria-label="研究来源">
          <SelectValue>
            {sourceFilters.find((item) => item.value === props.source)?.label ?? '全部来源'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {sourceFilters.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2 text-sm">
        <Switch
          checked={props.includeInternal}
          onCheckedChange={props.onIncludeInternalChange}
          variant="risk"
          aria-label="包含实验内部任务"
        >
          <SwitchThumb variant="risk" />
        </Switch>
        <span>包含实验内部任务</span>
      </div>
      <RefreshIconButton
        label="刷新研究列表"
        refreshing={props.refreshing}
        onClick={props.onRefresh}
      />
    </div>
  );
}

function ResearchDesktopTable({
  runs,
  selectedId,
  onSelect,
  onOpenSource,
}: Pick<AiRunListProps, 'runs' | 'selectedId' | 'onSelect' | 'onOpenSource'>) {
  return (
    <div className="hidden @min-[768px]:block">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>研究问题</TableHead>
            <TableHead className="hidden w-48 @min-[1080px]:table-cell">研究对象</TableHead>
            <TableHead className="hidden w-44 @min-[1080px]:table-cell">来源</TableHead>
            <TableHead className="w-32">状态</TableHead>
            <TableHead className="w-28">更新时间</TableHead>
            <TableHead className="w-20 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow
              key={run.id}
              data-state={run.id === selectedId ? 'selected' : undefined}
              onClick={(event) => {
                const button =
                  event.currentTarget.querySelector<HTMLButtonElement>('[data-ai-run-view]');
                if (button) onSelect(run.id, button);
              }}
              className="h-[68px] cursor-pointer"
            >
              <TableCell className="min-w-0 whitespace-normal">
                <p className="truncate font-medium" title={displayQuestion(run)}>
                  {displayQuestion(run)}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={displaySummary(run)}>
                  {displaySummary(run)}
                </p>
                <p
                  className="mt-1 truncate text-xs text-muted-foreground @min-[1080px]:hidden"
                  title={`${displayObject(run)} · ${displaySource(run)}`}
                >
                  {displayObject(run)} · {displaySource(run)}
                </p>
              </TableCell>
              <TableCell
                className="hidden truncate @min-[1080px]:table-cell"
                title={displayObject(run)}
              >
                {displayObject(run)}
              </TableCell>
              <TableCell className="hidden @min-[1080px]:table-cell">
                <ResearchSource run={run} onOpen={onOpenSource} />
              </TableCell>
              <TableCell>
                <Badge variant={primaryStatusVariant(run)}>{primaryStatusLabel(run)}</Badge>
              </TableCell>
              <TableCell>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={run.display?.updatedAt ?? run.updatedAt ?? run.createdAt}
                  title={formatFullDateTime(
                    run.display?.updatedAt ?? run.updatedAt ?? run.createdAt,
                  )}
                >
                  {formatDateTime(run.display?.updatedAt ?? run.updatedAt ?? run.createdAt)}
                </time>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-ai-run-view
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(run.id, event.currentTarget);
                  }}
                >
                  查看
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ResearchRows(
  props: Pick<AiRunListProps, 'runs' | 'selectedId' | 'onSelect' | 'onOpenSource'>,
) {
  return (
    <>
      <div className="@min-[768px]:hidden">
        {props.runs.map((run) => (
          <ResearchMobileRow
            key={run.id}
            run={run}
            selected={run.id === props.selectedId}
            onSelect={props.onSelect}
            onOpenSource={props.onOpenSource}
          />
        ))}
      </div>
      <ResearchDesktopTable {...props} />
    </>
  );
}

function ResearchListResults(
  props: Pick<
    AiRunListProps,
    | 'runs'
    | 'selectedId'
    | 'status'
    | 'source'
    | 'includeInternal'
    | 'search'
    | 'loadState'
    | 'onSelect'
    | 'onOpenSource'
    | 'onRefresh'
    | 'onClearFilters'
  >,
) {
  const showSkeleton = props.loadState === 'loading' && props.runs.length === 0;
  const showError = props.loadState === 'error' && props.runs.length === 0;
  const showEmpty = !showSkeleton && !showError && props.loadState === 'empty';
  const hasConditions =
    props.status !== 'all' ||
    props.source !== 'all' ||
    props.includeInternal ||
    props.search.length > 0;
  return (
    <div className="overflow-hidden rounded-md border bg-card">
      {showSkeleton && (
        <div className="flex flex-col gap-2 p-4" aria-busy="true" aria-label="正在加载研究任务">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-16 w-full rounded-md" />
          ))}
        </div>
      )}
      {showError && (
        <Empty className="min-h-72 border-0 p-6">
          <EmptyHeader>
            <EmptyTitle>研究列表读取失败</EmptyTitle>
            <EmptyDescription>已有研究不会受到影响，请稍后重新加载。</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={props.onRefresh}>
              重新加载
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {showEmpty && (
        <Empty className="min-h-72 border-0 p-6">
          <EmptyHeader>
            <EmptyTitle>{hasConditions ? '没有匹配的研究' : '暂无研究'}</EmptyTitle>
            <EmptyDescription>
              {hasConditions
                ? '当前查询条件没有返回研究任务。'
                : '新建研究后，可在这里比较结果与来源。'}
            </EmptyDescription>
          </EmptyHeader>
          {hasConditions && (
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={props.onClearFilters}>
                清除条件
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}
      {props.runs.length > 0 && (
        <ResearchRows
          runs={props.runs}
          selectedId={props.selectedId}
          onSelect={props.onSelect}
          onOpenSource={props.onOpenSource}
        />
      )}
    </div>
  );
}

export function AiRunList({
  runs,
  selectedId,
  status,
  source,
  includeInternal,
  search,
  loadState,
  refreshing,
  onStatusChange,
  onSourceChange,
  onIncludeInternalChange,
  onSearchChange,
  onSelect,
  onOpenSource,
  onRefresh,
  onClearFilters,
  hasMore = false,
  onLoadMore = () => undefined,
  isLoadingMore = false,
}: AiRunListProps) {
  return (
    <section className="@container flex min-h-0 flex-col gap-3" aria-label="研究任务列表">
      <ResearchListToolbar
        status={status}
        source={source}
        includeInternal={includeInternal}
        search={search}
        refreshing={refreshing}
        onStatusChange={onStatusChange}
        onSourceChange={onSourceChange}
        onIncludeInternalChange={onIncludeInternalChange}
        onSearchChange={onSearchChange}
        onRefresh={onRefresh}
      />

      <ResearchListResults
        runs={runs}
        selectedId={selectedId}
        status={status}
        source={source}
        includeInternal={includeInternal}
        search={search}
        loadState={loadState}
        onSelect={onSelect}
        onOpenSource={onOpenSource}
        onRefresh={onRefresh}
        onClearFilters={onClearFilters}
      />
      {runs.length > 0 && hasMore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? '加载中…' : '加载更多'}
        </Button>
      )}
      {loadState === 'stale' && runs.length > 0 && (
        <p className="text-xs text-muted-foreground" role="status">
          当前列表仍可阅读，但刷新失败，可能不是最新结果。
        </p>
      )}
    </section>
  );
}
