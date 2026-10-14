import { compareMarketPitEvidenceInstantStringsV1, type RunConfigV3 } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { hkResearchLotForFactV3 } from './backtest-hk-research-lot-v3.js';

/** 已绑定的研究观察可用固定研究截点；来源事实和时钟不改写。 */
export function applicableInstrumentObservationV3(
  fact: ArtifactRow, openedAt: string, config: RunConfigV3 | undefined,
  symbol: string, market: string, evidence: readonly ArtifactRow[],
): boolean {
  if (typeof fact.occurredAt !== 'string') return false;
  let cutoff = openedAt;
  const usShareObservation = config?.executionPriceProtocol.accountingBasis === 'raw-events' &&
    config.executionPriceProtocol.marketRuleResearch === 'raw-prices-no-corporate-actions-v1' &&
    config.executionPriceProtocol.priceBasis.quantityBasis === 'actual-units' &&
    market === 'US' && symbol === 'GME.US' && fact.provider === 'yahoo-gme-share-window' &&
    fact.instrumentType === 'STOCK' && fact.currency === 'USD' && fact.lotSize === '1' && fact.tickSize === '0.01';
  const hkShareObservation = config !== undefined && market === 'HK' && symbol === '00147.HK' &&
    fact.provider === 'yahoo-hk-share-window' && hkResearchLotForFactV3(fact, config) !== undefined;
  const shareObservation = usShareObservation || hkShareObservation;
  if (config && (config.executionPriceProtocol.accountingBasis === 'normalized-series' || shareObservation) &&
      config.executionPriceProtocol.history.basis === 'fixed-provider-snapshot' &&
      fact.symbol === symbol && fact.market === market) {
    const row = evidence.find((row) => row.purpose === 'instrumentFacts' &&
      row.artifactKey === `instrumentFacts/${market}-${symbol}.parquet` &&
      typeof row.sourceResponse === 'string' && typeof row.request === 'string');
    if (row && typeof row.request === 'string') {
      const request = JSON.parse(row.request) as Record<string, unknown>;
      const matchingShareSource = !shareObservation ||
        (request.barAdjustment === 'none' && request.barProviderId === 'yfinance' &&
          request.barUpstreamSource === (hkShareObservation ? 'yahoo-hk-share-window' : 'yahoo-gme-share-window'));
      if (matchingShareSource && request.identityOnly === true && request.symbol === symbol && request.market === market)
        cutoff = config.dataAsOf;
    }
  }
  const occurred = compareMarketPitEvidenceInstantStringsV1(fact.occurredAt, cutoff);
  let available: ReturnType<typeof compareMarketPitEvidenceInstantStringsV1> = -1;
  if (config) available = typeof fact.availableAt === 'string'
    ? compareMarketPitEvidenceInstantStringsV1(fact.availableAt, config.dataAsOf) : undefined;
  return (occurred === -1 || occurred === 0) && (available === -1 || available === 0);
}
