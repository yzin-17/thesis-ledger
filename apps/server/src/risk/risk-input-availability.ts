import type { RiskRule } from '@thesis-ledger/domain';
import type { EvaluationCandidate } from './risk-types.js';

const weightKinds = new Set([
  'position-concentration',
  'sector-concentration',
  'asset-concentration',
  'volatility-exposure',
  'correlation',
]);

export const riskInputUnavailableReason = (rule: RiskRule, candidate: EvaluationCandidate) => {
  if (weightKinds.has(rule.kind)) {
    const scope =
      candidate.scope === 'account' || Boolean(candidate.accountId) ? 'account' : 'portfolio';
    const status = candidate.dataQuality[`${scope}Weight`];
    if (status !== undefined && status !== 'complete')
      return `风险规则不可评估：${scope === 'account' ? '账户' : '组合'}权重不可用（${candidate.dataQuality[`${scope}WeightReason`] || '估值不完整'}）`;
  } else if (candidate.scope === 'security' && candidate.dataQuality.marketData === 'unavailable') {
    return `风险规则不可评估：价格不可用（${candidate.dataQuality.valuationReason || '行情输入不合格'}）`;
  }
  return undefined;
};
