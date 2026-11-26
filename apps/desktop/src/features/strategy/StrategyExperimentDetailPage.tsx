import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingState } from '@/components/ui/spinner';
import { TableContainer, TableHead, TableHeader } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { optimizationExperimentInstrumentLabel } from '@thesis-ledger/schemas';
import { ArrowLeft, CheckCircle2, FlaskConical, MoreHorizontal, RotateCcw } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import { ExperimentAdoptionDialog } from './ExperimentAdoptionDialog.js';
import { ExperimentEvaluationNote } from './ExperimentEvaluationNote.js';
import { ExperimentFailureNotice } from './ExperimentFailureNotice.js';
import { ExperimentReturnValue } from './ExperimentReturnValue.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import {
  candidateAdoptionEligibility,
  candidateDiffSummary,
  candidateMetric,
  experimentStageLabels,
  findStrategyVersion,
  metricValue,
  strategyVersionLabel,
} from './strategy-experiment-detail.model.js';
import type { StrategyRecord } from './strategy.types.js';
import {
  ExperimentCandidateDiff,
  ExperimentRunLinks,
  ExperimentRuntimeDetails,
} from './StrategyExperimentDetailSections.js';
import { useStrategyExperimentDetailPage } from './useExperimentDetailPage.js';

export function StrategyExperimentDetailPage(props: { strategies: StrategyRecord[] }) {
  const { experimentId } = useParams();
  return <ExperimentDetailScope key={experimentId} {...props} />;
}

function ExperimentDetailScope(props: { strategies: StrategyRecord[] }) {
  const control = useStrategyExperimentDetailPage(props);
  const {
    readFailed,
    writeReceipt,
    detailQuery,
    compareQuery,
    experiment,
    writesDisabled,
    cancelMutation,
    retryRequired,
    invalidate,
    displayedAdoptedVersion,
    view,
    searchParams,
    setSearchParams,
    testRevealed,
    finalizeMutation,
    adoptionTrigger,
    setReviewCandidate,
    baselineTest,
    attempts,
    reviewCandidate,
    adoptionContextQuery,
    adoptMutation,
    finalizedCandidate,
  } = control;
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
      <ExperimentDetailIdentity control={{ ...control, experiment }} />

      {(experiment.stopReason || experiment.status === 'failed') && !retryRequired ? (
        <ExperimentFailureNotice
          experiment={experiment}
          disabled={writesDisabled}
          onRetried={invalidate}
        />
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
          {!testRevealed &&
          (['testing', 'awaiting_finalization'].includes(experiment.stage) || retryRequired) ? (
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
          <ExperimentCandidateComparison control={{ ...control, experiment }} />
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

function ExperimentDetailIdentity({
  control,
}: {
  control: ReturnType<typeof useStrategyExperimentDetailPage> & {
    experiment: NonNullable<ReturnType<typeof useStrategyExperimentDetailPage>['experiment']>;
  };
}) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">策略中心 / AI 实验</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{control.experiment.name}</h2>
            <Badge variant="outline">
              {experimentStageLabels[control.experiment.stage] ?? control.experiment.stage}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {optimizationExperimentInstrumentLabel(control.experiment) && (
              <span className="text-foreground">
                {optimizationExperimentInstrumentLabel(control.experiment)}
              </span>
            )}
            <span className="inline-flex flex-wrap items-baseline gap-1">
              <span>基线：</span>
              {control.baseline ? (
                <Link
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  to={strategyCenterPath.strategyVersion(
                    control.baseline.strategy.id,
                    control.baseline.version.id,
                  )}
                >
                  {control.baseline.strategy.name} {strategyVersionLabel(control.baseline.version)}
                </Link>
              ) : (
                <span>
                  {control.experiment.sourceMode === 'discovery' ? '从零探索' : '基线版本不可用'}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="contents">
          {control.clonedExperimentId ? (
            <Link
              to={strategyCenterPath.experiment(control.clonedExperimentId)}
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
              <DropdownMenuItem
                disabled={control.writesDisabled}
                onClick={() => control.cloneMutation.mutate()}
              >
                克隆实验
              </DropdownMenuItem>
              {control.active ? (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={control.writesDisabled}
                  onClick={() => control.cancelMutation.mutate()}
                >
                  取消实验
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}

function ExperimentCandidateComparison({
  control,
}: {
  control: ReturnType<typeof useStrategyExperimentDetailPage> & {
    experiment: NonNullable<ReturnType<typeof useStrategyExperimentDetailPage>['experiment']>;
  };
}) {
  return (
    <>
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
            refreshing={control.compareQuery.isRefetching || control.detailQuery.isRefetching}
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
                    基线 {control.baseline ? strategyVersionLabel(control.baseline.version) : ''}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">固定对照</td>
                  <td className="px-3 py-3 text-right">
                    <ExperimentReturnValue metrics={control.baselineValidation} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    {metricValue(control.baselineValidation, ['maxDrawdown'], 'percent')}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {metricValue(control.baselineValidation, ['closedTradeCount', 'tradeCount'])}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline">对照</Badge>
                  </td>
                  <StickyTableActionCell className="px-3 py-3">
                    <ExperimentRunLinks
                      className="justify-end"
                      runRefs={control.compare?.baseline.runRefs ?? {}}
                    />
                  </StickyTableActionCell>
                </tr>
                {control.candidates.map((candidate) => {
                  const validation = candidateMetric(candidate, 'validation');
                  const test = candidateMetric(candidate, 'test');
                  const adoptionBlock = candidateAdoptionEligibility(control.experiment, candidate);
                  const candidateAdoptedVersion = candidate.adoptedStrategyVersionId
                    ? findStrategyVersion(control.strategies, candidate.adoptedStrategyVersionId)
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
                        {control.testRevealed && test.totalReturn !== undefined ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            测试：
                            <ExperimentReturnValue metrics={test} keys={['totalReturn']} />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {metricValue(validation, ['maxDrawdown'], 'percent')}
                        {control.testRevealed && test.maxDrawdown !== undefined ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            测试：{metricValue(test, ['maxDrawdown'], 'percent')}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {metricValue(validation, ['closedTradeCount', 'tradeCount'])}
                        {control.testRevealed &&
                        control.experiment.lockedCandidateIds?.includes(candidate.id) ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            测试：{metricValue(test, ['closedTradeCount', 'tradeCount'])}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={adoptionBlock ? 'outline' : 'default'}>
                          {adoptionBlock ?? '可采纳'}
                        </Badge>
                        {control.testRevealed ? <ExperimentEvaluationNote metrics={test} /> : null}
                      </td>
                      <StickyTableActionCell className="px-3 py-3">
                        <div className="flex flex-col items-end gap-2">
                          <ExperimentRunLinks className="justify-end" runRefs={candidate.runRefs} />
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
                              disabled={control.writesDisabled}
                              onClick={(event) => {
                                control.adoptionTrigger.current = event.currentTarget;
                                control.setReviewCandidate(candidate);
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
          {control.candidates.map((candidate) => (
            <ExperimentCandidateDiff key={candidate.id} candidate={candidate} />
          ))}
        </div>
      </section>
    </>
  );
}
