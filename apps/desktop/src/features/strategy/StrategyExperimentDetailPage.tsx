import { createClientRequestId } from '../../lib/client-request-id';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { optimizationExperimentInstrumentLabel } from '@thesis-ledger/schemas';
import { LoadingState } from '@/components/ui/spinner';
import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { useRef, useState } from 'react';
import { requestFailureMessage } from '@/shared/api/request-error';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, CheckCircle2, FlaskConical, MoreHorizontal, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  completeOptimizationExperiment,
  type OptimizationCandidate,
} from './strategy-optimization.api.js';
import {
  candidateAdoptionEligibility,
  candidateDiffSummary,
  candidateMetric,
  canRevealTestMetrics,
  experimentStageLabels,
  findStrategyVersion,
  latestExperimentAdoption,
  metricRecord,
  metricValue,
  strategyVersionLabel,
} from './strategy-experiment-detail.model.js';
import {
  ExperimentCandidateDiff,
  ExperimentRunLinks,
  ExperimentRuntimeDetails,
} from './StrategyExperimentDetailSections.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import { strategyKeys } from './strategy.queries.js';
import { ExperimentReturnValue } from './ExperimentReturnValue.js';
import { ExperimentEvaluationNote } from './ExperimentEvaluationNote.js';
import { ExperimentAdoptionDialog } from './ExperimentAdoptionDialog.js';
import { ExperimentFailureNotice } from './ExperimentFailureNotice.js';
import type { StrategyRecord } from './strategy.types.js';
const optimizationKey = ['desktop', 'strategy', 'optimization'] as const;
const settledStatuses = new Set(['succeeded', 'failed', 'cancelled']);
const nonPollingStatuses = new Set(['succeeded', 'failed', 'cancelled']);

export function StrategyExperimentDetailPage({ strategies }: { strategies: StrategyRecord[] }) {
  const { experimentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToastManager();
  const view = searchParams.get('view') === 'runtime' ? 'runtime' : 'candidates';
  const [reviewCandidate, setReviewCandidate] = useState<OptimizationCandidate | null>(null);
  const adoptionTrigger = useRef<HTMLButtonElement | null>(null);
  const [writeReceipt, setWriteReceipt] = useState<string | null>(null);
  const [clonedExperimentId, setClonedExperimentId] = useState<string | null>(null);
  const errorToasts = useRef<Record<string, string>>({});
  const clearOperationError = (operation: string) => {
    const id = errorToasts.current[operation];
    if (id) toast.close?.(id);
    delete errorToasts.current[operation];
  };
  const reportOperationError = (operation: string, title: string, error: unknown) => {
    errorToasts.current[operation] = toast.add({
      title,
      description: requestFailureMessage(error, '请保留当前配置后重试'),
      type: 'error',
    });
  };
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
    onMutate: () => clearOperationError('finalize'),
    mutationFn: () => {
      if (!experimentId) throw new Error('实验不存在');
      return completeOptimizationExperiment(experimentId);
    },
    onSuccess: async () => {
      setWriteReceipt('封存测试请求已确认');
      toast.add({
        title: '封存测试请求已确认',
        description: '完成与结果揭示以重新读取的服务端状态为准。',
      });
      await invalidate();
    },
    onError: (error) => reportOperationError('finalize', '封存测试未完成', error),
  });
  const cancelMutation = useMutation({
    onMutate: () => clearOperationError('cancel'),
    mutationFn: () => cancelOptimizationExperiment(experimentId ?? ''),
    onSuccess: async () => {
      setWriteReceipt('实验已确认取消');
      toast.add({ title: '实验已取消' });
      await invalidate();
    },
    onError: (error) => reportOperationError('cancel', '取消失败', error),
  });
  const cloneMutation = useMutation({
    onMutate: () => clearOperationError('clone'),
    mutationFn: () => cloneOptimizationExperiment(experimentId ?? ''),
    onSuccess: async (created) => {
      setWriteReceipt('实验已确认克隆');
      setClonedExperimentId(created.id);
      queryClient.setQueryData([...optimizationKey, 'experiment', created.id], {
        experiment: created,
        candidates: [],
        attempts: [],
      });
      toast.add({ title: '实验已克隆' });
      await invalidate();
    },
    onError: (error) => reportOperationError('clone', '克隆失败', error),
  });
  const adoptionContextQuery = useQuery({
    queryKey: [...optimizationKey, 'adoption-context', experimentId, reviewCandidate?.id],
    queryFn: () => fetchOptimizationAdoptionContext(experimentId ?? '', reviewCandidate?.id ?? ''),
    enabled: Boolean(experimentId && reviewCandidate),
  });
  const adoptionIntent = useRef<{
    experimentId: string;
    body: Parameters<typeof adoptOptimizationCandidate>[1];
  } | null>(null);
  const adoptMutation = useMutation({
    onMutate: () => clearOperationError('adopt'),
    mutationFn: () => {
      const context = adoptionContextQuery.data;
      if (!experimentId || !reviewCandidate || !context) throw new Error('采纳上下文尚未就绪');
      if (adoptionIntent.current?.experimentId !== experimentId || adoptionIntent.current.body.candidateId !== reviewCandidate.id) {
        adoptionIntent.current = { experimentId, body: {
          candidateId: reviewCandidate.id,
          candidateHash: reviewCandidate.executionHash,
          expectedStrategyVersion: context.expectedStrategyVersion,
          idempotencyKey: createClientRequestId(),
          acknowledgeTestExposure: reviewCandidate.id !== experiment?.selectedCandidateId,
        } };
      }
      return adoptOptimizationCandidate(experimentId, adoptionIntent.current.body);
    },
    onSuccess: async (result) => {
      adoptionIntent.current = null;
      setWriteReceipt(`已采纳为正式策略 v${result.strategyVersion.version}`);
      setAdoptedVersion({
        id: result.strategyVersion.id,
        strategyId: result.strategyVersion.strategyId,
        version: result.strategyVersion.version,
      });
      setReviewCandidate(null);
      toast.add({
        title: `已采纳为正式策略 v${result.strategyVersion.version}`,
        description: result.detailsStatus === 'unavailable'
          ? '正式版本已保存，风险规则预览暂不可用。已有风险应用保持当前状态。'
          : '已有风险应用不会自动更新或启用。',
      });
      await invalidate();
    },
    onError: async (error) => {
      await invalidate();
      const refreshed = queryClient.getQueryData<Awaited<ReturnType<typeof fetchOptimizationExperiment>>>(
        [...optimizationKey, 'experiment', experimentId],
      );
      const committed = refreshed?.candidates.find((item) => item.id === reviewCandidate?.id);
      if (committed?.adoptedStrategyVersionId && committed.executionHash === adoptionIntent.current?.body.candidateHash) {
        adoptionIntent.current = null;
        setWriteReceipt('候选已采纳，正式版本已保存');
        setReviewCandidate(null);
        toast.add({ title: '已确认采纳', description: '正式版本已保存。已有风险应用不会自动更新或启用。' });
        return;
      }
      const title = error instanceof ThesisLedgerApiError && error.payload?.error === 'ADOPTION_OUTCOME_UNCONFIRMED'
        ? '采纳结果待确认' : '采纳失败';
      if (title !== '采纳结果待确认') adoptionIntent.current = null;
      reportOperationError('adopt', title, error);
    },
  });

  if (detailQuery.isPending || compareQuery.isPending)
    return <LoadingState label="正在读取实验详情" />;
  if (!experiment)
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
  const readFailed = detailQuery.isError || compareQuery.isError;
  const writeBusy =
    finalizeMutation.isPending ||
    cancelMutation.isPending ||
    cloneMutation.isPending ||
    adoptMutation.isPending;
  const writesDisabled = readFailed || writeBusy;
  const testRevealed = canRevealTestMetrics(experiment);
  const active = !settledStatuses.has(experiment.status);
  const baselineValidation = metricRecord(compare?.baseline.metrics.validation);
  const baselineTest = metricRecord(compare?.baseline.metrics.test);
  const finalizedCandidate = candidates.find(
    (candidate) => candidate.id === experiment.selectedCandidateId,
  );
  const displayedAdoptedVersion = latestExperimentAdoption(candidates, strategies, adoptedVersion);

  return (
    <div className="flex flex-col gap-4">
      <Link
        to={strategyCenterPath.experiments}
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })}
      >
        <ArrowLeft data-icon="inline-start" aria-hidden="true" />
        返回 AI 实验
      </Link>
      {readFailed ? (
        <DataStateBanner
          state="stale"
          description={`${writeReceipt ? `${writeReceipt}，无需重复提交。` : '显示的是上次读取结果；已确认创建或保存的实验无需重复提交。'}实验详情或对比读取失败，请先重新读取。`}
          onRetry={() => {
            void detailQuery.refetch();
            void compareQuery.refetch();
          }}
        />
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">策略中心 / AI 实验</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{experiment.name}</h2>
            <Badge variant="outline">
              {experimentStageLabels[experiment.stage] ?? experiment.stage}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {optimizationExperimentInstrumentLabel(experiment) && (
              <span className="text-foreground">
                {optimizationExperimentInstrumentLabel(experiment)}
              </span>
            )}
            <span className="inline-flex flex-wrap items-baseline gap-1">
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
            </span>
          </div>
        </div>
        <div className="contents">
          {clonedExperimentId ? (
            <Link
              to={strategyCenterPath.experiment(clonedExperimentId)}
              className={cn(
                buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className:
                    'col-span-2 row-start-2 justify-self-start shadow-none sm:col-span-1 sm:col-start-2 sm:row-start-1',
                }),
              )}
            >
              查看克隆实验
            </Link>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="实验更多操作"
                  className="col-start-2 row-start-1 sm:col-start-3"
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={writesDisabled} onClick={() => cloneMutation.mutate()}>
                克隆实验
              </DropdownMenuItem>
              {active ? (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={writesDisabled}
                  onClick={() => cancelMutation.mutate()}
                >
                  取消实验
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(experiment.stopReason || experiment.status === 'failed') && !retryRequired ? (
        <ExperimentFailureNotice experiment={experiment} disabled={writesDisabled} onRetried={invalidate} />
      ) : null}

      {displayedAdoptedVersion ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-success/40 bg-success/5 p-3 text-sm">
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
        <TabsContent value="candidates" className="space-y-4">
          {!testRevealed && (['testing', 'awaiting_finalization'].includes(experiment.stage) || retryRequired) ? (
            <div className="flex gap-2 rounded-md border border-caution/40 bg-caution/5 p-3 text-sm">
              <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              封存测试完成后自动展示完整结果。
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
                  disabled={writesDisabled}
                  onClick={() => cancelMutation.mutate()}
                >
                  放弃实验
                </Button>
                <Button disabled={writesDisabled} onClick={() => finalizeMutation.mutate()}>
                  <RotateCcw aria-hidden="true" />
                  重试未完成测试
                </Button>
              </div>
            </div>
          ) : null}
          <section className="flex flex-col gap-4" aria-label="候选比较">
            <header className="flex flex-col gap-1">
              <h3 className="text-xl font-medium">候选比较</h3>
              <p className="text-sm text-muted-foreground">
                基线始终作为固定对照。选择和采纳资格来自当前服务端状态。
              </p>
            </header>
            <div className="flex flex-col gap-3">
              <TableContainer
                frame="plain"
                refreshing={compareQuery.isRefetching || detailQuery.isRefetching}
                refreshLabel="正在刷新实验候选"
              >
                <table className="w-full min-w-[900px] text-sm">
                  <TableHeader className="text-left">
                    <tr>
                      <TableHead>候选</TableHead>
                      <TableHead>主要变更</TableHead>
                      <TableHead className="text-right">验证收益</TableHead>
                      <TableHead className="text-right">最大回撤</TableHead>
                      <TableHead className="text-right">已平仓交易</TableHead>
                      <TableHead>资格</TableHead>
                      <StickyTableActionHeader>操作</StickyTableActionHeader>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-3 py-3 font-medium">
                        基线 {baseline ? strategyVersionLabel(baseline.version) : ''}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">固定对照</td>
                      <td className="px-3 py-3 text-right">
                        <ExperimentReturnValue metrics={baselineValidation} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {metricValue(baselineValidation, ['maxDrawdown'], 'percent')}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {metricValue(baselineValidation, ['closedTradeCount', 'tradeCount'])}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">对照</Badge>
                      </td>
                      <StickyTableActionCell className="px-3 py-3">
                        <ExperimentRunLinks
                          className="justify-end"
                          runRefs={compare?.baseline.runRefs ?? {}}
                        />
                      </StickyTableActionCell>
                    </tr>
                    {candidates.map((candidate) => {
                      const validation = candidateMetric(candidate, 'validation');
                      const test = candidateMetric(candidate, 'test');
                      const adoptionBlock = candidateAdoptionEligibility(experiment, candidate);
                      const candidateAdoptedVersion = candidate.adoptedStrategyVersionId
                        ? findStrategyVersion(strategies, candidate.adoptedStrategyVersionId)
                        : null;
                      return (
                        <tr key={candidate.id} className="align-top">
                          <td className="px-3 py-3">
                            <div className="font-medium">候选 {candidate.candidateNumber}</div>
                            <div className="mt-1 max-w-64 whitespace-normal break-words text-xs text-muted-foreground">
                              {candidate.modelKey}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {candidateDiffSummary(candidate)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <ExperimentReturnValue metrics={validation} />
                            {testRevealed && test.totalReturn !== undefined ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                测试：
                                <ExperimentReturnValue metrics={test} keys={['totalReturn']} />
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {metricValue(validation, ['maxDrawdown'], 'percent')}
                            {testRevealed && test.maxDrawdown !== undefined ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                测试：{metricValue(test, ['maxDrawdown'], 'percent')}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {metricValue(validation, ['closedTradeCount', 'tradeCount'])}
                            {testRevealed &&
                            experiment.lockedCandidateIds?.includes(candidate.id) ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                测试：{metricValue(test, ['closedTradeCount', 'tradeCount'])}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant={adoptionBlock ? 'outline' : 'default'}>
                              {adoptionBlock ?? '可采纳'}
                            </Badge>
                            {testRevealed ? <ExperimentEvaluationNote metrics={test} /> : null}
                          </td>
                          <StickyTableActionCell className="px-3 py-3">
                            <div className="flex flex-col items-end gap-2">
                              <ExperimentRunLinks
                                className="justify-end"
                                runRefs={candidate.runRefs}
                              />
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
                                    </Link>
                                  }
                                  size="xs"
                                  variant="outline"
                                />
                              ) : null}
                              {!adoptionBlock && !candidate.adoptedStrategyVersionId ? (
                                <Button
                                  size="xs"
                                  disabled={writesDisabled}
                                  onClick={(event) => {
                                    adoptionTrigger.current = event.currentTarget;
                                    setReviewCandidate(candidate);
                                  }}
                                >
                                  审阅并采纳
                                </Button>
                              ) : null}
                            </div>
                          </StickyTableActionCell>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableContainer>
              {candidates.map((candidate) => (
                <ExperimentCandidateDiff key={candidate.id} candidate={candidate} />
              ))}
            </div>
          </section>
          {testRevealed && baselineTest.totalReturn !== undefined ? (
            <p className="text-xs text-muted-foreground">
              基线封存测试收益：
              <ExperimentReturnValue metrics={baselineTest} keys={['totalReturn']} />
            </p>
          ) : null}
        </TabsContent>
        <TabsContent value="runtime">
          <ExperimentRuntimeDetails experiment={experiment} attempts={attempts} />
        </TabsContent>
      </Tabs>
      <ExperimentAdoptionDialog
        open={reviewCandidate !== null}
        candidateNumber={reviewCandidate?.candidateNumber}
        context={adoptionContextQuery.data}
        loading={adoptionContextQuery.isPending}
        error={adoptionContextQuery.isError}
        submitting={adoptMutation.isPending}
        disabled={readFailed}
        acknowledgeExposure={reviewCandidate?.id !== finalizedCandidate?.id}
        onRetry={() => void adoptionContextQuery.refetch()}
        onConfirm={() => adoptMutation.mutate()}
        onClose={() => setReviewCandidate(null)}
        returnFocus={() => adoptionTrigger.current}
      />
    </div>
  );
}
