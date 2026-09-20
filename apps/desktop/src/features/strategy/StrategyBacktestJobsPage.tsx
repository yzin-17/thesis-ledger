import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyListState } from '../shared/EmptyStates.js';
import { fetchStrategyBacktestGroups } from './strategy-optimization.api.js';
import { backtestIdentity, resolveBacktestVersion } from './strategy-backtest-detail.model.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import {
  backtestPeriodLabel,
  backtestStatusSummary,
  experimentStageLabel,
  formatCompactDateTime,
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

export function StrategyBacktestJobsPage({ strategies }: { strategies: StrategyRecord[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? 'all';
  const strategyVersionId = searchParams.get('strategyVersionId') ?? 'all';
  const cursor = searchParams.get('cursor') ?? '';
  const trail = (searchParams.get('trail') ?? '').split(',').filter(Boolean);
  const [draftSearch, setDraftSearch] = useState(search);
  const expanded = new Set((searchParams.get('expanded') ?? '').split(',').filter(Boolean));

  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftSearch === search) return;
      const next = new URLSearchParams(searchParams);
      if (draftSearch.trim()) next.set('search', draftSearch.trim());
      else next.delete('search');
      next.delete('cursor');
      next.delete('trail');
      setSearchParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftSearch, search, searchParams, setSearchParams]);

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
        ? 10_000
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(18rem,1fr)_max-content_max-content] md:items-center">
        <StrategyListSearchField
          value={draftSearch}
          onChange={setDraftSearch}
          placeholder="策略名或实验名"
          label="搜索回测任务"
        />
        <Field className="w-auto shrink-0 flex-row items-center gap-2">
          <FieldLabel className="shrink-0">策略版本</FieldLabel>
          <Select
            value={strategyVersionId}
            onValueChange={(value) => value && updateFilter('strategyVersionId', value)}
          >
            <SelectTrigger aria-label="筛选策略版本" className="w-fit">
              <SelectValue>
                {strategyVersionOptions.find((option) => option.value === strategyVersionId)
                  ?.label ?? '全部策略'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-max min-w-(--anchor-width) max-w-(--available-width)">
              <SelectGroup>
                {strategyVersionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-auto shrink-0 flex-row items-center gap-2">
          <FieldLabel className="shrink-0">状态</FieldLabel>
          <Select value={status} onValueChange={(value) => value && updateFilter('status', value)}>
            <SelectTrigger aria-label="筛选任务状态" className="w-fit">
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
        </Field>
      </div>

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
      {!groups.isPending && !groups.isError && (groups.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed p-6">
          <EmptyListState
            title="没有匹配的回测任务"
            description="调整筛选条件，或从策略版本页发起回测。"
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="w-[34%] px-4 py-3 font-medium">任务 / 策略版本</th>
                <th className="w-[21%] px-4 py-3 font-medium">回测区间</th>
                <th className="w-[14%] px-4 py-3 font-medium">状态与进度</th>
                <th className="w-[23%] px-4 py-3 font-medium">结果摘要</th>
                <th data-table-action-static className="w-[8%] px-2 py-3 text-right font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.data?.items.map((group) => {
                const open = expanded.has(group.id);
                const latest = group.jobs[0];
                if (!latest) return null;
                if (group.kind === 'user') {
                  const exact = resolveBacktestVersion(strategies, latest.strategyVersionId);
                  const title = exact
                    ? `${exact.strategy.name} · v${exact.version.version}`
                    : group.name;
                  const period = backtestPeriodLabel(latest);
                  return (
                    <tr key={group.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="overflow-hidden px-4 py-3">
                        <Link
                          className="block truncate font-medium text-foreground hover:underline"
                          to={strategyCenterPath.job(latest.id)}
                          title={title}
                        >
                          {title}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          用户任务 · {formatCompactDateTime(latest.createdAt)} 发起
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
                          render={<Link to={strategyCenterPath.job(latest.id)}>详情</Link>}
                        />
                      </td>
                    </tr>
                  );
                }
                return [
                  <tr key={group.id} className="border-b bg-muted/10">
                    <td className="px-4 py-3">
                      <button
                        data-slot="button"
                        type="button"
                        className="flex items-center gap-2 text-left font-medium text-foreground"
                        onClick={() => toggle(group.id)}
                        title={group.name}
                      >
                        {open ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                        {group.name}
                      </button>
                      <p className="mt-1 pl-6 text-xs text-muted-foreground">
                        AI 实验 · {group.jobs.length} 个匹配任务 ·{' '}
                        {formatCompactDateTime(latest.createdAt)} 更新
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">多个候选区间</td>
                    <td className="px-4 py-3">
                      <p className="text-sm">{backtestStatusSummary(group.jobs)}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {group.experimentStage
                        ? experimentStageLabel(group.experimentStage)
                        : '阶段未记录'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Button
                        size="xs"
                        variant="ghost"
                        nativeButton={false}
                        render={
                          <Link to={strategyCenterPath.experiment(group.experimentId ?? group.id)}>
                            实验
                          </Link>
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
                                className="block truncate font-medium text-foreground hover:underline"
                                to={strategyCenterPath.job(job.id)}
                                title={identity.title}
                              >
                                {identity.title}
                              </Link>
                              <p className="mt-1 truncate text-xs text-muted-foreground" title={identity.subtitle}>
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
                                render={<Link to={strategyCenterPath.job(job.id)}>详情</Link>}
                              />
                            </td>
                          </tr>
                        );
                      })
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          共 {groups.data?.totalCount ?? 0} 项，本页包含{' '}
          {groups.data?.items.reduce((total, group) => total + group.jobs.length, 0) ?? 0} 个任务
          {trail.length > 0 ? `，第 ${trail.length + 1} 页` : ''}
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
