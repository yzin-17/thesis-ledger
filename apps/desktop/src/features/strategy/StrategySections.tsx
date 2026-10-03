export {
  BacktestSetupDialog,
  defaultBacktestPeriod,
  backtestPeriodPresets,
} from './BacktestSetupDialog.js';
import { useMemo, useState } from 'react';
import { Eye, LoaderCircle, Play, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyListState, EmptyTableRow } from '../shared/EmptyStates.js';
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { money, isDataLoaded } from '../shared/display.js';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import { schemaAsOf, schemaSymbols, latestVersion } from './strategy.schema.js';
import { diagnosticText, localizeBacktestMessage } from './BacktestModelDisclosure.js';
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

export const backtestStageLabel = (stage: unknown) => {
  const labels: Record<string, string> = {
    queued: '排队中',
    'snapshot-finalized': '快照已完成',
    running: '运行中',
    'persisting-result': '正在保存结果',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
    snapshot: '准备快照',
    prepare: '准备数据',
    run: '执行回测',
    finalize: '整理结果',
  };
  if (typeof stage !== 'string' || !stage.trim()) return '未配置';
  return labels[stage] ?? '其他阶段';
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
  onRetry,
  onViewResult,
  onOpenLibrary,
}: {
  jobs: BacktestJobSummary[];
  strategies: StrategyRecord[];
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  busyAction: string | null;
  onRun: (job: BacktestJobSummary) => void;
  onCancel: (job: BacktestJobSummary) => void;
  onRetry?: (jobId: string) => void;
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
                const diagnostic = localizeBacktestMessage(diagnosticText(job.diagnostics));
                const errorSummary = localizeBacktestMessage(job.errorSummary);
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
                      {errorSummary && <span>{errorSummary}</span>}
                      {job.errorCode && <span>{job.errorCode}</span>}
                      {job.executionModelDisclosure && (
                        <span>
                          已选模型：{job.executionModelDisclosure.model.id} ·{' '}
                          {job.executionModelDisclosure.model.version}
                        </span>
                      )}
                      {diagnostic && diagnostic !== errorSummary && <span>{diagnostic}</span>}
                      {job.stage && <span>阶段：{backtestStageLabel(job.stage)}</span>}
                      {(job.executionAttempt ?? job.attempt) !== undefined && (
                        <span>执行次数：{job.executionAttempt ?? job.attempt}</span>
                      )}
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
                            onClick={() => onRun(job)}
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
                            onClick={() => onCancel(job)}
                          >
                            <X data-icon="inline-start" />
                            取消
                          </Button>
                        )}
                        {(job.status === 'succeeded' || job.status === 'failed') && (
                          <Button size="sm" variant="ghost" onClick={() => onViewResult(job)}>
                            <Eye data-icon="inline-start" />
                            {job.status === 'failed' ? '查看失败详情' : '查看结果'}
                          </Button>
                        )}
                        {job.mode === 'V3' && job.status === 'failed' && onRetry && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyAction !== null}
                            aria-busy={busyAction === `retry:${job.id}`}
                            onClick={() => onRetry(job.id)}
                          >
                            <Play data-icon="inline-start" />
                            {busyAction === `retry:${job.id}` ? '重试中…' : '重试'}
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
