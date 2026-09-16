import type { MarketService } from '../market/market.service.js';
import type { MarketBarReader } from '../market/market-bar-reader.js';
import type { Currency, SnapshotCaptureContext } from './performance-types.js';

type SnapshotPosition = {
  symbol: string;
  accountId: string;
  quantity: unknown;
  costPrice: unknown;
  asset: { assetType: string };
};

const seriesFreshness = (cacheStatus: 'miss' | 'memory' | 'redis' | 'postgres' | 'stale') =>
  cacheStatus === 'stale' ? 'stale' as const : 'delayed' as const;

const basePositionValue = (position: SnapshotPosition, currency: Currency) => ({
  symbol: position.symbol,
  quantity: Number(position.quantity),
  costPrice: Number(position.costPrice),
  assetType: position.asset.assetType,
  currency,
  nativeCostValue: Number(position.quantity) * Number(position.costPrice),
});

export async function valueSnapshotPosition(
  market: MarketService,
  position: SnapshotPosition,
  currency: Currency,
  valuationDateKey: string,
  context: SnapshotCaptureContext,
  bars?: MarketBarReader,
) {
  const base = basePositionValue(position, currency);
  try {
    if (position.asset.assetType === 'fund' || /\.OF$/.test(position.symbol)) {
      if (context.valuationBasis === 'OFFICIAL') {
        const history = await market.getFundNavHistory(
          position.symbol,
          { start: valuationDateKey, end: valuationDateKey, limit: 10 },
          { persistIdentity: false },
        );
        const official = history.find((point) => point.navDate.slice(0, 10) === valuationDateKey);
        if (!official) throw new Error(`${valuationDateKey} 正式净值尚未发布`);
        return {
          ...base,
          marketValue: base.quantity * official.unitNav,
          provider: official.provider,
          stale: false,
          freshness: official.freshness,
        };
      }
      const nav = await market.getFundNav(position.symbol, { allowStale: false });
      return {
        ...base,
        marketValue: base.quantity * nav.unitNav,
        provider: nav.provider,
        stale: nav.freshness === 'stale',
        freshness: nav.freshness,
      };
    }
    if (context.valuationBasis === 'OFFICIAL') {
      if (!bars) throw new Error('正式绩效校准缺少 MarketBarReader');
      const assetType = position.asset.assetType === 'etf' ? 'ETF' : 'STOCK';
      const series = await bars.read({
        identity: { symbol: position.symbol, assetType, timeframe: '1d', adjustment: 'none' },
        window: { start: `${valuationDateKey}T00:00:00.000Z`, end: `${valuationDateKey}T23:59:59.999Z` },
        acceptance: 'complete',
      });
      const official = series.points.find((bar) => bar.timestamp.slice(0, 10) === valuationDateKey);
      if (!official) throw new Error(`${valuationDateKey} 正式收盘价尚未发布`);
      return {
        ...base,
        marketValue: base.quantity * official.close,
        provider: series.provenance.providerId,
        stale: false,
        // 完整收盘 bar 的 freshness 由 Reader 的缓存状态推导；正式估值本身是 delayed。
        freshness: seriesFreshness(series.provenance.cacheStatus),
      };
    }
    const quote = await market.getQuote(position.symbol, { allowStale: false });
    return {
      ...base,
      marketValue: base.quantity * quote.price,
      provider: quote.provider,
      stale: quote.stale,
      freshness: quote.freshness,
    };
  } catch (error) {
    return {
      ...base,
      marketValue: null,
      provider: 'unavailable',
      stale: true,
      error: error instanceof Error ? error.message : '行情不可用',
    };
  }
}
