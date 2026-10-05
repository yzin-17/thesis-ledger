import type { JournalDeterministicReview } from '@thesis-ledger/schemas';
export type JournalDecimalMetric = JournalDeterministicReview['metrics'][string];

export const reviewObjectLabels = { TRADE_CYCLE: '完整交易周期', CLOSE_SLICE: '单次减仓' };
export const reviewStatusLabels = { CURRENT: '证据一致', STALE: '历史快照已过期' };
export const behaviorLabels = {
  ENTRY_PRICE_DEVIATION: '入场价格',
  EXIT_PRICE_DEVIATION: '退出价格',
  HOLDING_PERIOD_DEVIATION: '持有时间',
  STOP_EXIT_DEVIATION: '止损执行',
};
export const behaviorStatusLabels = {
  DEVIATION: '发现偏差',
  NO_DEVIATION: '未发现偏差',
  INSUFFICIENT_EVIDENCE: '证据不足',
};
export const metricLabels: Record<string, string> = {
  plannedEntryPrice: '计划入场价',
  actualEntryPrice: '实际入场价',
  entryPriceDeviation: '入场价格偏差',
  entryPriceDeviationRatio: '入场价格偏差比例',
  plannedExitPrice: '计划退出价',
  actualExitPrice: '实际退出价',
  exitPriceDeviation: '退出价格偏差',
  exitPriceDeviationRatio: '退出价格偏差比例',
  plannedHoldingDays: '计划持有天数',
  actualHoldingDays: '实际持有天数',
  holdingDayDeviation: '持有天数偏差',
  plannedStopPrice: '计划止损价',
  stopExitDeviation: '止损价格偏差',
  netRealizedPnl: '已实现净收益',
  realizedNetReturnRate: '已实现净收益率',
  executedQuantity: '实际退出数量',
  counterfactualNetPnl: '按止损价退出的假设净收益',
  counterfactualDifference: '假设与实际净收益差额',
  sampleCount: '合格样本数',
  winRate: '胜率',
  profitLossRatio: '盈亏比',
  averageHoldingDays: '平均持有天数',
};
const evidenceLabels: Record<string, string> = {
  ACTIVE_TRADE: '周期尚未结束',
  NON_SELL_ENDING: '结束证据不是实际卖出',
  UNKNOWN_OPENED_AT: '真实开仓时间未知',
  ESTIMATED_COST: '成本含估算',
  COST_CONFLICT: '成本证据冲突',
  FX_MISSING: '缺少汇率证据',
  EVIDENCE_INCOMPLETE: '证据不完整',
  STALE_PROJECTION: '当前投影已过期',
  LEGACY_UNCONFIRMED: '旧记录待确认',
  PLAN_MISSING: '没有明确关联的计划',
  PLAN_ASSOCIATION_AMBIGUOUS: '计划关联存在歧义',
  PLAN_SYMBOL_CONFLICT: '计划标的与交易不一致',
  PLANNED_ENTRY_MISSING: '缺少计划入场价',
  PLANNED_EXIT_MISSING: '缺少计划退出价',
  PLANNED_STOP_MISSING: '缺少计划止损价',
  PLANNED_HOLDING_DAYS_MISSING: '缺少计划持有天数',
  REALIZED_PNL_MISSING: '缺少已实现收益',
  RETURN_RATE_MISSING: '缺少收益率',
  BASELINE_NOT_EXECUTION: '基线观察不能作为成交价',
  CORPORATE_ACTION_PRICE_BASIS: '公司行动前后的价格单位未确认',
  CORPORATE_ACTION_QUANTITY_BASIS: '公司行动前后的数量单位未确认',
  TIME_ORDER_CONFLICT: '开仓和退出时间矛盾',
  STOP_PRICE_NON_POSITIVE: '止损价必须为正数',
  PLANNED_ENTRY_NON_POSITIVE: '计划入场价必须为正数',
  PLANNED_EXIT_NON_POSITIVE: '计划退出价必须为正数',
  MIXED_CURRENCIES: '多个币种不能直接相加',
  LOSS_SAMPLE_MISSING: '没有亏损样本，盈亏比无法计算',
  ENTRY_SOURCE_MISSING: '缺少入场来源',
  EXECUTION_PRICE_MISSING: '缺少成交价格',
  EXECUTION_QUANTITY_MISSING: '缺少成交数量',
  EXIT_TIME_MISSING: '退出时间未知',
  STATISTICS_TIME_UNKNOWN: '统计时间未知',
  UNKNOWN_HOLDING_TIME: '持有时间未知',
  VALUE_MISSING: '缺少可计算的数值',
};
export const evidenceLabel = (reason: string) =>
  evidenceLabels[reason] ?? `相关证据不足（${reason}）`;
export const reviewError = (error: unknown) =>
  error instanceof Error ? error.message : '请求未完成，请重试';
export function metricText(metric: JournalDecimalMetric) {
  if (metric.status === 'NOT_APPLICABLE') return '不适用';
  if (metric.status === 'INSUFFICIENT_EVIDENCE') return '证据不足';
  if (metric.unit === 'RATIO') return `${metric.value}（比例）`;
  if (metric.unit === 'DAYS') return `${metric.value} 天`;
  return [metric.value, metric.currency].filter(Boolean).join(' ');
}
