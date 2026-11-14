import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { Spinner } from '@/components/ui/spinner';
import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Copy, FlaskConical, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { FilterReset } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToastManager } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/date-display';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import {
  cloneOptimizationExperiment,
  fetchOptimizationExperiments,
  renameOptimizationExperiment,
} from './strategy-optimization.api.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import {
  experimentProgressLabel,
  experimentSourceLabel,
  experimentStageLabel,
  experimentStatusLabel,
  experimentStatusVariant,
} from './strategy-list-presentation.js';
import { StrategyListSearchField } from './StrategyListPresentation.js';

const optimizationKey = ['desktop', 'strategy', 'optimization'] as const;
const PAGE_SIZE = 25;
const sourceModeOptions = [
  { value: 'all', label: '全部来源' },
  { value: 'existing', label: '已有策略' },
  { value: 'discovery', label: '从零探索' },
] as const;

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'running', label: '运行中' },
  { value: 'awaiting_finalization', label: '准备测试' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
] as const;

export function StrategyExperimentListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToastManager();
  const search = searchParams.get('search') ?? '';
  const sourceMode = searchParams.get('sourceMode') ?? 'all';
  const status = searchParams.get('status') ?? 'all';
  const cursor = searchParams.get('cursor') ?? '';
  const trail = (searchParams.get('trail') ?? '').split(',').filter(Boolean);
  const [draftSearch, setDraftSearch] = useState(search);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savedRename, setSavedRename] = useState<{ id: string; name: string } | null>(null);
  const [renameReadFailed, setRenameReadFailed] = useState(false);
  const renameFlightRef = useRef(false);
  const renameReadFlightRef = useRef(false);

  const debouncedSearch = useDebouncedValue(draftSearch);

  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => {
    // 防抖还没追上当前输入时不写 URL，避免把上一轮的旧值回写。
    // 也让「后退导致 search 外部变化」这一路径自然收敛：draft 已同步为新值，写入被跳过。
    if (debouncedSearch !== draftSearch) return;
    if (debouncedSearch === search) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch.trim()) next.set('search', debouncedSearch.trim());
    else next.delete('search');
    next.delete('cursor');
    next.delete('trail');
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, draftSearch, search, searchParams, setSearchParams]);

  const filters: Parameters<typeof fetchOptimizationExperiments>[0] = {
    limit: PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
    ...(search ? { search } : {}),
    ...(sourceMode === 'existing' || sourceMode === 'discovery' ? { sourceMode } : {}),
    ...(status !== 'all' ? { status } : {}),
  } as const;
  const experiments = useQuery({
    queryKey: [...optimizationKey, 'experiments', filters],
    queryFn: () => fetchOptimizationExperiments(filters),
    staleTime: 5_000,
    refetchInterval: (query) => query.state.data?.items.some((item) =>
      ['queued', 'running', 'testing', 'awaiting_finalization'].includes(item.status) &&
      !item.stopReason?.startsWith('final_test_retry_required:')) ? 3_000 : false,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: optimizationKey });
  const refreshRenamedList = async (id: string) => {
    if (renameReadFlightRef.current) return;
    renameReadFlightRef.current = true;
    setRenameReadFailed(false);
    try {
      await experiments.refetch({ throwOnError: true });
      setRenamingId((currentId) => (currentId === id ? null : currentId));
      setSavedRename(null);
      renameFlightRef.current = false;
      toast.add({ title: '实验名称已更新' });
    } catch {
      setRenameReadFailed(true);
      toast.add({
        title: '实验名称已保存',
        description: '保存后的列表确认读取失败，请重新加载。',
        type: 'error',
      });
    } finally {
      renameReadFlightRef.current = false;
    }
  };
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameOptimizationExperiment(id, name),
    onSuccess: async (updated, { id, name }) => {
      const confirmedName = updated.name || name;
      setRenameValue(confirmedName);
      setSavedRename({ id, name: confirmedName });
      await queryClient.invalidateQueries({
        queryKey: optimizationKey,
        refetchType: 'none',
      });
      await refreshRenamedList(id);
    },
    onError: (error) => {
      renameFlightRef.current = false;
      toast.add({
        title: '改名失败',
        description: requestFailureMessage(error),
        type: 'error',
      });
    },
  });
  const submitRename = (id: string, name: string) => {
    if (!name || renameFlightRef.current || renameMutation.isPending || savedRename !== null)
      return;
    renameFlightRef.current = true;
    renameMutation.mutate({ id, name });
  };
  const cancelRename = () => {
    if (renameFlightRef.current || renameMutation.isPending || savedRename !== null) return;
    setRenamingId(null);
    setRenameValue('');
    renameMutation.reset();
  };
  const cloneMutation = useMutation({
    mutationFn: (id: string) => cloneOptimizationExperiment(id),
    onSuccess: async () => {
      await invalidate();
      toast.add({
        title: '实验已克隆',
        description: '模型、参数、时间切分和预算已复制为新的实验。',
      });
    },
    onError: (error) =>
      toast.add({
        title: '克隆失败',
        description: requestFailureMessage(error),
        type: 'error',
      }),
  });
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    next.delete('cursor');
    next.delete('trail');
    setSearchParams(next);
  };
  const hasFilters = Boolean(search || draftSearch || sourceMode !== 'all' || status !== 'all');
  const clearFilters = () => {
    setDraftSearch('');
    const next = new URLSearchParams(searchParams);
    for (const key of ['search', 'sourceMode', 'status', 'cursor', 'trail']) next.delete(key);
    setSearchParams(next);
  };
  const goNext = () => {
    const nextCursor = experiments.data?.pageInfo.nextCursor;
    if (!nextCursor) return;
    const next = new URLSearchParams(searchParams);
    next.set('cursor', nextCursor);
    next.set('trail', [...trail, cursor || '__first__'].join(','));
    setSearchParams(next);
  };
  const goPrevious = () => {
    if (trail.length === 0) return;
    const previous = trail[trail.length - 1] ?? '';
    const next = new URLSearchParams(searchParams);
    if (previous && previous !== '__first__') next.set('cursor', previous);
    else next.delete('cursor');
    const remaining = trail.slice(0, -1);
    if (remaining.length > 0) next.set('trail', remaining.join(','));
    else next.delete('trail');
    setSearchParams(next);
  };
  const items = experiments.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 lg:grid lg:grid-cols-[minmax(12rem,1fr)_max-content_max-content_max-content_auto] lg:items-center">
        <StrategyListSearchField
          className="min-w-0 flex-1"
          value={draftSearch}
          onChange={setDraftSearch}
          placeholder="实验名称或来源"
          label="搜索实验"
        />
        <Select
          value={sourceMode}
          onValueChange={(value) => value && updateFilter('sourceMode', value)}
        >
          <SelectTrigger aria-label="筛选实验来源" className="w-36 shrink-0">
            <SelectValue>
              {sourceModeOptions.find((option) => option.value === sourceMode)?.label ??
                '全部来源'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-max min-w-(--anchor-width) max-w-(--available-width)">
            <SelectGroup>
              {sourceModeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => value && updateFilter('status', value)}>
          <SelectTrigger aria-label="筛选实验状态" className="w-36 shrink-0">
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
        <FilterReset
          className="shrink-0 justify-self-start"
          hasConditions={hasFilters}
          onReset={clearFilters}
        />
        <Button
          nativeButton={false}
          render={
            <Link to={strategyCenterPath.newExperiment}>
              <Plus aria-hidden="true" />
              新建实验
            </Link>
          }
        />
      </div>
      {!experiments.data && experiments.isPending ? (
        <DataStateBanner state="loading" description="正在读取策略实验列表。" />
      ) : null}
      {!experiments.data && experiments.isError ? (
        <DataStateBanner
          state="error"
          description="策略实验列表读取失败，当前筛选和分页范围已保留。"
          onRetry={() => void experiments.refetch()}
        />
      ) : null}
      {savedRename ? (
        <DataStateBanner
          state={renameReadFailed ? 'stale' : 'loading'}
          description={
            renameReadFailed
              ? `实验「${savedRename.name}」已保存；保存后的列表确认读取失败，无需重复提交。`
              : `实验「${savedRename.name}」已保存，正在重新读取当前列表。`
          }
          onRetry={renameReadFailed ? () => void refreshRenamedList(savedRename.id) : undefined}
        />
      ) : null}
      <ListRefreshRegion refreshing={experiments.isRefetching && !!experiments.data} label="正在刷新策略实验">
        {experiments.data && items.length === 0 ? (
          <Empty className="rounded-md border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FlaskConical />
              </EmptyMedia>
              <EmptyTitle>没有匹配的实验</EmptyTitle>
              <EmptyDescription>调整筛选条件，或创建新的策略实验。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                nativeButton={false}
                render={<Link to={strategyCenterPath.newExperiment}>新建实验</Link>}
              />
            </EmptyContent>
          </Empty>
        ) : null}
        {experiments.data && items.length > 0 ? (
          <TableContainer>
            <table className="w-full min-w-[900px] table-fixed text-sm">
              <TableHeader className="border-b text-left">
                <tr>
                  <TableHead className="w-[38%]">实验名称 / 来源</TableHead>
                  <TableHead className="w-[19%]">状态</TableHead>
                  <TableHead className="w-[23%]">进展与产出</TableHead>
                  <TableHead className="w-[12%]">更新时间</TableHead>
                  <TableHead data-table-action-static className="w-[8%] text-right">
                    操作
                  </TableHead>
                </tr>
              </TableHeader>
              <tbody>
                {items.map((experiment) => (
                  <tr key={experiment.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      {renamingId === experiment.id ? (
                        <div className="flex w-full max-w-sm flex-col items-stretch gap-2">
                          <Input
                            autoFocus
                            className="w-full"
                            aria-label="新的实验名称"
                            value={savedRename?.id === experiment.id ? savedRename.name : renameValue}
                            disabled={renameMutation.isPending || savedRename?.id === experiment.id}
                            onChange={(event) => {
                              if (renameFlightRef.current || savedRename?.id === experiment.id)
                                return;
                              setRenameValue(event.target.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                submitRename(experiment.id, renameValue.trim());
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                          />
                          {savedRename?.id !== experiment.id ? (
                            <Button
                              aria-busy={renameMutation.isPending}
                              size="sm"
                              className="w-fit"
                              disabled={!renameValue.trim() || renameMutation.isPending}
                              onClick={() => submitRename(experiment.id, renameValue.trim())}
                            >
                              {renameMutation.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
                              {renameMutation.isPending ? '保存中…' : '保存'}
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-fit"
                            aria-label="取消重命名"
                            disabled={renameMutation.isPending || savedRename !== null}
                            onClick={cancelRename}
                          >
                            取消
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Link
                            className="block truncate font-medium text-foreground hover:text-primary/80"
                            title={experiment.name}
                            to={strategyCenterPath.experiment(experiment.id)}
                          >
                            {experiment.name}
                          </Link>
                          <div className="mt-1 truncate text-xs text-muted-foreground" title={experimentSourceLabel(experiment)}>
                            {experimentSourceLabel(experiment)}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={experimentStatusVariant(experiment.status)}>
                        {experimentStatusLabel(experiment.status)}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {experimentStageLabel(experiment.stage)}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-normal text-muted-foreground">
                      {experimentProgressLabel(experiment)}
                    </td>
                    <td className="px-4 py-3 whitespace-normal text-muted-foreground">
                      {formatDateTime(experiment.updatedAt, '时间未记录')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`管理 ${experiment.name}`}
                              disabled={
                                renamingId === experiment.id &&
                                (renameMutation.isPending || savedRename?.id === experiment.id)
                              }
                            >
                              <MoreHorizontal />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              disabled={
                                renamingId !== null ||
                                renameMutation.isPending ||
                                savedRename !== null
                              }
                              onClick={() => {
                                setRenamingId(experiment.id);
                                setRenameValue(experiment.name);
                                setSavedRename(null);
                                setRenameReadFailed(false);
                              }}
                            >
                              <Pencil />
                              修改名称
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={cloneMutation.isPending}
                              onClick={() => cloneMutation.mutate(experiment.id)}
                            >
                              <Copy />
                              克隆实验
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        ) : null}
      </ListRefreshRegion>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {experiments.data ? `共 ${experiments.data.totalCount} 条` : '总数暂不可用'}
          {trail.length > 0 ? `，第 ${trail.length + 1} 页` : ''}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={trail.length === 0 || experiments.isFetching}
            onClick={goPrevious}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!experiments.data?.pageInfo.hasNextPage || experiments.isFetching}
            onClick={goNext}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
