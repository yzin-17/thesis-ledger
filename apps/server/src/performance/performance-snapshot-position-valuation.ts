import type { FundNav } from '@thesis-ledger/schemas';
import type { MarketService } from '../market/market.service.js';
import type { MarketBarReader } from '../market/market-bar-reader.js';
import type { Currency, SnapshotCaptureContext } from './performance-types.js';

type SnapshotPosition = {
  symbol: string;
  quantity: unknown;
  costPrice: unknown;
  asset: { assetType: string };
};

const marketForSymbol = (symbol: string): 'CN' | 'HK' | 'US' => {
  if (/\.(SH|SZ|BJ)$/.test(symbol)) return 'CN';
  if (/\.HK$/.test(symbol)) return 'HK';
  if (/\.US$/.test(symbol)) return 'US';
  throw new Error(`无法识别正式估值市场: ${symbol}`);
};

const assertUsableFundNav = (nav: Pick<FundNav, 'unitNav' | 'freshness'>) => {
  if (!Number.isFinite(nav.unitNav) || nav.unitNav <= 0 || nav.freshness !== 'delayed')
    throw new Error('基金净值尚不可用于本次估值');
};

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
        if (official.freshness === 'stale')
          throw new Error(`${valuationDateKey} 正式净值证据已陈旧`);
        assertUsableFundNav(official);
        return {
          ...base,
          marketValue: base.quantity * official.unitNav,
          provider: official.provider,
          stale: false,
          freshness: official.freshness,
          valuationEvidence: {
            kind: 'fund-nav',
            date: valuationDateKey,
            unitNav: official.unitNav,
            provider: official.provider,
          },
        };
      }
      const nav = await market.getFundNav(position.symbol, { allowStale: false });
      assertUsableFundNav(nav);
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
      const marketCode = marketForSymbol(position.symbol);
      const selected = await bars.readV3({
        market: marketCode,
        symbol: position.symbol,
        routeKey: {
          kind: 'bar',
          market: marketCode,
          assetType,
          capability: 'DAILY_BAR',
          timeframe: '1d',
          adjustment: 'none',
        },
        window: { start: valuationDateKey, end: valuationDateKey },
      });
      if (selected.status !== 'selected') throw new Error(`${valuationDateKey} 正式收盘价不可用`);
      const official = selected.selection.response.bars.find(
        (bar) =>
          bar.timestamp.slice(0, 10) === valuationDateKey && bar.completionStatus === 'complete',
      );
      if (!official) throw new Error(`${valuationDateKey} 正式收盘价尚未发布`);
      return {
        ...base,
        marketValue: base.quantity * official.close,
        provider: selected.selection.response.provenance.providerId,
        stale: false,
        freshness: 'delayed' as const,
        valuationEvidence: {
          kind: 'bar-close',
          date: valuationDateKey,
          close: official.close,
          timestamp: official.timestamp,
          provider: selected.selection.response.provenance.providerId,
          upstreamSource: selected.selection.response.provenance.upstreamSource,
        },
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
