import type { RiskRule } from '@thesis-ledger/domain';
import type { EvaluationCandidate } from './risk-types.js';

const weightKinds = new Set([
  'position-concentration',
  'sector-concentration',
  'asset-concentration',
  'volatility-exposure',
]);

export const riskInputUnavailableReason = (rule: RiskRule, candidate: EvaluationCandidate) => {
  if (weightKinds.has(rule.kind)) {
    const scope =
      candidate.scope === 'account' || Boolean(candidate.accountId) ? 'account' : 'portfolio';
    const status = candidate.dataQuality[`${scope}Weight`];
    if (status !== undefined && status !== 'complete')
      return `风险规则不可评估：${scope === 'account' ? '账户' : '组合'}权重不可用（${candidate.dataQuality[`${scope}WeightReason`] || '估值不完整'}）`;
    if (rule.kind === 'position-concentration') {
      const weight = rule.accountId
        ? (candidate.domain.accountWeight ?? candidate.domain.weight)
        : candidate.domain.weight;
      if (!Number.isFinite(weight))
        return `风险规则不可评估：${scope === 'account' ? '账户' : '组合'}持仓权重缺失或无效，请补齐价格和必要汇率后重试`;
    } else if (!candidate.domain.positions?.length) {
      return `风险规则不可评估：${scope === 'account' ? '账户' : '组合'}持仓权重不完整，请补齐持仓估值后重试`;
    }
  } else if (candidate.scope === 'security' && candidate.dataQuality.marketData === 'unavailable') {
    return `风险规则不可评估：价格不可用（${candidate.dataQuality.valuationReason || '行情输入不合格'}）`;
  }
  return undefined;
};
