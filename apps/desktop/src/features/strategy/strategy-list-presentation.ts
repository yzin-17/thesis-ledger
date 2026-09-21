import type { OptimizationExperimentSource } from '@thesis-ledger/schemas';
import { formatDateOnly } from '@/lib/date-display';
import type { OptimizationExperimentSummary } from './strategy-optimization.api.js';
import { backtestMetricNumber } from './strategy-backtest-detail.model.js';
import type { BacktestJobSummary } from './strategy.types.js';

const businessDate = (value: string | undefined) => {
  if (!value) return null;
  const formatted = formatDateOnly(value, '');
  return formatted || null;
};

export const backtestPeriodLabel = (job: BacktestJobSummary) => {
  const start = businessDate(job.period?.start ?? job.periodStart);
  const end = businessDate(job.period?.end ?? job.periodEnd);
  return start && end ? `${start} – ${end}` : '区间未记录';
};

const backtestStatusLabels: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export const backtestStatusLabel = (status: string) => backtestStatusLabels[status] ?? '状态未识别';

export const backtestStatusSummary = (jobs: BacktestJobSummary[]) => {
  const counts = new Map<string, number>();
  for (const job of jobs) counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
  return ['failed', 'running', 'queued', 'succeeded', 'cancelled']
    .filter((status) => counts.has(status))
    .map((status) => `${counts.get(status)} ${backtestStatusLabel(status)}`)
    .join(' · ');
};

export const backtestProgressLabel = (job: BacktestJobSummary) => {
  if (!['queued', 'running'].includes(job.status)) return null;
  if (typeof job.progress !== 'number' || !Number.isFinite(job.progress)) return null;
  return `进度 ${Math.max(0, Math.min(100, Math.round(job.progress)))}%`;
};

export const backtestResultSummary = (job: BacktestJobSummary) => {
  if (job.status === 'succeeded') {
    const metrics = job.resultMetrics;
    const facts: string[] = [];
    const totalReturn = backtestMetricNumber(metrics?.cumulativeReturn ?? metrics?.totalReturn);
    const maxDrawdown = backtestMetricNumber(metrics?.maxDrawdown);
    const sharpe = backtestMetricNumber(metrics?.sharpe);
    if (totalReturn !== null) facts.push(`收益 ${(totalReturn * 100).toFixed(2)}%`);
    if (maxDrawdown !== null) facts.push(`回撤 ${Math.abs(maxDrawdown * 100).toFixed(2)}%`);
    if (sharpe !== null) facts.push(`夏普 ${sharpe.toFixed(2)}`);
    return facts.slice(0, 3).join(' · ') || '结果已生成';
  }
  if (job.status === 'failed') return job.errorSummary?.trim() || '查看失败原因';
  if (job.status === 'cancelled') return '任务已取消，未产生结果';
  return '尚未产生结果';
};

const experimentStatusLabels: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  awaiting_finalization: '等待锁定候选',
  testing: '封存测试中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const experimentStageLabels: Record<string, string> = {
  preparing: '准备实验',
  baseline: '基线回测',
  proposing: '候选生成',
  evaluating: '候选验证',
  awaiting_finalization: '等待锁定候选',
  testing: '封存测试',
  completed: '实验完成',
  failed: '执行失败',
  cancelled: '已取消',
};

export const experimentStatusLabel = (status: string) =>
  experimentStatusLabels[status] ?? '状态未识别';

export const experimentStatusVariant = (
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'testing') return 'secondary';
  if (status === 'succeeded') return 'default';
  return 'outline';
};

export const experimentStageLabel = (stage: string) => experimentStageLabels[stage] ?? '阶段未识别';

const sourceLabel = (source: OptimizationExperimentSource | undefined) => {
  if (source?.kind === 'existing') {
    const name = source.strategyName?.trim() || '来源策略';
    return `基于「${name}」v${source.version}`;
  }
  if (source?.kind === 'discovery') {
    const symbol = source.discoveryScope?.executionInstrument.symbol;
    return symbol ? `${symbol} · 从零探索` : '从零探索';
  }
  return null;
};

export const experimentSourceLabel = (experiment: OptimizationExperimentSummary) => {
  const source = sourceLabel(experiment.source);
  if (source) return source;
  const symbol = experiment.discoveryScope?.executionInstrument.symbol;
  if (experiment.sourceMode === 'discovery') return symbol ? `${symbol} · 从零探索` : '从零探索';
  return '来源策略未记录';
};

export const experimentProgressLabel = (experiment: OptimizationExperimentSummary) => {
  const facts = [
    experiment.aiCallsUsed > 0 ? `AI 调用 ${experiment.aiCallsUsed}` : null,
    experiment.backtestRunsUsed > 0 ? `回测 ${experiment.backtestRunsUsed}` : null,
    experiment.selectedCandidateId ? '已选择候选' : null,
  ].filter((value): value is string => Boolean(value));
  return facts.length > 0 ? facts.join(' · ') : '尚无产出';
};
