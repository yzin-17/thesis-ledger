import { marketRouteKeyIdV3, marketBarQuerySemanticsV3Schema, isMarketMinuteTimeframe, type MarketDataBarRouteKeyV3, type MarketRouteCatalogV3 } from '@thesis-ledger/schemas';

type Target = { providerId: string; upstreamSource: string };

/** 共同价格能力允许同口径整窗替换；不声明供应商算法或价格坐标等价。 */
export const supportsBasicPriceFallback = (key: MarketDataBarRouteKeyV3, targets: Target[], catalog: MarketRouteCatalogV3) => {
  const minute = key.capability === 'MINUTE_BAR' && isMarketMinuteTimeframe(key.timeframe);
  if (targets.length !== 2 || catalog.integrity !== 'complete') return false;
  if (minute) {
    if (key.adjustment !== 'none' || !['CN', 'HK', 'US'].includes(key.market) ||
        !['STOCK', 'ETF'].includes(key.assetType)) return false;
  } else if (key.capability !== 'DAILY_BAR' || key.timeframe !== '1d') return false;
  if (!minute && key.market === 'CN' && key.assetType !== 'ETF') return false;
  if (key.market !== 'CN' && key.assetType !== 'STOCK' && key.assetType !== 'ETF') return false;
  if (targets[0]!.providerId === targets[1]!.providerId && targets[0]!.upstreamSource === targets[1]!.upstreamSource) return false;
  return targets.every((target, index) => {
    const entries = catalog.entries.filter((entry) => marketRouteKeyIdV3(entry.key) === marketRouteKeyIdV3(key) &&
      entry.target.providerId === target.providerId && entry.target.upstreamSource === target.upstreamSource);
    if (entries.length !== 1) return false;
    const entry = entries[0]!;
    // 原生分钟目录的精确键已声明周期与不复权；barQuery 仅用于日线语义。
    if (minute) return index === 0 || entry.state === 'ready';
    const parsed = marketBarQuerySemanticsV3Schema.safeParse(entry.barQuery);
    return parsed.success && parsed.data.adjustment === key.adjustment && (index === 0 || entry.state === 'ready');
  });
};
