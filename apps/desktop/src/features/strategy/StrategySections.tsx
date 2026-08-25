import { useEffect, useMemo, useState } from 'react';
import { Eye, LoaderCircle, Play, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyListState, EmptyTableRow } from '../shared/EmptyStates.js';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { money, displayValue, isDataLoaded } from '../shared/display.js';
import { Metric } from '../shared/DesktopPrimitives.js';
import { schemaAsOf, schemaSymbols, latestVersion } from './strategy.schema.js';
import type {
  BacktestJob,
  BacktestSetupInput,
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
  return labels[status] ?? '未知状态';
};

export const jobStatusVariant = (
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'succeeded') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'running') return 'secondary';
  return 'outline';
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

const formatTime = (value: unknown) => {
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
};

const jobPeriod = (job: BacktestJob) => {
  if (job.period) return job.period;
  if (job.periodStart || job.periodEnd)
    return { start: job.periodStart ?? '—', end: job.periodEnd ?? '—' };
  const inputPeriod = job.input?.period;
  if (inputPeriod && typeof inputPeriod === 'object' && !Array.isArray(inputPeriod)) {
    const period = inputPeriod as { start?: unknown; end?: unknown };
    return {
      start: typeof period.start === 'string' ? period.start : '—',
      end: typeof period.end === 'string' ? period.end : '—',
    };
  }
  return { start: '—', end: '—' };
};

const jobCash = (job: BacktestJob) => {
  const value = job.input?.initialCash;
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
  jobs: BacktestJob[];
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  busyAction: string | null;
  onCreate: () => void;
  onEdit: (strategy: StrategyRecord, version: StrategyVersion) => void;
  onBacktest: (strategy: StrategyRecord, version: StrategyVersion) => void;
}) {
  const sortedStrategies = useMemo(
    () =>
      [...strategies].sort((left, right) =>
        (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''),
      ),
    [strategies],
  );
  return (
    <section className="panel" aria-labelledby="strategy-library-title">
      <div className="panel-heading flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="strategy-library-title">策略库</h2>
          <p>每次保存都会生成不可变的新版本；回测始终绑定到你选择的版本。</p>
        </div>
        <span className="text-xs text-muted-foreground">{strategies.length} 条策略</span>
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
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedStrategies.map((strategy) => {
                const version = latestVersion(strategy.versions);
                const status = version?.schema?.status ?? strategy.status;
                const recentJob = jobs.find((job) => job.strategyVersionId === version?.id);
                const symbols = version?.schema ? schemaSymbols(version.schema) : [];
                return (
                  <tr key={strategy.id}>
                    <td>
                      <strong>{strategy.name}</strong>
                      <span>
                        {symbols[0] ?? '未配置标的'}
                        {symbols.length > 1 ? ` 等 ${symbols.length} 个` : ''}
                        {strategy.description ? ` · ${strategy.description}` : ''}
                      </span>
                    </td>
                    <td>
                      <strong>{version ? `v${version.version}` : '—'}</strong>
                      <span>{version?.schema ? schemaAsOf(version.schema) : '无 Schema'}</span>
                    </td>
                    <td>
                      <Badge variant={strategyStatusVariant(status)}>
                        {strategyStatusLabel(status)}
                      </Badge>
                    </td>
                    <td>{formatTime(version?.createdAt ?? strategy.updatedAt)}</td>
                    <td>
                      {recentJob ? (
                        <>
                          <Badge variant={jobStatusVariant(recentJob.status)}>
                            {jobStatusLabel(recentJob.status)}
                          </Badge>
                          <span>{formatTime(recentJob.createdAt)}</span>
                        </>
                      ) : (
                        <span>暂无回测</span>
                      )}
                    </td>
                    <td>
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
                    </td>
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
}: {
  jobs: BacktestJob[];
  strategies: StrategyRecord[];
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  busyAction: string | null;
  onRun: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onViewResult: (job: BacktestJob) => void;
}) {
  const strategyForJob = (job: BacktestJob) =>
    strategies.find((strategy) =>
      strategy.versions.some((version) => version.id === job.strategyVersionId),
    );
  const versionForJob = (job: BacktestJob) =>
    strategyForJob(job)?.versions.find((version) => version.id === job.strategyVersionId);
  return (
    <section className="panel" aria-labelledby="strategy-jobs-title">
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
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <EmptyTableRow
                colSpan={6}
                label={isDataLoaded(loadState) ? '暂无回测任务' : '正在加载任务…'}
              />
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
                      <span>
                        {job.id.slice(0, 8)} · {job.engineVersion ?? '引擎待分配'}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {period.start} → {period.end}
                      </strong>
                      <span>{jobCash(job)}</span>
                    </td>
                    <td>
                      <Badge variant={jobStatusVariant(job.status)}>
                        {jobStatusLabel(job.status)}
                      </Badge>
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
                        <span>{job.status === 'succeeded' ? '100%' : '—'}</span>
                      )}
                    </td>
                    <td>{formatTime(job.createdAt)}</td>
                    <td>
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
                    </td>
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

export function BacktestSetupDialog({
  open,
  strategy,
  version,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  strategy: StrategyRecord | null;
  version: StrategyVersion | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (setup: BacktestSetupInput) => Promise<boolean>;
}) {
  const [period, setPeriod] = useState({ start: '2025-01-01', end: '2025-01-31' });
  const [initialCash, setInitialCash] = useState('100000');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setPeriod({ start: '2025-01-01', end: '2025-01-31' });
      setInitialCash('100000');
      setError(null);
    }
  }, [open, version?.id]);
  const symbols = version?.schema ? schemaSymbols(version.schema) : [];
  const submit = async () => {
    const cash = Number(initialCash);
    if (!period.start || !period.end || period.start > period.end) {
      setError('请选择有效的回测日期区间。');
      return;
    }
    if (!Number.isFinite(cash) || cash <= 0) {
      setError('初始资金必须大于 0。');
      return;
    }
    setError(null);
    const succeeded = await onSubmit({ period, initialCash: cash });
    if (!succeeded) return;
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-64px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>开始回测</DialogTitle>
          <DialogDescription>
            回测会读取所选版本的 Schema；排队成功后自动启动任务。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium">
              {strategy?.name ?? '未知策略'} · v{version?.version ?? '?'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              首个标的：{symbols[0] ?? '未配置'} · 数据时点：
              {version?.schema ? schemaAsOf(version.schema) : '未知'}
            </p>
          </div>
          {symbols.length > 1 && (
            <Alert>
              <AlertTitle>多标的策略</AlertTitle>
              <AlertDescription>
                当前回测只会使用首个标的 {symbols[0]}，其余标的不会进入本次任务。
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field invalid={Boolean(error && error.includes('日期'))}>
              <FieldLabel htmlFor="backtest-start">开始日期</FieldLabel>
              <Input
                id="backtest-start"
                type="date"
                value={period.start}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, start: event.target.value }))
                }
              />
            </Field>
            <Field invalid={Boolean(error && error.includes('日期'))}>
              <FieldLabel htmlFor="backtest-end">结束日期</FieldLabel>
              <Input
                id="backtest-end"
                type="date"
                value={period.end}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, end: event.target.value }))
                }
              />
            </Field>
          </div>
          <Field invalid={Boolean(error && error.includes('资金'))}>
            <FieldLabel htmlFor="backtest-cash">初始资金</FieldLabel>
            <Input
              id="backtest-cash"
              type="number"
              min="1"
              step="1000"
              value={initialCash}
              onChange={(event) => setInitialCash(event.target.value)}
            />
            <FieldDescription>单位：人民币；服务端未提供时默认 100,000。</FieldDescription>
          </Field>
          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={busy || !version} onClick={() => void submit()}>
            {busy && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {busy ? '准备中…' : '开始回测'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StrategyResultDialog({
  job,
  open,
  onOpenChange,
}: {
  job: BacktestJob | null;
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
    typeof metrics?.[key] === 'number' ? `${(metrics[key] * 100).toFixed(2)}%` : '暂无';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-48px)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>回测结果 · {job?.id.slice(0, 8) ?? '未知任务'}</DialogTitle>
          <DialogDescription>结果保留引擎版本、数据时点、成本模型和复现字段。</DialogDescription>
        </DialogHeader>
        {!job || !result ? (
          <p className="empty-state">任务尚未生成结果。</p>
        ) : (
          <Tabs defaultValue="summary">
            <TabsList variant="line" className="w-full justify-start">
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
                    typeof result.finalValue === 'number' ? money.format(result.finalValue) : '暂无'
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
                  <strong>{displayValue(result.dataAsOf ?? job.dataAsOf ?? '未知')}</strong>
                </div>
              </div>
              {Array.isArray(job.warnings) && job.warnings.length > 0 && (
                <Alert>
                  <AlertTitle>运行提示</AlertTitle>
                  <AlertDescription>
                    {job.warnings.map((warning) => String(warning)).join('；')}
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
            <TabsContent value="equity" className="pt-4">
              <ResultTable
                headers={['日期', '组合价值']}
                rows={equityCurve
                  .slice(-100)
                  .map((point) => [point.date, money.format(point.value)])}
              />
            </TabsContent>
            <TabsContent value="trades" className="pt-4">
              <ResultTable
                headers={['日期', '方向', '数量', '价格', '原因']}
                rows={trades.map((trade) => [
                  displayValue(trade.date ?? '—'),
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
              <ReproField label="数据时点" value={job.dataAsOf ?? result.dataAsOf ?? '未知'} />
              <ReproField label="结果校验和" value={job.resultChecksum ?? '未返回'} />
            </TabsContent>
          </Tabs>
        )}
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
