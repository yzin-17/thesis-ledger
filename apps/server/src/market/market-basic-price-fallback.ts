import { marketRouteKeyIdV3, marketBarQuerySemanticsV3Schema, type MarketDataBarRouteKeyV3, type MarketRouteCatalogV3 } from '@thesis-ledger/schemas';

type Target = { providerId: string; upstreamSource: string };

/** 共同价格能力允许同口径整窗替换；不声明供应商算法或价格坐标等价。 */
export const supportsBasicPriceFallback = (key: MarketDataBarRouteKeyV3, targets: Target[], catalog: MarketRouteCatalogV3) => {
  if (key.capability !== 'DAILY_BAR' || key.timeframe !== '1d' || targets.length !== 2 || catalog.integrity !== 'complete') return false;
  if (key.market === 'CN' && key.assetType !== 'ETF') return false;
  if (key.market !== 'CN' && key.assetType !== 'STOCK' && key.assetType !== 'ETF') return false;
  if (targets[0]!.providerId === targets[1]!.providerId && targets[0]!.upstreamSource === targets[1]!.upstreamSource) return false;
  return targets.every((target, index) => {
    const entries = catalog.entries.filter((entry) => marketRouteKeyIdV3(entry.key) === marketRouteKeyIdV3(key) &&
      entry.target.providerId === target.providerId && entry.target.upstreamSource === target.upstreamSource);
    if (entries.length !== 1) return false;
    const entry = entries[0]!;
    const parsed = marketBarQuerySemanticsV3Schema.safeParse(entry.barQuery);
    return parsed.success && parsed.data.adjustment === key.adjustment && (index === 0 || entry.state === 'ready');
  });
};
