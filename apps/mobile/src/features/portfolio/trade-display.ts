import type { TradeDetailResponse } from '@thesis-ledger/api-client';

const issueLabels: Record<string, string> = {
  BASELINE_COST_CONFLICT: '持仓快照成本存在冲突',
  BASELINE_COST_SCOPE_UNKNOWN: '持仓快照的成本口径未知',
  BASELINE_COST_UNKNOWN: '持仓快照缺少成本',
  FEE_CURRENCY_MISMATCH: '费用币种与成交币种不一致，净收益暂不可确认',
  MISSING_OPENING_BOUNDARY: '缺少明确的建仓起点',
  QUANTITY_CONFLICT: '持仓数量存在冲突',
  UNKNOWN_CLOSURE: '结束依据尚不明确',
  UNKNOWN_TIME: '交易时间不完整',
};

export const tradeIssueLabels = (trade: Pick<TradeDetailResponse, 'issues' | 'costIssues'>) =>
  [...trade.issues, ...trade.costIssues].map(
    (issue) => issueLabels[issue] ?? '存在未识别的投影问题',
  );

export const tradeAlgorithmLabel = (version: string) =>
  version === 'trade-projection-v1' ? '交易投影 V1' : '未识别算法版本';
