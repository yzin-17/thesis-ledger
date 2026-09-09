export {
  BacktestSetupDialog,
  defaultBacktestPeriod,
  backtestPeriodPresets,
} from './BacktestSetupDialog.js';
import { useMemo, useState } from 'react';
import { Eye, LoaderCircle, Play, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyListState, EmptyTableRow } from '../shared/EmptyStates.js';
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { money, displayValue, isDataLoaded } from '../shared/display.js';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import { Metric } from '../shared/DesktopPrimitives.js';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import { schemaAsOf, schemaSymbols, latestVersion } from './strategy.schema.js';
import type {
  BacktestJob,
  BacktestJobSummary,
  StrategyRecord,
  StrategyVersion,
} from './strategy.types.js';

export const jobStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    queued: '排队中',
    running: '运行中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return labels[status] ?? `未知状态（${status}）`;
};

export const jobStatusVariant = (
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'succeeded') return 'secondary';
  if (status === 'failed') return 'destructive';
  if (status === 'running') return 'secondary';
  return 'outline';
};

export const formatBacktestDataAsOf = (value: unknown) =>
  typeof value === 'string' ? formatDateTime(value, '未知') : '未知';

const backtestWarningKey = (value: string) => value.trim().replace(/[。；;]+$/u, '');

export const uniqueBacktestWarnings = (...values: unknown[]) => {
  const warnings = values.flatMap((value) => (Array.isArray(value) ? value.map(String) : []));
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = backtestWarningKey(warning);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const strategyStatusLabel = (status: unknown) => {
  if (status === 'active') return '启用';
  if (status === 'archived') return '归档';
  if (status === 'draft') return '草稿';
  return '未知状态';
};

const strategyStatusVariant = (status: unknown): 'default' | 'secondary' | 'outline' => {
  if (status === 'active') return 'default';
  if (status === 'archived') return 'outline';
  if (status === 'draft') return 'secondary';
  return 'outline';
};

const backtestJobInput = (job: BacktestJobSummary | BacktestJob) => {
  const candidate: unknown = 'input' in job ? job.input : null;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return candidate as Record<string, unknown>;
};

const jobPeriod = (job: BacktestJobSummary) => {
  if (job.period)
    return {
      start: formatDateOnly(job.period.start),
      end: formatDateOnly(job.period.end),
    };
  if (job.periodStart || job.periodEnd)
    return {
      start: formatDateOnly(job.periodStart),
      end: formatDateOnly(job.periodEnd),
    };
  const input = backtestJobInput(job);
  const inputPeriod = input?.period;
  if (inputPeriod && typeof inputPeriod === 'object' && !Array.isArray(inputPeriod)) {
    const period = inputPeriod as { start?: unknown; end?: unknown };
    return {
      start: typeof period.start === 'string' ? formatDateOnly(period.start) : '—',
      end: typeof period.end === 'string' ? formatDateOnly(period.end) : '—',
    };
  }
  return { start: '—', end: '—' };
};

const jobCash = (job: BacktestJobSummary) => {
  if (typeof job.initialCash === 'number') return money.format(job.initialCash);
  const input = backtestJobInput(job);
  const value = input?.initialCash;
  return typeof value === 'number' ? money.format(value) : '默认资金';
};

export function StrategyLibrary({
  strategies,
  jobs,
  loadState,
  busyAction,
  onCreate,
  onEdit,
  onBacktest,
}: {
  strategies: StrategyRecord[];
  jobs: BacktestJobSummary[];
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  busyAction: string | null;
  onCreate: () => void;
  onEdit: (strategy: StrategyRecord, version: StrategyVersion) => void;
  onBacktest: (strategy: StrategyRecord, version: StrategyVersion) => void;
}) {
  const [selectedVersionIds, setSelectedVersionIds] = useState<Record<string, string>>({});
  const sortedStrategies = useMemo(
    () =>
      [...strategies].sort((left, right) =>
        (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''),
      ),
    [strategies],
  );
  return (
    <section className="panel border-t-0" aria-labelledby="strategy-library-title">
      <div className="panel-heading flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="strategy-library-title">策略库</h2>
          <p>每次保存都会生成不可变的新版本；回测始终绑定到你选择的版本。</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">{strategies.length} 条策略</span>
          {sortedStrategies.length > 0 && (
            <Button type="button" size="sm" onClick={onCreate}>
              新建策略
            </Button>
          )}
        </div>
      </div>
      {isDataLoaded(loadState) && sortedStrategies.length === 0 ? (
        <EmptyListState
          title="还没有策略"
          description="创建第一条策略，开始记录可复现的交易假设。"
          actionLabel="创建第一条策略"
          onAction={onCreate}
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>策略</th>
                <th>最新版本</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>最近回测</th>
                <StickyTableActionHeader>操作</StickyTableActionHeader>
              </tr>
            </thead>
            <tbody>
              {sortedStrategies.map((strategy) => {
                const latest = latestVersion(strategy.versions);
                const selectedVersionId = selectedVersionIds[strategy.id] ?? latest?.id;
                const version =
                  strategy.versions.find((candidate) => candidate.id === selectedVersionId) ??
                  latest;
                const status = version?.schema?.status ?? strategy.status;
                const recentJob = jobs.find((job) => job.strategyVersionId === version?.id);
                const symbols = version?.schema ? schemaSymbols(version.schema) : [];
                const symbolSummary = `${symbols[0] ?? '未配置标的'}${
                  symbols.length > 1 ? ` 等 ${symbols.length} 个` : ''
                }`;
                const firstSymbol = symbols[0];
                const description = strategy.description?.trim();
                let strategySummary = symbolSummary;
                if (description) {
                  strategySummary =
                    firstSymbol && description.startsWith(firstSymbol)
                      ? description
                      : `${symbolSummary} · ${description}`;
                }
                return (
                  <tr key={strategy.id}>
                    <td className="min-w-0">
                      <strong className="max-w-80 truncate" title={strategy.name}>
                        {strategy.name}
                      </strong>
                      <span className="max-w-80 truncate" title={strategySummary}>
                        {strategySummary}
                      </span>
                    </td>
                    <td>
                      <strong>{version ? `v${version.version}` : '—'}</strong>
                      <span>
                        {version?.schema
                          ? formatDateTime(schemaAsOf(version.schema), '未知')
                          : '无 Schema'}
                      </span>
                      {strategy.versions.length > 1 && (
                        <Select
                          value={version?.id}
                          onValueChange={(value) =>
                            value &&
                            setSelectedVersionIds((current) => ({
                              ...current,
                              [strategy.id]: value,
                            }))
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className="mt-1 w-full"
                            aria-label="选择策略版本"
                          >
                            <SelectValue>已选 v{version?.version ?? '?'}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {[...strategy.versions]
                                .sort((left, right) => right.version - left.version)
                                .map((candidate) => (
                                  <SelectItem key={candidate.id} value={candidate.id}>
                                    v{candidate.version}
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td>
                      <Badge variant={strategyStatusVariant(status)}>
                        {strategyStatusLabel(status)}
                      </Badge>
                    </td>
                    <td>{formatDateTime(version?.createdAt ?? strategy.updatedAt)}</td>
                    <td>
                      {recentJob ? (
                        <>
                          <Badge variant={jobStatusVariant(recentJob.status)}>
                            {jobStatusLabel(recentJob.status)}
                          </Badge>
                          <span>{formatDateTime(recentJob.createdAt)}</span>
                        </>
                      ) : (
                        <span>暂无回测</span>
                      )}
                    </td>
                    <StickyTableActionCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!version || busyAction !== null}
                          onClick={() => version && onEdit(strategy, version)}
                        >
                          编辑版本
                        </Button>
                        <Button
                          size="sm"
                          disabled={!version || busyAction !== null}
                          aria-busy={busyAction === `queue:${version?.id}`}
                          onClick={() => version && onBacktest(strategy, version)}
                        >
                          {busyAction === `queue:${version?.id}` && (
                            <LoaderCircle
                              data-icon="inline-start"
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          )}
                          开始回测
                        </Button>
                      </div>
                    </StickyTableActionCell>
                  </tr>
                );
              })}
              {loadState === 'loading' && <EmptyTableRow colSpan={6} label="正在加载策略…" />}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function StrategyJobs({
  jobs,
  strategies,
  loadState,
  busyAction,
  onRun,
  onCancel,
  onViewResult,
  onOpenLibrary,
}: {
  jobs: BacktestJobSummary[];
  strategies: StrategyRecord[];
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  busyAction: string | null;
  onRun: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onViewResult: (job: BacktestJobSummary) => void;
  onOpenLibrary?: () => void;
}) {
  const strategyForJob = (job: BacktestJob) =>
    strategies.find((strategy) =>
      strategy.versions.some((version) => version.id === job.strategyVersionId),
    );
  const versionForJob = (job: BacktestJob) =>
    strategyForJob(job)?.versions.find((version) => version.id === job.strategyVersionId);
  return (
    <section className="panel border-t-0" aria-labelledby="strategy-jobs-title">
      <div className="panel-heading">
        <h2 id="strategy-jobs-title">回测任务</h2>
        <p>任务状态会自动刷新；排队失败或启动失败都保留在这里，方便重试。</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>任务</th>
              <th>区间 / 资金</th>
              <th>状态</th>
              <th>进度</th>
              <th>创建时间</th>
              <StickyTableActionHeader>操作</StickyTableActionHeader>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td className="p-0 text-center hover:bg-transparent" colSpan={6}>
                  {isDataLoaded(loadState) ? (
                    <div className="flex flex-col items-center gap-3 p-5">
                      <EmptyListState
                        title="还没有回测任务"
                        description="先选择策略版本发起回测，任务完成后结果会保存在这里。"
                      />
                      {onOpenLibrary && (
                        <Button type="button" variant="outline" onClick={onOpenLibrary}>
                          返回策略库
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="p-5 text-sm text-muted-foreground">正在加载任务…</div>
                  )}
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const strategy = strategyForJob(job);
                const version = versionForJob(job);
                const period = jobPeriod(job);
                const progress =
                  typeof job.progress === 'number' ? Math.max(0, Math.min(100, job.progress)) : 0;
                const terminal = ['succeeded', 'failed', 'cancelled'].includes(job.status);
                return (
                  <tr key={job.id}>
                    <td>
                      <strong>
                        {strategy
                          ? `${strategy.name} · v${version?.version ?? '?'}`
                          : `版本 ${job.strategyVersionId.slice(0, 8)}`}
                      </strong>
                    </td>
                    <td>
                      <strong>
                        {period.start} → {period.end}
                      </strong>
                      <span>{jobCash(job)}</span>
                    </td>
                    <td>
                      <Badge variant={jobStatusVariant(job.status)}>
                        {job.cancelRequestedAt ? '正在取消' : jobStatusLabel(job.status)}
                      </Badge>
                      {job.errorSummary && <span>{job.errorSummary}</span>}
                      {Array.isArray(job.warnings) && job.warnings.length > 0 && (
                        <span>{job.warnings.length} 条提示</span>
                      )}
                    </td>
                    <td>
                      {job.status === 'running' ? (
                        <Progress value={progress} className="min-w-28">
                          <ProgressLabel>{progress}%</ProgressLabel>
                          <ProgressTrack>
                            <ProgressIndicator />
                          </ProgressTrack>
                        </Progress>
                      ) : (
                        <span>{job.status === 'succeeded' ? '已完成' : '—'}</span>
                      )}
                    </td>
                    <td>{formatDateTime(job.createdAt)}</td>
                    <StickyTableActionCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        {job.status === 'queued' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyAction !== null}
                            aria-busy={busyAction === `run:${job.id}`}
                            onClick={() => onRun(job.id)}
                          >
                            <Play data-icon="inline-start" />
                            {busyAction === `run:${job.id}` ? '启动中…' : '重试运行'}
                          </Button>
                        )}
                        {!terminal && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyAction !== null}
                            aria-busy={busyAction === `cancel:${job.id}`}
                            onClick={() => onCancel(job.id)}
                          >
                            <X data-icon="inline-start" />
                            取消
                          </Button>
                        )}
                        {job.status === 'succeeded' && (
                          <Button size="sm" variant="ghost" onClick={() => onViewResult(job)}>
                            <Eye data-icon="inline-start" />
                            查看结果
                          </Button>
                        )}
                      </div>
                    </StickyTableActionCell>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StrategyResultDialog({
  job,
  strategy,
  version,
  open,
  onOpenChange,
}: {
  job: BacktestJob | null;
  strategy?: StrategyRecord | null;
  version?: StrategyVersion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const result =
    job?.result && typeof job.result === 'object' ? (job.result as Record<string, unknown>) : null;
  const metrics =
    result?.metrics && typeof result.metrics === 'object'
      ? (result.metrics as Record<string, unknown>)
      : null;
  const equityCurve = Array.isArray(result?.equityCurve)
    ? (result.equityCurve as Array<{ date: string; value: number }>)
    : [];
  const trades = Array.isArray(result?.trades)
    ? (result.trades as Array<Record<string, unknown>>)
    : [];
  const metricValue = (key: string) =>
    typeof metrics?.[key] === 'number' ? `${(metrics[key] * 100).toFixed(2)}%` : '不可用';
  const rejectedOrders = Array.isArray(result?.rejectedOrders) ? result.rejectedOrders : [];
  const totalFees =
    typeof metrics?.fees === 'number'
      ? metrics.fees
      : trades.reduce((sum, trade) => sum + (typeof trade.fees === 'number' ? trade.fees : 0), 0);
  const hasFeeData = typeof metrics?.fees === 'number' || trades.some((trade) => 'fees' in trade);
  const drawdown = equityCurve.map((point, index) => {
    const peak = Math.max(...equityCurve.slice(0, index + 1).map((item) => item.value));
    return { date: point.date, value: peak > 0 ? point.value / peak - 1 : 0 };
  });
  const warnings = uniqueBacktestWarnings(job?.warnings, result?.warnings);
  const benchmark =
    result?.benchmark && typeof result.benchmark === 'object'
      ? (result.benchmark as Record<string, unknown>)
      : null;
  const benchmarkValue = (key: string) =>
    typeof benchmark?.[key] === 'number' ? `${(benchmark[key] * 100).toFixed(2)}%` : '不可用';
  const seriesPoints = (series: Array<{ value: number }>) => {
    if (series.length === 0) return '';
    const values = series.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return series
      .map((point, index) => {
        const x = (index / Math.max(series.length - 1, 1)) * 100;
        const y = 100 - ((point.value - min) / span) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-48px)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-4xl">
        <DialogHeader className="pr-10">
          <DialogTitle>
            回测结果 · {strategy?.name ?? '未知策略'} · v{version?.version ?? '?'}
          </DialogTitle>
          <DialogDescription>
            标的：{version?.schema ? (schemaSymbols(version.schema)[0] ?? '不可用') : '不可用'} ·
            区间：
            {job ? `${jobPeriod(job).start} 至 ${jobPeriod(job).end}` : '不可用'}
          </DialogDescription>
        </DialogHeader>
        <div data-testid="backtest-result-scroll" className="min-h-0 overflow-y-auto">
          {!job || !result ? (
            <p className="empty-state">任务尚未生成结果。</p>
          ) : (
            <Tabs defaultValue="summary">
              <TabsList variant="line" className="w-full">
                <TabsTrigger value="summary">摘要</TabsTrigger>
                <TabsTrigger value="equity">权益数据</TabsTrigger>
                <TabsTrigger value="trades">交易明细</TabsTrigger>
                <TabsTrigger value="repro">复现信息</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="grid gap-5 pt-4">
                <div className="metrics">
                  <Metric
                    label="最终资产"
                    value={
                      typeof result.finalValue === 'number'
                        ? money.format(result.finalValue)
                        : '暂无'
                    }
                  />
                  <Metric label="累计收益" value={metricValue('cumulativeReturn')} />
                  <Metric label="最大回撤" value={metricValue('maxDrawdown')} tone="negative" />
                  <Metric label="交易胜率" value={metricValue('tradeWinRate')} />
                </div>
                <div className="module-grid">
                  <div>
                    <span>权益曲线</span>
                    <strong>{equityCurve.length} 个数据点</strong>
                  </div>
                  <div>
                    <span>交易明细</span>
                    <strong>{trades.length} 笔</strong>
                  </div>
                  <div>
                    <span>引擎</span>
                    <strong>
                      {displayValue(result.engineVersion ?? job.engineVersion ?? '未知')}
                    </strong>
                  </div>
                  <div>
                    <span>数据时点</span>
                    <strong>{formatBacktestDataAsOf(result.dataAsOf ?? job.dataAsOf)}</strong>
                  </div>
                </div>
                {warnings.length > 0 && (
                  <Alert>
                    <AlertTitle>运行提示</AlertTitle>
                    <AlertDescription>{warnings.join('；')}</AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">数据完整性</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {result.completeness && typeof result.completeness === 'object'
                        ? (result.completeness as { complete?: unknown }).complete === true
                          ? '完整'
                          : '存在缺失数据'
                        : '不可用'}
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">拒单</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {rejectedOrders.length > 0 ? `${rejectedOrders.length} 笔` : '0 笔'}
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">费用 / 换手</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {hasFeeData ? money.format(totalFees) : '费用不可用'} ·{' '}
                      {typeof metrics?.turnover === 'number'
                        ? money.format(metrics.turnover)
                        : '换手不可用'}
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">基准比较</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {benchmark
                        ? `策略 ${benchmarkValue('strategyReturn')} · 基准 ${benchmarkValue('benchmarkReturn')} · 超额 ${benchmarkValue('excessReturn')}`
                        : '不可用（基准行情缺失）'}
                    </p>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="equity" className="pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <figure className="rounded-md border border-border p-3">
                    <svg
                      viewBox="0 0 100 100"
                      role="img"
                      aria-label="权益曲线"
                      className="h-40 w-full"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points={seriesPoints(equityCurve)}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    <figcaption className="text-xs text-muted-foreground">
                      权益曲线，共 {equityCurve.length} 个数据点。
                    </figcaption>
                  </figure>
                  <figure className="rounded-md border border-border p-3">
                    <svg
                      viewBox="0 0 100 100"
                      role="img"
                      aria-label="回撤曲线"
                      className="h-40 w-full"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points={seriesPoints(drawdown)}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    <figcaption className="text-xs text-muted-foreground">
                      回撤曲线，最大回撤 {metricValue('maxDrawdown')}。
                    </figcaption>
                  </figure>
                </div>
                <ResultTable
                  headers={['日期', '组合价值']}
                  rows={equityCurve
                    .slice(-100)
                    .map((point) => [formatDateOnly(point.date), money.format(point.value)])}
                />
              </TabsContent>
              <TabsContent value="trades" className="pt-4">
                <ResultTable
                  headers={['日期', '方向', '数量', '价格', '原因']}
                  rows={trades.map((trade) => [
                    typeof trade.date === 'string' ? formatDateOnly(trade.date) : '—',
                    displayValue(trade.side ?? '—'),
                    displayValue(trade.quantity ?? '—'),
                    displayValue(trade.price ?? '—'),
                    displayValue(trade.reason ?? '—'),
                  ])}
                />
              </TabsContent>
              <TabsContent value="repro" className="grid gap-3 pt-4">
                <ReproField label="策略版本" value={job.strategyVersionId} />
                <ReproField
                  label="引擎版本"
                  value={job.engineVersion ?? result.engineVersion ?? '未知'}
                />
                <ReproField
                  label="数据时点"
                  value={formatBacktestDataAsOf(job.dataAsOf ?? result.dataAsOf)}
                />
                <ReproField label="结果校验和" value={job.resultChecksum ?? '未返回'} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyTableRow colSpan={headers.length} label="暂无数据" />
          ) : (
            rows.map((row, index) => (
              <tr key={`${row[0] ?? 'row'}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReproField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <code className="mt-1 block break-all text-xs">{displayValue(value)}</code>
    </div>
  );
}
