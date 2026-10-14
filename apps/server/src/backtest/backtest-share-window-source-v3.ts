import type { BacktestSnapshotManifestV3, ExecutionPriceProtocol } from '@thesis-ledger/schemas';

/** 有界按股来源与研究协议的共同资格；费用和单位消费者单向使用。 */
export function shareWindowMarketV3(protocol: ExecutionPriceProtocol, source: BacktestSnapshotManifestV3['actualSources'][number]) {
  if (protocol.accountingBasis !== 'raw-events' ||
    protocol.marketRuleResearch !== 'raw-prices-no-corporate-actions-v1' ||
    protocol.history.basis !== 'fixed-provider-snapshot' || protocol.priceBasis.quantityBasis !== 'actual-units' ||
    source.purpose !== 'execution' || source.routeKey.kind !== 'bar' || source.routeKey.assetType !== 'STOCK' ||
    source.routeKey.timeframe !== '1d' || source.routeKey.adjustment !== 'none' || source.provenance.providerId !== 'yfinance')
    return undefined;
  if (source.symbol === 'GME.US' && source.routeKey.market === 'US' && source.provenance.upstreamSource === 'yahoo-gme-share-window')
    return 'US' as const;
  if (source.symbol === '00147.HK' && source.routeKey.market === 'HK' && source.provenance.upstreamSource === 'yahoo-hk-share-window')
    return 'HK' as const;
  return undefined;
}
