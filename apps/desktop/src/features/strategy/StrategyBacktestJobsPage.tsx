import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { FilterReset } from '@/components/ui/filter-bar';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/date-display';
import { EmptyListState } from '../shared/EmptyStates.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { fetchStrategyBacktestGroups } from './strategy-optimization.api.js';
import { backtestIdentity, resolveBacktestVersion } from './strategy-backtest-detail.model.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import {
  backtestPeriodLabel,
  backtestStatusSummary,
  experimentStageLabel,
} from './strategy-list-presentation.js';
import {
  BacktestResultCell,
  BacktestStatusCell,
  StrategyListSearchField,
} from './StrategyListPresentation.js';
import type { StrategyRecord } from './strategy.types.js';

const PAGE_SIZE = 30;
const jobsKey = ['desktop', 'strategy', 'backtest-groups'] as const;

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '运行中' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
] as const;

export function StrategyBacktestJobsPage(props: StrategyBacktestJobsProps) {
  const {
    strategies,
    status,
    strategyVersionId,
    trail,
    draftSearch,
    setDraftSearch,
    expanded,
    detailState,
    groups,
    updateFilter,
    hasFilters,
    clearFilters,
    goNext,
    goPrevious,
    toggle,
    strategyVersionOptions,
  } = useStrategyBacktestJobsController(props);
  return (
    <div className="flex flex-col gap-4">
      <BacktestJobFilters
        draftSearch={draftSearch}
        setDraftSearch={setDraftSearch}
        strategyVersionId={strategyVersionId}
        updateFilter={updateFilter}
        status={status}
        strategyVersionOptions={strategyVersionOptions}
        hasFilters={hasFilters}
        clearFilters={clearFilters}
      />

      {groups.isPending && <DataStateBanner state="loading" description="正在读取回测任务列表。" />}
      {groups.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">回测任务加载失败</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void groups.refetch()}
          >
            重试
          </Button>
        </div>
      )}
      <ListRefreshRegion refreshing={groups.isRefetching && !!groups.data} label="正在刷新回测任务">
        {!groups.isPending && !groups.isError && (groups.data?.items.length ?? 0) === 0 ? (
          <div className="rounded-md border border-border p-6">
            <EmptyListState
              title="还没有回测任务"
              description="从策略版本页发起回测，任务会显示在这里。"
              filteredTitle="没有匹配的回测任务"
              filteredDescription="调整筛选条件后重试。"
              filtered={hasFilters}
              {...(hasFilters ? { onAction: clearFilters } : {})}
            />
          </div>
        ) : null}
        {groups.data && groups.data.items.length > 0 && (
          <TableContainer>
            <table className="w-full min-w-[1000px] table-fixed text-sm">
              <TableHeader className="border-b text-left">
                <tr>
                  <TableHead className="w-[34%]">任务 / 策略版本</TableHead>
                  <TableHead className="w-[21%]">回测区间</TableHead>
                  <TableHead className="w-[14%]">状态与进度</TableHead>
                  <TableHead className="w-[23%]">结果摘要</TableHead>
                  <TableHead data-table-action-static className="w-[8%] text-right">
                    操作
                  </TableHead>
                </tr>
              </TableHeader>
              <tbody>
                {groups.data?.items.map((group) => (
                  <BacktestGroupRows
                    key={group.id}
                    group={group}
                    strategies={strategies}
                    expanded={expanded}
                    detailState={detailState}
                    toggle={toggle}
                  />
                ))}
              </tbody>
            </table>
          </TableContainer>
        )}
      </ListRefreshRegion>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {groups.data ? (
            <>
              共 {groups.data.totalCount} 项，本页包含{' '}
              {groups.data.items.reduce((total, group) => total + group.jobs.length, 0)} 个任务
              {trail.length > 0 ? `，第 ${trail.length + 1} 页` : ''}
            </>
          ) : (
            '任务数量尚未确定'
          )}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={trail.length === 0 || groups.isFetching}
            onClick={goPrevious}
          >
            上一页
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!groups.data?.pageInfo.hasNextPage || groups.isFetching}
            onClick={goNext}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}

type StrategyBacktestJobsProps = { strategies: StrategyRecord[] };

function useStrategyBacktestJobsController({ strategies }: StrategyBacktestJobsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? 'all';
  const strategyVersionId = searchParams.get('strategyVersionId') ?? 'all';
  const cursor = searchParams.get('cursor') ?? '';
  const trail = (searchParams.get('trail') ?? '').split(',').filter(Boolean);
  const [draftSearch, setDraftSearch] = useState(search);
  const debouncedSearch = useDebouncedValue(draftSearch);
  const expanded = new Set((searchParams.get('expanded') ?? '').split(',').filter(Boolean));
  const detailState = { backtestJobsSearch: searchParams.toString() };

  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => {
    // 防抖未追上当前输入时不写 URL；后退导致 search 外部变化时也不会把旧值回写。
    if (debouncedSearch !== draftSearch) return;
    if (debouncedSearch === search) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch.trim()) next.set('search', debouncedSearch.trim());
    else next.delete('search');
    next.delete('cursor');
    next.delete('trail');
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, draftSearch, search, searchParams, setSearchParams]);

  const filters: Parameters<typeof fetchStrategyBacktestGroups>[0] = {
    limit: PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
    ...(search ? { search } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(strategyVersionId !== 'all' ? { strategyVersionId } : {}),
  };
  const groups = useQuery({
    queryKey: [...jobsKey, filters],
    queryFn: () => fetchStrategyBacktestGroups(filters),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((group) =>
        group.jobs.some((job) => !['succeeded', 'failed', 'cancelled'].includes(job.status)),
      )
        ? 30_000
        : false;
    },
  });

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    next.delete('cursor');
    next.delete('trail');
    setSearchParams(next);
  };
  const hasFilters = Boolean(
    search || draftSearch || status !== 'all' || strategyVersionId !== 'all',
  );
  const clearFilters = () => {
    setDraftSearch('');
    const next = new URLSearchParams(searchParams);
    for (const key of ['search', 'status', 'strategyVersionId', 'cursor', 'trail'])
      next.delete(key);
    setSearchParams(next);
  };
  const goNext = () => {
    const nextCursor = groups.data?.pageInfo.nextCursor;
    if (!nextCursor) return;
    const next = new URLSearchParams(searchParams);
    next.set('cursor', nextCursor);
    next.set('trail', [...trail, cursor || '__first__'].join(','));
    setSearchParams(next);
  };
  const goPrevious = () => {
    const previous = trail.at(-1);
    if (!previous) return;
    const next = new URLSearchParams(searchParams);
    if (previous === '__first__') next.delete('cursor');
    else next.set('cursor', previous);
    const remaining = trail.slice(0, -1);
    if (remaining.length > 0) next.set('trail', remaining.join(','));
    else next.delete('trail');
    setSearchParams(next);
  };
  const toggle = (id: string) => {
    const values = new Set(expanded);
    if (values.has(id)) values.delete(id);
    else values.add(id);
    const next = new URLSearchParams(searchParams);
    if (values.size > 0) next.set('expanded', [...values].join(','));
    else next.delete('expanded');
    setSearchParams(next, { replace: true });
  };

  const versionOptions = strategies.flatMap((strategy) =>
    strategy.versions.map((version) => ({
      id: version.id,
      label: `${strategy.name} · v${version.version}`,
    })),
  );
  const strategyVersionOptions = [
    { value: 'all', label: '全部策略' },
    ...versionOptions.map(({ id, label }) => ({ value: id, label })),
  ];

  return {
    strategies,
    status,
    strategyVersionId,
    trail,
    draftSearch,
    setDraftSearch,
    expanded,
    detailState,
    groups,
    updateFilter,
    hasFilters,
    clearFilters,
    goNext,
    goPrevious,
    toggle,
    strategyVersionOptions,
  };
}

function BacktestGroupRows({
  group,
  strategies,
  expanded,
  detailState,
  toggle,
}: {
  group: Awaited<ReturnType<typeof fetchStrategyBacktestGroups>>['items'][number];
  strategies: StrategyRecord[];
  expanded: ReadonlySet<string>;
  detailState: { backtestJobsSearch: string };
  toggle: (id: string) => void;
}) {
  const open = expanded.has(group.id);
  const latest = group.jobs[0];
  if (!latest) return null;
  if (group.kind === 'user') {
    const exact = resolveBacktestVersion(strategies, latest.strategyVersionId);
    const title = exact ? `${exact.strategy.name} · v${exact.version.version}` : group.name;
    const period = backtestPeriodLabel(latest);
    return (
      <tr key={group.id} className="border-b last:border-0 hover:bg-muted/20">
        <td className="overflow-hidden px-4 py-3">
          <Link
            className="block truncate font-medium text-foreground hover:text-primary/80"
            to={strategyCenterPath.job(latest.id)}
            state={detailState}
            title={title}
          >
            {title}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            用户任务 · {formatDateTime(latest.createdAt, '时间未记录')} 发起
          </p>
        </td>
        <td className="overflow-hidden px-4 py-3">
          <span className="block truncate" title={period}>
            {period}
          </span>
        </td>
        <td className="px-4 py-3 align-top">
          <BacktestStatusCell job={latest} />
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          <BacktestResultCell job={latest} />
        </td>
        <td className="px-2 py-3 text-right">
          <Button
            size="xs"
            variant="ghost"
            nativeButton={false}
            render={
              <Link to={strategyCenterPath.job(latest.id)} state={detailState}>
                详情
              </Link>
            }
          />
        </td>
      </tr>
    );
  }
  const groupSubtitle = `AI 实验 · ${group.jobs.length} 个匹配任务 · ${formatDateTime(latest.createdAt, '时间未记录')} 更新`;
  return [
    <tr key={group.id} className="border-b bg-muted/10">
      <td className="overflow-hidden px-4 py-3">
        <button
          data-slot="button"
          type="button"
          className="flex w-full min-w-0 items-center gap-2 text-left font-medium text-foreground"
          onClick={() => toggle(group.id)}
          title={group.name}
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0" />
          ) : (
            <ChevronRight className="size-4 shrink-0" />
          )}
          <span className="mt-0 min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {group.name}
          </span>
        </button>
        <p className="mt-1 truncate pl-6 text-xs text-muted-foreground" title={groupSubtitle}>
          {groupSubtitle}
        </p>
      </td>
      <td className="px-4 py-3 text-muted-foreground">多个候选区间</td>
      <td className="px-4 py-3">
        <p className="text-sm">{backtestStatusSummary(group.jobs)}</p>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {group.experimentStage ? experimentStageLabel(group.experimentStage) : '阶段未记录'}
      </td>
      <td className="px-2 py-3 text-right">
        <Button
          size="xs"
          variant="ghost"
          nativeButton={false}
          render={
            <Link to={strategyCenterPath.experiment(group.experimentId ?? group.id)}>实验</Link>
          }
        />
      </td>
    </tr>,
    ...(open
      ? group.jobs.map((job) => {
          const identity = backtestIdentity(job, strategies, group);
          const period = backtestPeriodLabel(job);
          return (
            <tr key={job.id} className="border-b last:border-0 hover:bg-muted/20">
              <td className="overflow-hidden py-3 pr-4 pl-10">
                <Link
                  className="block truncate font-medium text-foreground hover:text-primary/80"
                  to={strategyCenterPath.job(job.id)}
                  state={detailState}
                  title={identity.title}
                >
                  {identity.title}
                </Link>
                <p
                  className="mt-1 truncate text-xs text-muted-foreground"
                  title={identity.subtitle}
                >
                  {identity.subtitle}
                </p>
              </td>
              <td className="overflow-hidden px-4 py-3">
                <span className="block truncate" title={period}>
                  {period}
                </span>
              </td>
              <td className="px-4 py-3 align-top">
                <BacktestStatusCell job={job} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <BacktestResultCell job={job} />
              </td>
              <td className="px-2 py-3 text-right">
                <Button
                  size="xs"
                  variant="ghost"
                  nativeButton={false}
                  render={
                    <Link to={strategyCenterPath.job(job.id)} state={detailState}>
                      详情
                    </Link>
                  }
                />
              </td>
            </tr>
          );
        })
      : []),
  ];
}

function BacktestJobFilters({
  draftSearch,
  setDraftSearch,
  strategyVersionId,
  updateFilter,
  status,
  strategyVersionOptions,
  hasFilters,
  clearFilters,
}: Pick<
  ReturnType<typeof useStrategyBacktestJobsController>,
  | 'draftSearch'
  | 'setDraftSearch'
  | 'strategyVersionId'
  | 'updateFilter'
  | 'status'
  | 'strategyVersionOptions'
  | 'hasFilters'
  | 'clearFilters'
>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StrategyListSearchField
        className="min-w-[min(100%,12rem)] flex-1"
        value={draftSearch}
        onChange={setDraftSearch}
        placeholder="策略名或实验名"
        label="搜索回测任务"
      />
      <Select
        value={strategyVersionId}
        onValueChange={(value) => value && updateFilter('strategyVersionId', value)}
      >
        <SelectTrigger aria-label="筛选策略版本" className="w-52 shrink-0">
          <SelectValue>
            {strategyVersionOptions.find((option) => option.value === strategyVersionId)?.label ??
              '全部策略'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          className="w-max min-w-(--anchor-width) max-w-(--available-width)"
        >
          <SelectGroup>
            {strategyVersionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={(value) => value && updateFilter('status', value)}>
        <SelectTrigger aria-label="筛选任务状态" className="w-32 shrink-0">
          <SelectValue>
            {statusOptions.find((option) => option.value === status)?.label ?? '全部状态'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="w-max min-w-(--anchor-width) max-w-(--available-width)">
          <SelectGroup>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FilterReset className="shrink-0" hasConditions={hasFilters} onReset={clearFilters} />
    </div>
  );
}
