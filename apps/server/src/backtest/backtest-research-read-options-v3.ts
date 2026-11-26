import type { ExecutionPriceProtocol } from '@thesis-ledger/schemas';
import type { MarketBarWindowReadInputV3 } from '../market/market-bar-reader-v3.js';

/** 准备、预检和冻结读取复用同一研究意图；旧严格读取保持原边界。 */
export function backtestResearchReadOptionsV3(
  market: string,
  protocol: Pick<
    ExecutionPriceProtocol,
    'history' | 'accountingBasis' | 'cashEventResearch' | 'marketRuleResearch'
  >,
  timeframe = '1d',
  dailyObservationContract?: 'market-daily-tradability-window-v1',
): Pick<MarketBarWindowReadInputV3, 'tradabilityMode' | 'priceResearch' | 'dailyObservationContract'> {
  if (!['CN', 'HK', 'US'].includes(market) || protocol.history.basis !== 'fixed-provider-snapshot')
    return {};
  return {
    tradabilityMode: timeframe === '1d' ? 'assume-untradable-no-bar' as const : 'observed-bars-only' as const,
    ...(timeframe === '1d' && dailyObservationContract !== undefined ? { dailyObservationContract } : {}),
    priceResearch:
      protocol.accountingBasis === 'normalized-series' ||
      !!protocol.cashEventResearch ||
      !!protocol.marketRuleResearch,
  };
}
