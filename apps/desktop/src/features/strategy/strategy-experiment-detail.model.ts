import type {
  OptimizationCostSummary,
  OptimizationTradingCostReadModel,
} from '@thesis-ledger/schemas';
import { aiExecutionDisplay } from '../ai/ai-execution-display.js';
import type {
  OptimizationAttempt,
  OptimizationCandidate,
  OptimizationExperimentSummary,
} from './strategy-optimization.api.js';
import type { StrategyRecord, StrategyVersion } from './strategy.types.js';

export const experimentStageLabels: Record<string, string> = {
  queued: '排队中',
  baseline: '运行基线',
  development: '生成候选',
  validation: '验证候选',
  awaiting_finalization: '等待锁定候选',
  testing: '封存测试中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export const scalarText = (value: unknown, fallback = '不可用') => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return fallback;
};

export const metricRecord = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

export const candidateMetric = (candidate: OptimizationCandidate, split: 'validation' | 'test') =>
  metricRecord(metricRecord(candidate.metrics)[split]);

export const metricValue = (metrics: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (metrics[key] !== undefined && metrics[key] !== null) return scalarText(metrics[key]);
  }
  return '不可用';
};

export const canRevealTestMetrics = (
  experiment: OptimizationExperimentSummary,
  candidate?: OptimizationCandidate,
) => {
  if (experiment.readEligibility?.state !== 'readable') return false;
  if (candidate && candidate.readEligibility?.state !== 'readable') return false;
  return true;
};

export const candidateAdoptionEligibility = (
  experiment: OptimizationExperimentSummary,
  candidate: OptimizationCandidate,
) => {
  if (!canRevealTestMetrics(experiment, candidate)) return '封存测试结果尚未揭示';
  if (experiment.status !== 'succeeded' || experiment.stage !== 'completed')
    return '实验尚未完成封存测试';
  if (candidate.validationStatus !== 'test_valid') return '候选未通过封存测试';
  return null;
};

export const experimentCostText = (summary: OptimizationCostSummary) => {
  const amount = summary.knownAmount;
  const currency = summary.currency;
  if (summary.status === 'complete' && amount && currency) return `已确认 ${currency} ${amount}`;
  if (summary.status === 'partial' && amount && currency) return `已确认至少 ${currency} ${amount}`;
  if (summary.status === 'mixed_currency') {
    if (summary.knownByCurrency.length === 0) return '多币种，无法汇总';
    return `分币种已确认：${summary.knownByCurrency
      .map((item) => `${item.currency} ${item.amount}`)
      .join('，')}`;
  }
  return '费用未知';
};

export const experimentUsageText = (
  experiment: OptimizationExperimentSummary,
  attempts: OptimizationAttempt[],
) => {
  if (attempts.length === 0) return '历史未核对';
  const completeness = attempts.map((attempt) => attempt.usageCompleteness ?? 'legacy_unknown');
  if (completeness.every((value) => value === 'reported'))
    return `${experiment.inputTokensUsed.toLocaleString('zh-CN')} / ${experiment.outputTokensUsed.toLocaleString('zh-CN')}`;
  if (completeness.some((value) => value === 'legacy_unknown')) return '包含历史未核对用量';
  if (completeness.some((value) => value === 'unknown')) return '包含未知用量';
  return `部分报告 ${experiment.inputTokensUsed.toLocaleString('zh-CN')} / ${experiment.outputTokensUsed.toLocaleString('zh-CN')}（非完整总量）`;
};

export const optimizationAttemptExecutionText = (attempt: OptimizationAttempt) =>
  aiExecutionDisplay(attempt.execution, {
    ...(attempt.inputTokens === null || attempt.inputTokens === undefined
      ? {}
      : { inputTokens: attempt.inputTokens }),
    ...(attempt.outputTokens === null || attempt.outputTokens === undefined
      ? {}
      : { outputTokens: attempt.outputTokens }),
  });

export const tradingCostText = (cost: OptimizationTradingCostReadModel) => {
  if (cost.source === 'unavailable') return ['交易成本来源不可用'];
  const source = cost.source === 'baseline_strategy' ? '正式基线策略' : '服务端 discovery seed';
  const rates = `佣金 ${cost.commissionRate ?? '未知'} / 滑点 ${cost.slippageRate ?? '未知'}`;
  const assumption = cost.zeroDoesNotMeanFree
    ? '零佣金与零滑点仅是回测假设，不代表真实交易免费'
    : '交易成本是回测输入假设，不属于 AI 费用';
  return [`来源：${source}`, rates, assumption];
};

export const experimentStopReasonText = (reason: string) => {
  if (reason === 'no_valid_candidate') return '所有候选均未通过验证';
  if (reason === 'user_cancelled') return '用户已取消实验';
  if (reason.startsWith('final_test_retry_required:')) return '封存测试部分发生技术失败';
  return `实验因技术或预算限制停止：${reason}`;
};

export const candidateDiffSummary = (candidate: OptimizationCandidate) => {
  if (candidate.diff.length === 0) return '没有记录到参数变化';
  const fullDefinition = candidate.diff.some((item) => item.kind === 'full-strategy');
  if (fullDefinition) return '完整策略定义候选';
  return `${candidate.diff.length} 项参数变化`;
};

export const strategyVersionLabel = (version: StrategyVersion | null) =>
  version ? `v${version.version}` : '版本不可用';

export const findStrategyVersion = (strategies: StrategyRecord[], versionId: string) => {
  for (const strategy of strategies) {
    const version = strategy.versions.find((item) => item.id === versionId);
    if (version) return { strategy, version };
  }
  return null;
};
