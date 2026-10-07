import type { MarketDataBarRouteKeyV3 } from '@thesis-ledger/schemas';

type Target = { providerId: string; upstreamSource: string };

/** 共同价格能力允许同口径整窗替换；不声明供应商算法或价格坐标等价。 */
export const supportsBasicPriceFallback = (key: MarketDataBarRouteKeyV3, targets: Target[]) => {
  if (key.market !== 'CN' || key.assetType !== 'ETF' || key.timeframe !== '1d') return false;
  if (targets.length !== 2) return false;
  return targets.every((target) => {
    if (target.providerId === 'tencent' && target.upstreamSource === 'tencent') return true;
    return (
      target.providerId === 'hithink' &&
      target.upstreamSource === 'fund-market-historical' &&
      key.adjustment === 'qfq'
    );
  });
};
