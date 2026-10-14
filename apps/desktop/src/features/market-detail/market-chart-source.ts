import type { MarketDisplayBarSeries } from '@thesis-ledger/schemas';

/** 展示来源归行情消费所有；原生日线与派生来源保持各自身份。 */
export function chartSourceMetadata(series: MarketDisplayBarSeries) {
  if ('derivation' in series) {
    return {
      provider: series.provenance.provider,
      upstreamSource: series.provenance.baseSources.map((source) => source.upstreamSource).join('、'),
      providerRevision: series.provenance.providerRevision,
      freshness: 'delayed' as const,
      servedFromCache: false,
      timeframeKind: 'derived' as const,
    };
  }
  return {
    provider: series.provenance.providerId,
    upstreamSource: series.provenance.upstreamSource,
    providerRevision: series.provenance.providerRevision,
    freshness: series.provenance.cacheStatus === 'stale' ? 'stale' as const : 'delayed' as const,
    servedFromCache: series.provenance.servedFromCache,
    timeframeKind: 'base' as const,
  };
}
