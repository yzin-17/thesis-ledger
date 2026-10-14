import type { ExecutionPriceProtocol } from '@thesis-ledger/schemas';

/** 准备、预检和冻结读取复用同一研究意图；旧严格读取保持原边界。 */
export function backtestResearchReadOptionsV3(
  market: string,
  protocol: Pick<
    ExecutionPriceProtocol,
    'history' | 'accountingBasis' | 'cashEventResearch' | 'marketRuleResearch'
  >,
) {
  if (!['CN', 'HK', 'US'].includes(market) || protocol.history.basis !== 'fixed-provider-snapshot')
    return {};
  return {
    tradabilityMode: 'assume-untradable-no-bar' as const,
    priceResearch:
      protocol.accountingBasis === 'normalized-series' ||
      !!protocol.cashEventResearch ||
      !!protocol.marketRuleResearch,
  };
}
