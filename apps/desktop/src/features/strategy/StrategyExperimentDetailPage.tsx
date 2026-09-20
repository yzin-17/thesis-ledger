import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToastManager } from '@/components/ui/toast';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import {
  adoptOptimizationCandidate,
  cancelOptimizationExperiment,
  cloneOptimizationExperiment,
  fetchOptimizationAdoptionContext,
  fetchOptimizationCompare,
  fetchOptimizationExperiment,
  finalizeOptimizationExperiment,
  type OptimizationCandidate,
} from './strategy-optimization.api.js';
import {
  candidateAdoptionEligibility,
  candidateDiffSummary,
  candidateMetric,
  canRevealTestMetrics,
  experimentStageLabels,
  experimentStopReasonText,
  findStrategyVersion,
  metricRecord,
  metricValue,
  scalarText,
  strategyVersionLabel,
} from './strategy-experiment-detail.model.js';
import {
  ExperimentAdoptionReview,
  ExperimentCandidateDiff,
  ExperimentRunLinks,
  ExperimentRuntimeDetails,
} from './StrategyExperimentDetailSections.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import { strategyKeys } from './strategy.queries.js';
import type { StrategyRecord } from './strategy.types.js';

const optimizationKey = ['desktop', 'strategy', 'optimization'] as const;
const settledStatuses = new Set(['succeeded', 'failed', 'cancelled']);
const nonPollingStatuses = new Set(['awaiting_finalization', 'succeeded', 'failed', 'cancelled']);

export function StrategyExperimentDetailPage({ strategies }: { strategies: StrategyRecord[] }) {
  const { experimentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToastManager();
  const view = searchParams.get('view') === 'runtime' ? 'runtime' : 'candidates';
  const [lockedCandidateIds, setLockedCandidateIds] = useState<string[]>([]);
  const [preselectedCandidateId, setPreselectedCandidateId] = useState<string | null>(null);
  const [reviewCandidate, setReviewCandidate] = useState<OptimizationCandidate | null>(null);
  const [adoptedVersion, setAdoptedVersion] = useState<{
    id: string;
    strategyId: string;
    version: number;
  } | null>(null);
  const detailQuery = useQuery({
    queryKey: [...optimizationKey, 'experiment', experimentId],
    queryFn: () => fetchOptimizationExperiment(experimentId ?? ''),
    enabled: Boolean(experimentId),
    refetchInterval: (query) => {
      const status = query.state.data?.experiment.status;
      return status && !nonPollingStatuses.has(status) ? 3_000 : false;
    },
  });
  const compareQuery = useQuery({
    queryKey: [...optimizationKey, 'compare', experimentId],
    queryFn: () => fetchOptimizationCompare(experimentId ?? ''),
    enabled: Boolean(experimentId),
    refetchInterval:
      detailQuery.data && !nonPollingStatuses.has(detailQuery.data.experiment.status)
        ? 3_000
        : false,
  });
  const experiment = detailQuery.data?.experiment;
  const candidates = detailQuery.data?.candidates ?? [];
  const attempts = detailQuery.data?.attempts ?? [];
  const compare = compareQuery.data;
  const serverLockedCandidateIds = experiment?.lockedCandidateIds?.join(',') ?? '';
  useEffect(() => {
    if (!experiment) return;
    setLockedCandidateIds(experiment.lockedCandidateIds ?? []);
    setPreselectedCandidateId(experiment.selectedCandidateId ?? null);
  }, [experiment?.id, experiment?.selectedCandidateId, serverLockedCandidateIds]);
  const baseline = experiment
    ? findStrategyVersion(strategies, experiment.baselineStrategyVersionId)
    : null;
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: optimizationKey }),
      queryClient.invalidateQueries({ queryKey: strategyKeys.strategies() }),
    ]);
  };
  const finalizeMutation = useMutation({
    mutationFn: () => {
      if (!experimentId || !preselectedCandidateId || lockedCandidateIds.length === 0)
        throw new Error('请选择封存测试候选和预选候选');
      return finalizeOptimizationExperiment(experimentId, {
        candidateIds: lockedCandidateIds,
        selectedCandidateId: preselectedCandidateId,
        expectedStage: 'awaiting_finalization',
      });
    },
    onSuccess: async () => {
      toast.add({ title: '封存测试已完成', description: '所有测试完成后，服务端已统一揭示结果。' });
      await invalidate();
    },
    onError: (error) =>
      toast.add({
        title: '封存测试未完成',
        description: error instanceof Error ? error.message : '请稍后重试',
        type: 'error',
      }),
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelOptimizationExperiment(experimentId ?? ''),
    onSuccess: async () => {
      toast.add({ title: '实验已取消' });
      await invalidate();
    },
    onError: (error) =>
      toast.add({
        title: '取消失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        type: 'error',
      }),
  });
  const cloneMutation = useMutation({
    mutationFn: () => cloneOptimizationExperiment(experimentId ?? ''),
    onSuccess: async () => {
      toast.add({ title: '实验已克隆' });
      await invalidate();
    },
    onError: (error) =>
      toast.add({
        title: '克隆失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        type: 'error',
      }),
  });
  const adoptionContextQuery = useQuery({
    queryKey: [...optimizationKey, 'adoption-context', experimentId, reviewCandidate?.id],
    queryFn: () => fetchOptimizationAdoptionContext(experimentId ?? '', reviewCandidate?.id ?? ''),
    enabled: Boolean(experimentId && reviewCandidate),
  });
  const adoptionIntentKey = useMemo(() => crypto.randomUUID(), [experimentId, reviewCandidate?.id]);
  const adoptMutation = useMutation({
    mutationFn: () => {
      const context = adoptionContextQuery.data;
      if (!experimentId || !reviewCandidate || !context) throw new Error('采纳上下文尚未就绪');
      return adoptOptimizationCandidate(experimentId, {
        candidateId: reviewCandidate.id,
        candidateHash: reviewCandidate.executionHash,
        expectedStrategyVersion: context.expectedStrategyVersion,
        idempotencyKey: adoptionIntentKey,
        acknowledgeTestExposure: reviewCandidate.id !== experiment?.selectedCandidateId,
      });
    },
    onSuccess: async (result) => {
      setAdoptedVersion({
        id: result.strategyVersion.id,
        strategyId: result.strategyVersion.strategyId,
        version: result.strategyVersion.version,
      });
      setReviewCandidate(null);
      toast.add({
        title: `已采纳为正式策略 v${result.strategyVersion.version}`,
        description: '已有风险应用不会自动更新或启用。',
      });
      await invalidate();
    },
    onError: (error) =>
      toast.add({
        title: '采纳失败',
        description: error instanceof Error ? error.message : '请重新审阅当前版本后再试',
        type: 'error',
      }),
  });
  const toggleLocked = (candidateId: string) => {
    setLockedCandidateIds((current) => {
      if (current.includes(candidateId)) return current.filter((id) => id !== candidateId);
      if (current.length >= 3) return current;
      return [...current, candidateId];
    });
  };

  if (detailQuery.isPending || compareQuery.isPending)
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">正在读取实验详情…</div>
    );
  if (!experiment || detailQuery.isError || compareQuery.isError)
    return (
      <DataStateBanner
        state="error"
        onRetry={() => {
          void detailQuery.refetch();
          void compareQuery.refetch();
        }}
      />
    );

  const retryRequired = experiment.stopReason?.startsWith('final_test_retry_required:') ?? false;
  const testRevealed = canRevealTestMetrics(experiment);
  const active = !settledStatuses.has(experiment.status);
  const baselineValidation = metricRecord(compare?.baseline.metrics.validation);
  const baselineTest = metricRecord(compare?.baseline.metrics.test);
  const finalizedCandidate = candidates.find(
    (candidate) => candidate.id === experiment.selectedCandidateId,
  );
  const persistedAdoptedCandidate = candidates.find(
    (candidate) => candidate.adoptedStrategyVersionId,
  );
  const persistedAdoptedVersion = persistedAdoptedCandidate?.adoptedStrategyVersionId
    ? findStrategyVersion(strategies, persistedAdoptedCandidate.adoptedStrategyVersionId)
    : null;
  const displayedAdoptedVersion =
    adoptedVersion ??
    (persistedAdoptedVersion
      ? {
          id: persistedAdoptedVersion.version.id,
          strategyId: persistedAdoptedVersion.strategy.id,
          version: persistedAdoptedVersion.version.version,
        }
      : null);

  return (
    <div className="space-y-4">
      <Button
        nativeButton={false}
        render={
          <Link to={strategyCenterPath.experiments}>
            <ArrowLeft aria-hidden="true" />
            返回 AI 实验
          </Link>
        }
        variant="ghost"
        size="sm"
        className="-ml-2"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">策略中心 / AI 实验</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{experiment.name}</h2>
            <Badge variant="outline">
              {experimentStageLabels[experiment.stage] ?? experiment.stage}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>基线：</span>
            {baseline ? (
              <Link
                className="font-medium text-foreground underline-offset-4 hover:underline"
                to={strategyCenterPath.strategyVersion(baseline.strategy.id, baseline.version.id)}
              >
                {baseline.strategy.name} {strategyVersionLabel(baseline.version)}
              </Link>
            ) : (
              <span>{experiment.sourceMode === 'discovery' ? '从零探索' : '基线版本不可用'}</span>
            )}
            <span>· 当前阶段：{experimentStageLabels[experiment.stage] ?? experiment.stage}</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="icon" aria-label="实验更多操作">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={cloneMutation.isPending}
              onClick={() => cloneMutation.mutate()}
            >
              克隆实验
            </DropdownMenuItem>
            {active ? (
              <DropdownMenuItem
                variant="destructive"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                取消实验
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {experiment.stopReason && !retryRequired ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="font-medium">实验已停止</div>
          <div className="mt-1 text-muted-foreground">
            {experimentStopReasonText(experiment.stopReason)}
          </div>
        </div>
      ) : null}

      {displayedAdoptedVersion ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            已采纳为正式策略 v{displayedAdoptedVersion.version}
          </span>
          <Button
            nativeButton={false}
            render={
              <Link
                to={strategyCenterPath.strategyVersion(
                  displayedAdoptedVersion.strategyId,
                  displayedAdoptedVersion.id,
                )}
              >
                查看策略版本
                <ExternalLink aria-hidden="true" />
              </Link>
            }
            variant="outline"
            size="sm"
          />
        </div>
      ) : null}

      <Tabs
        value={view}
        onValueChange={(value) => {
          const next = new URLSearchParams(searchParams);
          if (value === 'runtime') next.set('view', 'runtime');
          else next.delete('view');
          setSearchParams(next, { replace: true });
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="candidates">候选与评估</TabsTrigger>
          <TabsTrigger value="runtime">运行详情</TabsTrigger>
        </TabsList>
        <TabsContent value="candidates" className="space-y-4 pt-4">
          {!testRevealed && (experiment.stage === 'testing' || retryRequired) ? (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              封存测试尚未全部完成，测试指标和质量结论保持隐藏。
            </div>
          ) : null}
          {retryRequired ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <div>
                <div className="font-medium">部分封存测试发生技术失败</div>
                <div className="mt-1 text-muted-foreground">
                  可以重试原批次未完成部分，或放弃实验。已完成的部分结果不会单独揭示。
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  放弃实验
                </Button>
                <Button
                  disabled={finalizeMutation.isPending}
                  onClick={() => finalizeMutation.mutate()}
                >
                  <RotateCcw aria-hidden="true" />
                  重试未完成测试
                </Button>
              </div>
            </div>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>候选比较</CardTitle>
              <CardDescription>
                基线始终作为固定对照。选择和采纳资格来自当前服务端状态。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">候选</th>
                      <th className="px-3 py-2 font-medium">主要变更</th>
                      <th className="px-3 py-2 font-medium">验证收益</th>
                      <th className="px-3 py-2 font-medium">最大回撤</th>
                      <th className="px-3 py-2 font-medium">已平仓交易</th>
                      <th className="px-3 py-2 font-medium">资格</th>
                      <StickyTableActionHeader className="px-3 py-2 font-medium">
                        操作
                      </StickyTableActionHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-3 py-3 font-medium">
                        基线 {baseline ? strategyVersionLabel(baseline.version) : ''}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">固定对照</td>
                      <StickyTableActionCell className="px-3 py-3">
                        {metricValue(baselineValidation, ['totalReturn', 'return'])}
                      </StickyTableActionCell>
                      <td className="px-3 py-3">
                        {metricValue(baselineValidation, ['maxDrawdown'])}
                      </td>
                      <td className="px-3 py-3">
                        {metricValue(baselineValidation, ['closedTradeCount', 'tradeCount'])}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">对照</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <ExperimentRunLinks runRefs={compare?.baseline.runRefs ?? {}} />
                      </td>
                    </tr>
                    {candidates.map((candidate) => {
                      const validation = candidateMetric(candidate, 'validation');
                      const test = candidateMetric(candidate, 'test');
                      const adoptionBlock = candidateAdoptionEligibility(experiment, candidate);
                      const candidateAdoptedVersion = candidate.adoptedStrategyVersionId
                        ? findStrategyVersion(strategies, candidate.adoptedStrategyVersionId)
                        : null;
                      const canSelect =
                        experiment.stage === 'awaiting_finalization' &&
                        candidate.validationStatus === 'valid' &&
                        !retryRequired;
                      return (
                        <tr key={candidate.id} className="align-top">
                          <td className="px-3 py-3">
                            <div className="font-medium">候选 {candidate.candidateNumber}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {candidate.modelKey}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {candidateDiffSummary(candidate)}
                          </td>
                          <td className="px-3 py-3">
                            {metricValue(validation, ['totalReturn', 'return'])}
                            {testRevealed && test.totalReturn !== undefined ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                测试：{scalarText(test.totalReturn)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            {metricValue(validation, ['maxDrawdown'])}
                            {testRevealed && test.maxDrawdown !== undefined ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                测试：{scalarText(test.maxDrawdown)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            {metricValue(validation, ['closedTradeCount', 'tradeCount'])}
                            {testRevealed ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                测试：{metricValue(test, ['closedTradeCount', 'tradeCount'])}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant={adoptionBlock ? 'outline' : 'default'}>
                              {adoptionBlock ?? '可采纳'}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col items-start gap-2">
                              <ExperimentRunLinks runRefs={candidate.runRefs} />
                              {canSelect ? (
                                <div className="flex gap-2">
                                  <Button
                                    size="xs"
                                    variant={
                                      lockedCandidateIds.includes(candidate.id)
                                        ? 'default'
                                        : 'outline'
                                    }
                                    onClick={() => toggleLocked(candidate.id)}
                                  >
                                    {lockedCandidateIds.includes(candidate.id)
                                      ? '已选测试'
                                      : '进入测试'}
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant={
                                      preselectedCandidateId === candidate.id
                                        ? 'default'
                                        : 'outline'
                                    }
                                    onClick={() => {
                                      setPreselectedCandidateId(candidate.id);
                                      if (!lockedCandidateIds.includes(candidate.id))
                                        setLockedCandidateIds((current) =>
                                          [...current, candidate.id].slice(0, 3),
                                        );
                                    }}
                                  >
                                    预选采纳
                                  </Button>
                                </div>
                              ) : null}
                              {candidateAdoptedVersion ? (
                                <Button
                                  nativeButton={false}
                                  render={
                                    <Link
                                      to={strategyCenterPath.strategyVersion(
                                        candidateAdoptedVersion.strategy.id,
                                        candidateAdoptedVersion.version.id,
                                      )}
                                    >
                                      查看已采纳版本
                                      <ExternalLink aria-hidden="true" />
                                    </Link>
                                  }
                                  size="xs"
                                  variant="outline"
                                />
                              ) : null}
                              {!adoptionBlock && !candidate.adoptedStrategyVersionId ? (
                                <Button size="xs" onClick={() => setReviewCandidate(candidate)}>
                                  审阅并采纳
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {candidates.map((candidate) => (
                <ExperimentCandidateDiff key={candidate.id} candidate={candidate} />
              ))}
              {experiment.stage === 'awaiting_finalization' && !retryRequired ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
                  <div className="text-sm">
                    <div className="font-medium">
                      已选择 {lockedCandidateIds.length} 个封存测试候选
                    </div>
                    <div className="text-muted-foreground">
                      最多 3 个，预选候选必须包含在测试批次中。
                    </div>
                  </div>
                  <Button
                    disabled={
                      finalizeMutation.isPending ||
                      lockedCandidateIds.length === 0 ||
                      !preselectedCandidateId
                    }
                    onClick={() => finalizeMutation.mutate()}
                  >
                    {finalizeMutation.isPending ? '封存测试中…' : '锁定并运行封存测试'}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {reviewCandidate && adoptionContextQuery.isPending ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              正在读取三方差异…
            </div>
          ) : null}
          {reviewCandidate && adoptionContextQuery.isError ? (
            <DataStateBanner state="error" onRetry={() => void adoptionContextQuery.refetch()} />
          ) : null}
          {reviewCandidate && adoptionContextQuery.data ? (
            <ExperimentAdoptionReview
              context={adoptionContextQuery.data}
              pending={adoptMutation.isPending}
              acknowledgeExposure={reviewCandidate.id !== finalizedCandidate?.id}
              onConfirm={() => adoptMutation.mutate()}
              onCancel={() => setReviewCandidate(null)}
            />
          ) : null}
          {testRevealed && baselineTest.totalReturn !== undefined ? (
            <p className="text-xs text-muted-foreground">
              基线封存测试收益：{scalarText(baselineTest.totalReturn)}
            </p>
          ) : null}
        </TabsContent>
        <TabsContent value="runtime" className="pt-4">
          <ExperimentRuntimeDetails experiment={experiment} attempts={attempts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
