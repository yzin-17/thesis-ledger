import { useEffect, useState } from 'react';
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
import { Field, FieldLabel } from '@/components/ui/field';
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
  { value: 'awaiting_finalization', label: '等待锁定' },
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
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: optimizationKey });
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameOptimizationExperiment(id, name),
    onSuccess: async () => {
      setRenamingId(null);
      await invalidate();
      toast.add({ title: '实验名称已更新' });
    },
    onError: (error) =>
      toast.add({
        title: '改名失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        type: 'error',
      }),
  });
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
        description: error instanceof Error ? error.message : '请稍后重试',
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
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(18rem,1fr)_max-content_max-content_auto] md:items-center">
        <StrategyListSearchField
          value={draftSearch}
          onChange={setDraftSearch}
          placeholder="实验名称或来源"
          label="搜索实验"
        />
        <Field className="w-auto shrink-0 flex-row items-center gap-2">
          <FieldLabel className="shrink-0">来源</FieldLabel>
          <Select
            value={sourceMode}
            onValueChange={(value) => value && updateFilter('sourceMode', value)}
          >
            <SelectTrigger aria-label="筛选实验来源" className="w-fit">
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
        </Field>
        <Field className="w-auto shrink-0 flex-row items-center gap-2">
          <FieldLabel className="shrink-0">状态</FieldLabel>
          <Select value={status} onValueChange={(value) => value && updateFilter('status', value)}>
            <SelectTrigger aria-label="筛选实验状态" className="w-fit">
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
      {!experiments.isPending && items.length === 0 ? (
        <Empty className="border border-dashed">
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
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="w-[38%] px-4 py-3 font-medium">实验名称 / 来源</th>
                <th className="w-[19%] px-4 py-3 font-medium">状态</th>
                <th className="w-[23%] px-4 py-3 font-medium">进展与产出</th>
                <th className="w-[12%] px-4 py-3 font-medium">更新时间</th>
                <th data-table-action-static className="w-[8%] px-4 py-3 text-right font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((experiment) => (
                <tr key={experiment.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    {renamingId === experiment.id ? (
                      <div className="flex max-w-sm gap-2">
                        <Input
                          autoFocus
                          aria-label="新的实验名称"
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && renameValue.trim())
                              renameMutation.mutate({
                                id: experiment.id,
                                name: renameValue.trim(),
                              });
                            if (event.key === 'Escape') setRenamingId(null);
                          }}
                        />
                        <Button
                          size="sm"
                          disabled={!renameValue.trim() || renameMutation.isPending}
                          onClick={() =>
                            renameMutation.mutate({ id: experiment.id, name: renameValue.trim() })
                          }
                        >
                          保存
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Link
                          className="font-medium text-foreground hover:underline"
                          to={strategyCenterPath.experiment(experiment.id)}
                        >
                          {experiment.name}
                        </Link>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
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
                  <td className="px-4 py-3 text-muted-foreground">
                    {experimentProgressLabel(experiment)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
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
                          >
                            <MoreHorizontal />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            onClick={() => {
                              setRenamingId(experiment.id);
                              setRenameValue(experiment.name);
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
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          共 {experiments.data?.totalCount ?? 0} 条
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
