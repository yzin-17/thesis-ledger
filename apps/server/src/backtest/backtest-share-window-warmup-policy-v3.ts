import type { BacktestStrategy, ExecutionPriceProtocol } from '@thesis-ledger/schemas';

/** 有界按股窗口的候选预算；实际会话与最少Bar仍由Reader/冻结器核验。 */
export function shareWindowWarmupPolicyV3(
  strategy: Pick<BacktestStrategy, 'executionInstrument'>,
  research?: ExecutionPriceProtocol['marketRuleResearch'],
) {
  const asset = strategy.executionInstrument;
  if (research === 'raw-prices-no-corporate-actions-v1' &&
    asset.market === 'US' && asset.symbol === 'GME.US' && asset.assetType === 'stock')
    return { calendarBufferDays: 0, rangePolicyVersion: 'whole-share-window-calendar-budget-v1' };
  if (research === 'raw-prices-no-corporate-actions-v1' &&
    asset.market === 'HK' && asset.symbol === '00147.HK' && asset.assetType === 'stock')
    return { calendarBufferDays: 0, rangePolicyVersion: 'research-lot-share-window-calendar-budget-v1' };
  return { calendarBufferDays: 14, rangePolicyVersion: 'calendar-aware-conservative-v1' };
}
