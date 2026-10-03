import { createHash } from 'node:crypto';
import {
  marketDataBarSeriesResponseV3Schema,
  canonicalMarketMultiWindowEncodingV3,
  type MarketDataBarSeriesResponseV3,
  type MarketDataBarSeriesRequestV3,
} from '@thesis-ledger/schemas';
import { createMarketSeriesIdentity } from './market-series-identity.js';
import { parseMarketWindowEvidenceResponseV3 } from './market-window-response-v3.js';

/** Strict schema parsing fixes object field order; requestId is transport correlation only. */
export const marketFrozenWindowHashV3 = (response: unknown) => {
  if (response !== null && typeof response === 'object' && 'windowObservations' in response) {
    const parsed = parseMarketWindowEvidenceResponseV3(response);
    return createHash('sha256').update('frozen-market-window-multi-v1:')
      .update(canonicalMarketMultiWindowEncodingV3(parsed)).digest('hex');
  }
  const canonical = {
    ...marketDataBarSeriesResponseV3Schema.parse(response),
    requestId: 'frozen-market-window-v1',
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
};

export const marketWindowSeriesVersionV3 = (
  request: Pick<MarketDataBarSeriesRequestV3, 'start' | 'end'>,
  response: MarketDataBarSeriesResponseV3,
) =>
  createMarketSeriesIdentity({
    identity: {
      symbol: response.symbol,
      assetType: response.routeKey.assetType,
      timeframe: response.routeKey.timeframe,
      adjustment: response.routeKey.adjustment,
    },
    providerId: response.provenance.providerId,
    upstreamSource: response.provenance.upstreamSource,
    priceBasis: response.sourcePriceBasis,
    basisWindow: { start: request.start, end: request.end },
    points: response.bars,
  }).seriesVersion;
