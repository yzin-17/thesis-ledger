import { ArrowLeft, LoaderCircle, Play, RefreshCw, X } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from '@/components/ui/progress';
import { formatDateTime } from '@/lib/date-display';
import { fetchStrategyBacktestGroups } from './strategy-optimization.api.js';
import {
  backtestExecutionSymbol,
  backtestIdentity,
  backtestTimeframe,
  deriveBacktestRerun,
  resolveBacktestVersion,
} from './strategy-backtest-detail.model.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import type { StrategyCenterTab } from './strategy-center.navigation.js';
import { useBacktestJobQuery } from './strategy.queries.js';
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
  onSourceTabChange,
}: {
  strategies: StrategyRecord[];
  strategiesLoading: boolean;
  busyAction: string | null;
  onRun: (job: BacktestJob) => void;
  onCancel: (job: BacktestJob) => void;
  onRetry: (job: BacktestJob) => void;
  onRerun: (request: RerunRequest) => void;
  onSourceTabChange: (tab: StrategyCenterTab) => void;
}) {
  const { jobId } = useParams();
  const jobQuery = useBacktestJobQuery(jobId ?? null);
  const groupQuery = useQuery({
    queryKey: ['desktop', 'strategy', 'backtest-group', jobId],
    queryFn: () => fetchStrategyBacktestGroups({ limit: 1, ...(jobId ? { jobId } : {}) }),
    enabled: Boolean(jobId),
    staleTime: 10_000,
  });

  if (!jobId) return <NavigateBackMessage message="回测任务 ID 缺失。" />;
  if (jobQuery.isPending) {
    return (
      <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        正在读取回测任务
      </div>
    );
  }
  if (jobQuery.isError || !jobQuery.data) {
    return (
      <div className="space-y-4">
        <NavigateBackMessage message="回测任务不存在或暂时无法读取。" />
        <Button variant="outline" onClick={() => void jobQuery.refetch()}>
          <RefreshCw />
          重试
        </Button>
      </div>
    );
  }

  const job = jobQuery.data;
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
  const periodStart = job.period?.start ?? job.periodStart;
  const periodEnd = job.period?.end ?? job.periodEnd;
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

  return (
    <div className="space-y-5">
      <Button
        nativeButton={false}
        variant="ghost"
        size="sm"
        render={
          <Link to={strategyCenterPath.jobs}>
            <ArrowLeft />
            返回回测任务
          </Link>
        }
      />
      <header className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{identity.title}</h2>
              <Badge variant={jobStatusVariant(job.status)}>
                {job.cancelRequestedAt ? '正在取消' : jobStatusLabel(job.status)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{identity.subtitle}</p>
            <p className="mt-3 text-sm">
              {symbol ?? '执行标的未记录'} · {timeframe ?? '周期未记录'} ·{' '}
              {periodStart && periodEnd ? `${periodStart} 至 ${periodEnd}` : '区间未记录'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sourcePath && (
              <Button
                nativeButton={false}
                size="sm"
                variant="outline"
                render={
                  <Link
                    to={sourcePath}
                    onClick={() =>
                      onSourceTabChange(
                        identity.sourceKind === 'experiment' ? 'experiments' : 'library',
                      )
                    }
                  >
                    查看来源
                  </Link>
                }
              />
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!rerun.setup || !exact || rerunMissing.length > 0}
              title={rerunMissing.length > 0 ? `缺少：${rerunMissing.join('、')}` : undefined}
              onClick={() => {
                if (rerun.setup && exact)
                  onRerun({
                    job,
                    strategy: exact.strategy,
                    version: exact.version,
                    setup: rerun.setup,
                  });
              }}
            >
              <RefreshCw />
              再次运行
            </Button>
            {job.status === 'queued' && (
              <Button size="sm" disabled={busyAction !== null} onClick={() => onRun(job)}>
                <Play />
                启动任务
              </Button>
            )}
            {!terminal && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busyAction !== null}
                onClick={() => onCancel(job)}
              >
                <X />
                取消
              </Button>
            )}
            {job.mode === 'V2' && job.status === 'failed' && (
              <Button size="sm" disabled={busyAction !== null} onClick={() => onRetry(job)}>
                <Play />
                重试执行
              </Button>
            )}
          </div>
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
        {rerunMissing.length > 0 && (
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
      {job.status === 'failed' && (
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
      <StrategyBacktestResultTabs job={job} />
    </div>
  );
}

function NavigateBackMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button
        className="mt-4"
        variant="outline"
        render={<Link to={strategyCenterPath.jobs}>返回回测任务</Link>}
      />
    </div>
  );
}
