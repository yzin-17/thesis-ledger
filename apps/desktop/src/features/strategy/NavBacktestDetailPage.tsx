import { Link, useNavigate, useParams } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import { NavBacktestResult } from './NavBacktestResult.js';
import {
  useCancelNavBacktestMutation,
  useNavBacktestRunQuery,
  useRetryNavBacktestMutation,
} from './strategy.nav.queries.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import type { StrategyRecord } from './strategy.types.js';

export function NavBacktestDetailPage({ strategies }: { strategies: StrategyRecord[] }) {
  const { runId } = useParams();
  const navigate = useNavigate();
  const query = useNavBacktestRunQuery(runId ?? null);
  const cancelMutation = useCancelNavBacktestMutation();
  const retryMutation = useRetryNavBacktestMutation();
  if (query.isPending) return <LoadingNavRun />;
  if (query.error)
    return (
      <NavRunReadError
        error={query.error}
        fetching={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data) return <MissingNavRun />;

  const run = query.data;
  return (
    <NavBacktestRunContent
      run={run}
      strategies={strategies}
      cancelPending={cancelMutation.isPending}
      retryPending={retryMutation.isPending}
      cancelError={cancelMutation.error}
      retryError={retryMutation.error}
      onCancel={() => cancelMutation.mutate(run.id)}
      onRetry={() =>
        retryMutation.mutate(run.id, {
          onSuccess: (retried) => {
            if (retried.id !== run.id) {
              void navigate(strategyCenterPath.navBacktestRun(retried.id), { replace: true });
            }
          },
        })
      }
    />
  );
}

function LoadingNavRun() {
  return (
    <div
      className="rounded-lg border p-6 text-sm text-muted-foreground"
      aria-label="正在读取 NAV 运行"
    >
      正在读取基金净值回测任务…
    </div>
  );
}

function NavRunReadError({
  error,
  fetching,
  onRetry,
}: {
  error: unknown;
  fetching: boolean;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>无法读取基金净值回测任务</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{errorText(error, '请确认任务编号有效，并检查服务连接。')}</p>
        <Button type="button" variant="outline" disabled={fetching} onClick={onRetry}>
          {fetching ? '正在重试…' : '重新读取'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function MissingNavRun() {
  return (
    <Alert variant="destructive">
      <AlertTitle>没有找到基金净值回测任务</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>请从 NAV 任务历史重新打开记录，或返回策略版本重新创建任务。</p>
        <Button
          nativeButton={false}
          render={<Link to={strategyCenterPath.navBacktestJobs}>返回 NAV 任务</Link>}
          variant="outline"
        />
      </AlertDescription>
    </Alert>
  );
}

function NavBacktestRunContent({
  run,
  strategies,
  cancelPending,
  retryPending,
  cancelError,
  retryError,
  onCancel,
  onRetry,
}: {
  run: NonNullable<ReturnType<typeof useNavBacktestRunQuery>['data']>;
  strategies: StrategyRecord[];
  cancelPending: boolean;
  retryPending: boolean;
  cancelError: unknown;
  retryError: unknown;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const sourceStrategy = strategies.find((strategy) =>
    strategy.versions.some((version) => version.id === run.strategyVersionId),
  );
  const sourceVersion = sourceStrategy?.versions.find(
    (version) => version.id === run.strategyVersionId,
  );
  return (
    <div className="flex flex-col gap-4">
      <NavRunHeader
        run={run}
        sourceStrategy={sourceStrategy ?? null}
        sourceVersion={sourceVersion ?? null}
        cancelPending={cancelPending}
        retryPending={retryPending}
        onCancel={onCancel}
        onRetry={onRetry}
      />
      <NavRunStatusCard run={run} />
      <NavRunMessages run={run} cancelError={cancelError} retryError={retryError} />
      <NavRunResult run={run} />
    </div>
  );
}

function NavRunHeader({
  run,
  sourceStrategy,
  sourceVersion,
  cancelPending,
  retryPending,
  onCancel,
  onRetry,
}: {
  run: NonNullable<ReturnType<typeof useNavBacktestRunQuery>['data']>;
  sourceStrategy: StrategyRecord | null;
  sourceVersion: StrategyRecord['versions'][number] | null;
  cancelPending: boolean;
  retryPending: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const symbol = run.result?.executionSymbol ?? run.runConfig.navInput.symbol;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">基金净值回测任务</h2>
          <Badge variant={run.status === 'failed' ? 'destructive' : 'secondary'}>
            {statusLabel(run.status)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {symbol} · {formatDateOnly(run.periodStart)} 至 {formatDateOnly(run.periodEnd)} ·{' '}
          {sourceStrategy && sourceVersion
            ? `${sourceStrategy.name} v${sourceVersion.version}`
            : '策略版本信息暂不可用'}
        </p>
      </div>
      <NavRunActions
        run={run}
        sourceStrategy={sourceStrategy}
        sourceVersion={sourceVersion}
        actionPending={cancelPending || retryPending}
        cancelPending={cancelPending}
        retryPending={retryPending}
        onCancel={onCancel}
        onRetry={onRetry}
      />
    </div>
  );
}

function NavRunActions({
  run,
  sourceStrategy,
  sourceVersion,
  actionPending,
  cancelPending,
  retryPending,
  onCancel,
  onRetry,
}: {
  run: NonNullable<ReturnType<typeof useNavBacktestRunQuery>['data']>;
  sourceStrategy: StrategyRecord | null;
  sourceVersion: StrategyRecord['versions'][number] | null;
  actionPending: boolean;
  cancelPending: boolean;
  retryPending: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const cancellable = run.status === 'queued' || run.status === 'running';
  const retryable = run.status === 'failed';
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        nativeButton={false}
        render={<Link to={strategyCenterPath.navBacktestJobs}>NAV 任务历史</Link>}
        variant="outline"
      />
      {sourceStrategy && sourceVersion ? (
        <Button
          nativeButton={false}
          render={
            <Link to={strategyCenterPath.strategyVersion(sourceStrategy.id, sourceVersion.id)}>
              来源策略版本
            </Link>
          }
          variant="outline"
        />
      ) : null}
      {cancellable ? (
        <Button type="button" variant="destructive" disabled={actionPending} onClick={onCancel}>
          {cancelPending ? '正在取消…' : '取消任务'}
        </Button>
      ) : null}
      {retryable ? (
        <Button type="button" disabled={actionPending} onClick={onRetry}>
          {retryPending ? '正在重试…' : '重试 NAV 任务'}
        </Button>
      ) : null}
    </div>
  );
}

function NavRunStatusCard({
  run,
}: {
  run: NonNullable<ReturnType<typeof useNavBacktestRunQuery>['data']>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">运行状态</CardTitle>
        <CardDescription>运行期间自动刷新，完成后可查看结果与研究假设。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>当前阶段：{stageLabel(run.stage)}</span>
          <span>{run.progress}%</span>
        </div>
        <progress
          className="h-2 w-full accent-primary"
          aria-label="NAV 任务进度"
          value={run.progress}
          max={100}
        />
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">创建时间</dt>
            <dd className="mt-1">{formatDateTime(run.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">最近更新</dt>
            <dd className="mt-1">{formatDateTime(run.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">执行次数</dt>
            <dd className="mt-1">第 {run.executionAttempt} 次</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function NavRunMessages({
  run,
  cancelError,
  retryError,
}: {
  run: NonNullable<ReturnType<typeof useNavBacktestRunQuery>['data']>;
  cancelError: unknown;
  retryError: unknown;
}) {
  return (
    <>
      {run.errorCode || run.errorSummary ? (
        <ErrorAlert
          title="任务运行提示"
          message={run.errorSummary ?? '任务未能完成，请重新读取任务或从历史中重试。'}
        />
      ) : null}
      {cancelError ? (
        <ErrorAlert
          title="取消任务失败"
          message={errorText(cancelError, '请重新读取任务状态后再试。')}
        />
      ) : null}
      {retryError ? (
        <ErrorAlert
          title="重试任务失败"
          message={errorText(retryError, '请重新读取任务状态后再试。')}
        />
      ) : null}
    </>
  );
}

function ErrorAlert({ title, message }: { title: string; message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function NavRunResult({
  run,
}: {
  run: NonNullable<ReturnType<typeof useNavBacktestRunQuery>['data']>;
}) {
  if (run.status !== 'succeeded') return null;
  if (run.result) return <NavBacktestResult result={run.result} />;
  return <ErrorAlert title="NAV 任务结果暂不可用" message="请重新读取任务，稍后再查看完整结果。" />;
}

function statusLabel(status: string) {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '运行中';
  if (status === 'succeeded') return '已完成';
  if (status === 'failed') return '失败';
  if (status === 'cancelled') return '已取消';
  return '状态未知';
}

function stageLabel(stage: string | null) {
  if (!stage) return '等待任务启动';
  if (stage === 'queued') return '等待执行';
  if (stage === 'loading-snapshot') return '准备运行数据';
  if (stage === 'executing') return '模拟申购与赎回';
  if (stage === 'persisting-result') return '保存结果';
  if (stage === 'completed') return '已完成';
  return '执行阶段已更新';
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
