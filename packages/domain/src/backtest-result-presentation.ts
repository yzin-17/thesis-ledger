import { formatDecimalRatioPercent } from './ratio-percent.js';
import type { RuleEvaluationDiagnostics } from './backtest-rule-diagnostics.js';

const labels: Record<string, string> = {
  cumulativeReturn: '累计收益', totalReturn: '累计收益', cagr: '年化收益', annualizedReturn: '年化收益',
  maxDrawdown: '最大回撤', volatility: '波动率', sharpe: '夏普比率', tradeWinRate: '交易胜率',
  winRate: '胜率', profitFactor: '利润因子', tradeCount: '已平仓交易数', basicPeriodReturn: '区间收益',
  turnover: '成交额（旧口径）', tradedNotional: '成交额', turnoverRate: '区间双边资金周转率',
};
const percentages = new Set(['cumulativeReturn', 'totalReturn', 'cagr', 'annualizedReturn',
  'maxDrawdown', 'volatility', 'tradeWinRate', 'winRate', 'basicPeriodReturn', 'turnoverRate']);
const metricReasons: Record<string, string> = {
  ZERO_VOLATILITY: '收益波动为零，夏普比率未定义', NO_VOLATILITY: '收益波动为零',
  NO_TRADES: '没有已平仓交易', NO_COMPLETED_TRADES: '没有已平仓交易',
  NO_LOSING_TRADES: '没有亏损交易，利润因子未定义', INSUFFICIENT_POINTS: '有效收益点不足',
  INITIAL_CAPITAL_UNAVAILABLE: '初始研究资金不可用', FX_RATE_UNAVAILABLE: '成交时点汇率不可用',
};
export const backtestMetricUnavailableReason = (reason: string) => metricReasons[reason] ?? reason;

/** 两端共同消费已保存的指标，不用旧金额字段回填新版比例。 */
export function backtestMetricDisplay(key: string, metric: unknown, currency: string) {
  const label = labels[key] ?? key;
  const row = metric && typeof metric === 'object' ? metric as Record<string, unknown> : null;
  const value = row ? row.value : metric;
  if ((row && row.status !== 'available') || (typeof value !== 'string' && typeof value !== 'number')) {
    const reason = typeof row?.reason === 'string' ? backtestMetricUnavailableReason(row.reason) : '未提供有效指标';
    return { label, value: `不可用：${reason}`, available: false };
  }
  let display = String(value);
  if (percentages.has(key)) display = formatDecimalRatioPercent(display);
  else if (['turnover', 'tradedNotional'].includes(key)) display = `${display} ${currency}`;
  return { label, value: display, available: true };
}

export function backtestStageDisplay(stage: unknown): string {
  const stages: Record<string, string> = { queued: '等待执行', preparing: '正在准备快照', freezing: '正在冻结快照',
    simulating: '正在模拟', analyzing: '正在分析结果', running: '运行中', 'preparation-failed': '准备与预检',
    'snapshot-finalized': '快照已完成', 'persisting-result': '正在保存结果', succeeded: '已完成',
    failed: '失败', cancelled: '已取消', snapshot: '准备快照', prepare: '准备数据', run: '执行回测', finalize: '整理结果' };
  return typeof stage === 'string' && stage.trim() ? stages[stage] ?? '其他阶段' : '未配置';
}

export function backtestRuleDiagnosticDisplay(value: RuleEvaluationDiagnostics) {
  const names: Record<string, string> = { entry: '入场条件', exit: '退出条件',
    'tradePlan.initialStop': '初始保护', 'tradePlan.trailing': '移动保护' };
  return value.rules.map((rule) => ({
    id: rule.ruleId, label: names[rule.ruleId] ?? rule.ruleId,
    summary: `观测${rule.observations}次；条件成立${rule.trueObservations}次，条件未成立${rule.computableObservations - rule.trueObservations}次；具备判断资格${rule.applicableDecisions}次，其中不可计算${rule.applicableDecisions - rule.computableDecisions}次。`,
    reasons: rule.unavailableReasons.map((reason) => `${reason.reason}（${reason.count}次）`),
  }));
}

/** 仅判定同一Run的时序；显式重试增加attempt，关联重放使用新id。 */
export function isBacktestRunUpdateOlder(previous: unknown, incoming: unknown): boolean {
  if (!previous || !incoming || typeof previous !== 'object' || typeof incoming !== 'object') return false;
  const before = previous as Record<string, unknown>; const after = incoming as Record<string, unknown>;
  if (before.id !== after.id) return false;
  if (typeof before.executionAttempt === 'number' && typeof after.executionAttempt === 'number') {
    if (after.executionAttempt < before.executionAttempt) return true;
    if (after.executionAttempt > before.executionAttempt) return false;
  }
  const oldTime = Date.parse(String(before.updatedAt)); const newTime = Date.parse(String(after.updatedAt));
  if (Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime < oldTime) return true;
  if (['succeeded', 'failed', 'cancelled'].includes(String(before.status)) &&
    ['queued', 'running'].includes(String(after.status))) return true;
  return Boolean(before.cancelRequestedAt && !after.cancelRequestedAt && ['queued', 'running'].includes(String(after.status)));
}
