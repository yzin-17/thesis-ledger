import type { TradeDetailResponseV2, TradeSummaryResponseV2 } from '@thesis-ledger/api-client';

export const formatTradeDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN') : '—';

export const formatTradeDecimal = (value: string | null | undefined) => value ?? '—';

export const tradeLifecycleLabel = (value: TradeSummaryResponseV2['lifecycle']) =>
  value === 'ACTIVE' ? '进行中' : '已结束';

export const tradeLifecycleFilterLabel = (value: 'ALL' | 'ACTIVE' | 'ENDED') => {
  if (value === 'ACTIVE') return '进行中';
  if (value === 'ENDED') return '已结束';
  return '全部';
};

export const tradeExitProgressLabel = (value: TradeSummaryResponseV2['exitProgress']) => {
  if (value === 'FULL') return '已全部平仓';
  if (value === 'PARTIAL') return '部分平仓';
  return '尚无平仓';
};

export const tradeEndEvidenceLabel = (value: TradeSummaryResponseV2['endEvidence']) => {
  if (value === 'SELL_EXECUTION') return '卖出成交结束';
  if (value === 'BALANCE_OBSERVATION') return '余额快照结束';
  return '结束依据待确认';
};

export const tradeCompletenessLabel = (value: TradeSummaryResponseV2['completeness']) => {
  if (value === 'COMPLETE') return '证据完整';
  if (value === 'CONFLICTED') return '证据冲突';
  return '证据不完整';
};

const issueLabels: Record<string, string> = {
  BASELINE_COST_CONFLICT: '持仓快照成本存在冲突',
  BASELINE_COST_SCOPE_UNKNOWN: '持仓快照的成本口径未知',
  BASELINE_COST_UNKNOWN: '持仓快照缺少成本',
  MISSING_OPENING_BOUNDARY: '缺少明确的建仓起点',
  QUANTITY_CONFLICT: '持仓数量存在冲突',
  UNKNOWN_CLOSURE: '结束依据尚不明确',
  UNKNOWN_TIME: '交易时间不完整',
};

const exclusionLabels: Record<string, string> = {
  COST_ESTIMATED: '成本包含估算',
  END_EVIDENCE_NOT_SELL: '尚未检测到卖出结束证据',
  EVIDENCE_INCOMPLETE: '交易证据尚不完整',
  LIFECYCLE_ACTIVE: '交易仍在进行',
  NET_PNL_UNAVAILABLE: '净实现盈亏暂不可用',
};

const algorithmVersionLabels: Record<string, string> = {
  'trade-projection-v1': '交易投影 V1',
};

const displayLabels = (values: string[], labels: Record<string, string>, fallback: string) =>
  values.map((value) => labels[value] ?? fallback);

export const tradeIssueLabels = (detail: TradeDetailResponseV2) =>
  displayLabels([...detail.issues, ...detail.costIssues], issueLabels, '存在未识别的投影问题');

export const tradeExclusionLabels = (values: string[]) =>
  displayLabels(values, exclusionLabels, '暂不纳入默认统计');

export const tradeAlgorithmVersionLabel = (value: string) =>
  algorithmVersionLabels[value] ?? '未识别算法版本';

export const tradeBatchScopeLabel = (value: 'FULL' | 'PARTIAL') =>
  value === 'FULL' ? '完整快照' : '部分快照';

export const corporateActionLabel = (value: 'BONUS_SHARE' | 'SPLIT' | 'MERGE') => {
  if (value === 'BONUS_SHARE') return '送股';
  if (value === 'SPLIT') return '拆股';
  return '合股';
};

export const evidenceKindLabel = (
  value: TradeDetailResponseV2['evidenceSources'][number]['kind'],
) => {
  if (value === 'EXECUTION') return '成交记录';
  if (value === 'BASELINE_OBSERVATION') return '持仓快照';
  if (value === 'OPENING_BOUNDARY_ASSERTION') return '用户补录建仓时间';
  if (value === 'BASELINE_RECONCILIATION') return '快照对账';
  if (value === 'CORPORATE_ACTION') return '公司行动';
  return '分红记录';
};

export const canSupplementTradeOpeningBoundary = (detail: TradeDetailResponseV2) =>
  detail.openedAt === null &&
  detail.entryLegs.length === 0 &&
  detail.baselineComponents.some((component) => component.quantity !== '0');

const sourceCategoryLabels: Record<
  TradeDetailResponseV2['evidenceSources'][number]['source']['category'],
  string
> = {
  MANUAL: '手工录入',
  IMPORT: '批量导入',
  INTEGRATION: '外部接入',
  MIGRATION: '历史迁移',
};

export const evidenceSourceLabel = (
  source: TradeDetailResponseV2['evidenceSources'][number]['source'],
) => sourceCategoryLabels[source.category];
