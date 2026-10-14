import { backtestBenchmarkCompatibilitySchemaV3 } from '@thesis-ledger/schemas';
import { backtestMetricNumber, backtestMetricReason } from './strategy-backtest-detail.model.js';
import type { BacktestJobResult } from './strategy.types.js';

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const reasons: Record<string, string> = {
  BENCHMARK_COST_MODEL_UNSUPPORTED: '该冻结版本不支持所选基准费用规则',
  BENCHMARK_COST_ASSUMPTION_UNAVAILABLE: '基准费用设置未提供',
  BENCHMARK_EXECUTION_MODEL_REQUIRED: '需要完整冻结执行模型才能计算',
  BENCHMARK_RETURN_UNAVAILABLE: '基准净收益不可用',
  STRATEGY_RETURN_UNAVAILABLE: '策略净收益不可用',
  BENCHMARK_COMPARISON_INCOMPATIBLE: '策略与基准口径不兼容',
  BENCHMARK_COMPARISON_UNVERIFIED: '策略与基准口径尚未核实',
  INSUFFICIENT_BENCHMARK_POINTS: '基准有效价格点不足',
  BENCHMARK_CURRENCY_MISMATCH: '基准币种不一致',
  BENCHMARK_MULTICURRENCY_INITIAL_CASH_UNSUPPORTED: '基准暂不支持多币种起始资金',
  BENCHMARK_INITIAL_CASH_UNAVAILABLE: '基准起始资金未提供',
  INSUFFICIENT_CASH: '可用资金不足以支付成交与费用',
  NO_LOSING_TRADES: '暂无亏损交易，利润因子无法计算',
};

export const backtestMetricReasonLabel = (metric: unknown) => {
  const reason = backtestMetricReason(metric);
  if (!reason) return null;
  return reasons[reason] ?? reason;
};

/** 只消费服务端收益；展示门控不会改写结果或自行计算收益差。 */
export const backtestBenchmarkDisplayMetrics = (result: BacktestJobResult) => {
  const benchmark = record(result.benchmark);
  if (!benchmark) return null;
  const parsed = backtestBenchmarkCompatibilitySchemaV3.safeParse(result.benchmarkCompatibility);
  const compatibility = parsed.success ? parsed.data : null;
  const cost = compatibility?.costAssumption;
  let reason: string | null = null;
  if (compatibility?.status === 'incompatible') reason = 'BENCHMARK_COMPARISON_INCOMPATIBLE';
  else if (compatibility?.status !== 'compatible') reason = 'BENCHMARK_COMPARISON_UNVERIFIED';
  else if (
    compatibility.strategyFingerprint !== undefined &&
    compatibility.benchmarkFingerprint !== undefined &&
    compatibility.strategyFingerprint !== compatibility.benchmarkFingerprint
  )
    reason = 'BENCHMARK_COMPARISON_INCOMPATIBLE';
  else if (cost?.kind === 'unsupported') reason = 'BENCHMARK_COST_MODEL_UNSUPPORTED';
  else if (!['execution-model', 'zero-cost', 'proportional'].includes(String(cost?.kind)))
    reason = 'BENCHMARK_COST_ASSUMPTION_UNAVAILABLE';
  else if (backtestMetricNumber(record(result.metrics)?.totalReturn) === null)
    reason = 'STRATEGY_RETURN_UNAVAILABLE';
  else if (backtestMetricNumber(benchmark.totalReturn) === null)
    reason = 'BENCHMARK_RETURN_UNAVAILABLE';

  let excessReturn = benchmark.excessReturn;
  if (excessReturn === undefined) {
    excessReturn = { status: 'unavailable', reason: reason ?? 'BENCHMARK_RETURN_UNAVAILABLE' };
  } else if (reason && backtestMetricNumber(excessReturn) !== null) {
    excessReturn = { status: 'unavailable', reason };
  }
  return { totalReturn: benchmark.totalReturn, excessReturn };
};

/** partial 是汇总状态；缺口说明按实际指标定位，不扩大有效指标的限制。 */
export const backtestPartialResultSummary = (result: BacktestJobResult) => {
  const metrics = record(result.metrics);
  const labels: Record<string, string> = {
    totalReturn: '策略净收益',
    maxDrawdown: '最大回撤',
    cagr: '年化收益',
    volatility: '波动率',
    sharpe: '夏普比率',
    winRate: '胜率',
    profitFactor: '利润因子',
    tradeCount: '交易次数',
    turnover: '成交额',
  };
  const entries = Object.entries(labels)
    .filter(([key]) => metrics?.[key] !== undefined)
    .map(([key, label]) => [label, metrics?.[key]] as const);
  const benchmark = backtestBenchmarkDisplayMetrics(result);
  if (benchmark) {
    entries.push(['基准净收益', benchmark.totalReturn], ['净收益差', benchmark.excessReturn]);
  }
  const missing = entries
    .filter(([, metric]) => backtestMetricNumber(metric) === null)
    .map(
      ([label, metric]) => `${label}（${backtestMetricReasonLabel(metric) ?? '未提供有效指标'}）`,
    );
  if (missing.length === 0)
    return '任务已完成，结果标记为部分可用；已返回指标按各自状态展示，缺口说明见诊断与复现。';
  return `以下项目暂不可用：${missing.join('；')}。有效指标、权益与成交仍按各自状态展示。`;
};
