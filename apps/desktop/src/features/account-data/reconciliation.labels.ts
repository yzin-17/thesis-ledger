import type {
  BaselineReconciliationConflictReason,
  BaselineReconciliationMatchBasis,
} from '@thesis-ledger/schemas';

export const reconciliationBasisLabels: Record<BaselineReconciliationMatchBasis, string> = {
  ACCOUNT_MATCH: '账户一致',
  SYMBOL_MATCH: '标的一致',
  EXECUTION_BEFORE_BASELINE: '成交早于快照',
  CHRONOLOGICAL_PREFIX: '按时间顺序覆盖',
  REPLAYED_CHECKPOINTS: '已重放快照检查点',
};
export const reconciliationConflictLabels: Record<BaselineReconciliationConflictReason, string> = {
  BASELINE_TIME_UNKNOWN: '快照时间未知',
  MISSING_BASELINE_COST: '快照成本缺失',
  EXECUTION_TIME_UNKNOWN: '成交时间未知',
  EXECUTION_NOT_FOUND: '成交不存在',
  EXECUTION_SCOPE_MISMATCH: '成交范围不一致',
  EXECUTION_AFTER_BASELINE: '成交晚于快照',
  EXECUTION_CURRENCY_MISMATCH: '成交币种不一致',
  CHARGE_CURRENCY_MISMATCH: '费用币种不一致',
  EXECUTION_OVERSELL: '成交超卖',
  DUPLICATE_EXECUTION_COVERAGE: '成交重复覆盖',
  NEGATIVE_REMAINING_QUANTITY: '覆盖后数量为负',
  NEGATIVE_REMAINING_COST: '覆盖后成本为负',
};
