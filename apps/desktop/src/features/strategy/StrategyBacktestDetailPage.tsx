import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, LoaderCircle, Play, RefreshCw, X } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { backtestPreparationFailureInputSchema } from '@thesis-ledger/schemas';
import { BacktestPreparationFailureDetails } from './BacktestPreparationFailureDetails.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from '@/components/ui/progress';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import { fetchStrategyBacktestGroups } from './strategy-optimization.api.js';
import {
  backtestExecutionSymbol,
  backtestIdentity,
  backtestTimeframe,
  deriveBacktestRerun,
  resolveBacktestVersion,
} from './strategy-backtest-detail.model.js';
import { backtestDetailReturnTarget, strategyCenterPath } from './strategy-center.navigation.js';
import { useBacktestJobQuery, useBacktestInstrumentSeriesQuery } from './strategy.queries.js';
import { StrategyBacktestResultTabs } from './StrategyBacktestDetailSections.js';
import { backtestStageLabel, jobStatusLabel, jobStatusVariant } from './StrategySections.js';
import type {
  BacktestJob,
  BacktestSetupInput,
  StrategyRecord,
  StrategyVersion,
} from './strategy.types.js';

type RerunRequest = {
  job: BacktestJob;
  strategy: StrategyRecord;
  version: StrategyVersion;
  setup: BacktestSetupInput;
};

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled']);

export function StrategyBacktestDetailPage({
  strategies,
  strategiesLoading,
  busyAction,
  onRun,
  onCancel,
  onRetry,
  onRerun,
}: {
  strategies: StrategyRecord[];
  strategiesLoading: boolean;
  busyAction: string | null;
  onRun: (job: BacktestJob) => void;
  onCancel: (job: BacktestJob) => void;
  onRetry: (job: BacktestJob) => void;
  onRerun: (request: RerunRequest) => void;
}) {
  const { jobId } = useParams();
  const { path: returnPath, label: returnLabel } = backtestDetailReturnTarget(useLocation().state);
  const jobQuery = useBacktestJobQuery(jobId ?? null);
  const instrumentQuery = useBacktestInstrumentSeriesQuery(
    jobId ?? null,
    jobQuery.data?.snapshotId,
    jobQuery.data?.readEligibility?.state === 'readable' && Boolean(jobQuery.data.result),
  );
  const groupQuery = useBacktestGroupQuery(jobId);

  if (!jobId)
    return (
      <NavigateBackMessage
        message="回测任务 ID 缺失。"
        returnPath={returnPath}
        returnLabel={returnLabel}
      />
    );
  if (jobQuery.isPending) {
    return (
      <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        正在读取回测任务
      </div>
    );
  }
  if (jobQuery.isError || !jobQuery.data) {
    let message = '回测任务不存在或暂时无法读取。';
    if (jobQuery.error instanceof ThesisLedgerApiError && jobQuery.error.status === 409)
      message = '当前回测格式不受支持或冻结记录校验未通过，无法读取此任务。';
    return (
      <div className="space-y-4">
        <NavigateBackMessage message={message} returnPath={returnPath} returnLabel={returnLabel} />
        <Button variant="outline" onClick={() => void jobQuery.refetch()}>
          <RefreshCw />
          重试
        </Button>
      </div>
    );
  }

  return (
    <ResolvedBacktestDetail
      strategies={strategies}
      strategiesLoading={strategiesLoading}
      busyAction={busyAction}
      onRun={onRun}
      onCancel={onCancel}
      onRetry={onRetry}
      onRerun={onRerun}
      job={jobQuery.data}
      jobQuery={jobQuery}
      groupQuery={groupQuery}
      instrumentQuery={instrumentQuery}
      returnPath={returnPath}
      returnLabel={returnLabel}
    />
  );
}

function NavigateBackMessage({
  message,
  returnPath,
  returnLabel,
}: {
  message: string;
  returnPath: string;
  returnLabel: string;
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button
        nativeButton={false}
        className="mt-4"
        variant="outline"
        render={<Link to={returnPath}>{returnLabel}</Link>}
      />
    </div>
  );
}

function ResolvedBacktestDetail(
  props: Parameters<typeof StrategyBacktestDetailPage>[0] & {
    job: BacktestJob;
    jobQuery: ReturnType<typeof useBacktestJobQuery>;
    instrumentQuery: ReturnType<typeof useBacktestInstrumentSeriesQuery>;
    groupQuery: ReturnType<typeof useBacktestGroupQuery>;
    returnPath: string;
    returnLabel: string;
  },
) {
  const control = useResolvedBacktestDetail(props);
  const {
    returnPath,
    returnLabel,
    identity,
    job,
    symbol,
    timeframe,
    periodLabel,
    preparationFailure,
    rerunMissing,
    terminal,
    stateMessage,
    progress,
    groupQuery,
    instrumentQuery,
    jobQuery,
  } = control;

  return (
    <div className="space-y-5">
      <Button
        nativeButton={false}
        variant="ghost"
        size="sm"
        render={
          <Link to={returnPath}>
            <ArrowLeft />
            {returnLabel}
          </Link>
        }
      />
      <header className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-xl font-semibold tracking-tight">{identity.title}</h2>
              <Badge variant={jobStatusVariant(job.status)}>
                {jobStatusLabel(job.status, job.cancelRequestedAt)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{identity.subtitle}</p>
            {job.replayOfRunId && <Link className="text-sm underline underline-offset-4" to={strategyCenterPath.job(job.replayOfRunId)}>查看原冻结输入Run</Link>}
            <p className="mt-3 text-sm">
              {symbol ?? '执行标的未记录'} · {timeframe ?? '周期未记录'} · {periodLabel}
            </p>
          </div>
          <BacktestDetailActions control={control} />
        </div>
        <div className="flex flex-col gap-2 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{stateMessage}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              创建于 {formatDateTime(job.createdAt)}
              {job.finishedAt ? `，完成于 ${formatDateTime(job.finishedAt)}` : ''}
            </p>
          </div>
          {!terminal && progress !== null && (
            <Progress value={progress} className="w-full sm:w-56">
              <ProgressLabel>{progress}%</ProgressLabel>
              <ProgressTrack>
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          )}
        </div>
        {!preparationFailure && rerunMissing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            再次运行不可用：缺少 {rerunMissing.join('、')}。不会用当前默认配置替代历史配置。
          </p>
        )}
      </header>

      {groupQuery.isError && (
        <Alert>
          <AlertTitle>来源元信息读取失败</AlertTitle>
          <AlertDescription>
            结果与执行状态仍可查看。可单独重试来源解析，不会把请求错误解释为历史来源缺失。
            <Button
              className="ml-2"
              size="sm"
              variant="outline"
              onClick={() => void groupQuery.refetch()}
            >
              重试来源解析
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {preparationFailure && <BacktestPreparationFailureDetails job={job} />}
      {!preparationFailure && job.status === 'failed' && (
        <Alert variant="destructive">
          <AlertTitle>
            {job.errorCode?.toLowerCase().includes('timeout') ? '任务超时' : '任务失败'}
          </AlertTitle>
          <AlertDescription>
            {job.errorSummary ?? '服务端未提供可读失败原因。'}
            {job.stage ? ` 失败阶段：${backtestStageLabel(job.stage)}。` : ''}
          </AlertDescription>
        </Alert>
      )}
      {!preparationFailure && (
        <StrategyBacktestResultTabs
          job={job}
          instrumentRequest={{
            data: instrumentQuery.data,
            fetching: jobQuery.isFetching || instrumentQuery.isFetching,
            error: instrumentQuery.isError,
          }}
        />
      )}
    </div>
  );
}

function useBacktestGroupQuery(jobId: string | undefined) {
  return useQuery({
    queryKey: ['desktop', 'strategy', 'backtest-group', jobId],
    queryFn: () => fetchStrategyBacktestGroups({ limit: 1, ...(jobId ? { jobId } : {}) }),
    enabled: Boolean(jobId),
    staleTime: 10_000,
  });
}

function useResolvedBacktestDetail({
  strategies,
  strategiesLoading,
  busyAction,
  onRun,
  onCancel,
  onRetry,
  onRerun,
  job,
  jobQuery,
  groupQuery,
  instrumentQuery,
  returnPath,
  returnLabel,
}: Parameters<typeof StrategyBacktestDetailPage>[0] & {
  job: BacktestJob;
  jobQuery: ReturnType<typeof useBacktestJobQuery>;
  instrumentQuery: ReturnType<typeof useBacktestInstrumentSeriesQuery>;
  groupQuery: ReturnType<typeof useBacktestGroupQuery>;
  returnPath: string;
  returnLabel: string;
}) {
  const preparationFailure = backtestPreparationFailureInputSchema.safeParse(job.input).success;
  const group =
    groupQuery.data?.items.find((candidate) =>
      candidate.jobs.some((candidateJob) => candidateJob.id === job.id),
    ) ?? null;
  const exact = resolveBacktestVersion(strategies, job.strategyVersionId);
  const resolvingIdentity = strategiesLoading || groupQuery.isPending;
  const identity = resolvingIdentity
    ? {
        title: '正在解析来源',
        subtitle: '正在读取冻结的版本或实验关联',
        sourceKind: 'unknown' as const,
        sourceId: null,
      }
    : backtestIdentity(job, strategies, group);
  const rerun = deriveBacktestRerun(job);
  const rerunMissing = [...rerun.missing];
  if (!exact) rerunMissing.push('原策略版本');
  const { periodLabel } = backtestPeriodLabel(job);
  const progress =
    typeof job.progress === 'number' ? Math.max(0, Math.min(100, job.progress)) : null;
  const terminal = terminalStatuses.has(job.status);
  const symbol = backtestExecutionSymbol(job, exact?.version ?? null);
  const timeframe = backtestTimeframe(job, exact?.version ?? null);
  let stateMessage = '任务正在等待执行资源。';
  if (job.status === 'running') stateMessage = `当前阶段：${backtestStageLabel(job.stage)}`;
  else if (job.status === 'failed')
    stateMessage = job.errorSummary ?? '任务执行失败，请查看诊断信息。';
  else if (job.status === 'cancelled') stateMessage = '任务已取消，执行记录仍可查看。';
  else if (job.status === 'succeeded') stateMessage = '任务结果已保存。';

  let sourcePath: string | null = null;
  if (identity.sourceKind === 'experiment' && identity.sourceId) {
    sourcePath = strategyCenterPath.experiment(identity.sourceId);
  } else if (exact) {
    sourcePath = strategyCenterPath.strategyVersion(exact.strategy.id, exact.version.id);
  }

  return {
    returnPath,
    returnLabel,
    identity,
    job,
    symbol,
    timeframe,
    periodLabel,
    sourcePath,
    preparationFailure,
    rerun,
    exact,
    rerunMissing,
    onRerun,
    busyAction,
    onRun,
    terminal,
    onCancel,
    onRetry,
    stateMessage,
    progress,
    groupQuery,
    instrumentQuery,
    jobQuery,
  };
}

function BacktestDetailActions({
  control,
}: {
  control: ReturnType<typeof useResolvedBacktestDetail>;
}) {
  return (
    <>
      <div className="flex shrink-0 flex-wrap gap-2">
        {control.sourcePath && (
          <Button
            nativeButton={false}
            size="sm"
            variant="outline"
            render={<Link to={control.sourcePath}>查看来源</Link>}
          />
        )}
        {!control.preparationFailure && (
          <Button
            size="sm"
            variant="outline"
            disabled={!control.rerun.setup || !control.exact || control.rerunMissing.length > 0}
            title={
              control.rerunMissing.length > 0
                ? `缺少：${control.rerunMissing.join('、')}`
                : undefined
            }
            onClick={() => {
              if (control.rerun.setup && control.exact)
                control.onRerun({
                  job: control.job,
                  strategy: control.exact.strategy,
                  version: control.exact.version,
                  setup: control.rerun.setup,
                });
            }}
          >
            <RefreshCw />
            再次运行
          </Button>
        )}
        {control.job.status === 'queued' && (
          <Button
            size="sm"
            disabled={control.busyAction !== null || Boolean(control.job.cancelRequestedAt)}
            aria-busy={control.busyAction === `run:${control.job.id}`}
            onClick={() => control.onRun(control.job)}
          >
            {control.busyAction === `run:${control.job.id}` ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <Play />
            )}
            启动任务
          </Button>
        )}
        {!control.terminal && (
          <Button
            size="sm"
            variant="ghost"
            disabled={control.busyAction !== null || Boolean(control.job.cancelRequestedAt)}
            aria-busy={control.busyAction === `cancel:${control.job.id}`}
            onClick={() => control.onCancel(control.job)}
          >
            {control.busyAction === `cancel:${control.job.id}` ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <X />
            )}
            取消
          </Button>
        )}
        {!control.preparationFailure &&
          control.job.mode === 'frozen' &&
          ['failed', 'succeeded'].includes(control.job.status) && (
            <Button
              size="sm"
              disabled={control.busyAction !== null}
              aria-busy={control.busyAction === `retry:${control.job.id}`}
              onClick={() => control.onRetry(control.job)}
            >
              {control.busyAction === `retry:${control.job.id}` ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Play />
              )}
              使用冻结输入重试
            </Button>
          )}
      </div>
    </>
  );
}
function backtestPeriodLabel(job: BacktestJob) {
  const periodStart = job.period?.start ?? job.periodStart;
  const periodEnd = job.period?.end ?? job.periodEnd;
  const periodLabel =
    periodStart && periodEnd
      ? `${formatDateOnly(periodStart)} 至 ${formatDateOnly(periodEnd)}`
      : '区间未记录';
  return { periodLabel };
}
