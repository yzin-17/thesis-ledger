import type { MarketDataBarSeriesResponseV3 } from './market-data-wire-v3.js';
import type {
  bindMarketPitReconstructionProofV3,
  MarketPitReconstructionProofV3,
} from './market-pit-reconstruction-v3.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';
import { marketRouteKeyIdV3 } from './market-route-v3.js';

type ReconstructionInput = Parameters<typeof bindMarketPitReconstructionProofV3>[0];

export const reconstructionScopeMatches = (
  input: ReconstructionInput,
  proof: MarketPitReconstructionProofV3,
): boolean => {
  const { request, response } = input;
  const target = request.routeTarget;
  return !(
    !target ||
    proof.symbol !== request.symbol ||
    proof.symbol !== response.symbol ||
    marketRouteKeyIdV3(proof.routeKey) !== marketRouteKeyIdV3(request.routeKey) ||
    marketRouteKeyIdV3(proof.routeKey) !== marketRouteKeyIdV3(response.routeKey) ||
    proof.target.providerId !== target.providerId ||
    proof.target.upstreamSource !== target.upstreamSource ||
    proof.target.routeIndex !== target.routeIndex ||
    proof.target.providerId !== response.provenance.providerId ||
    proof.target.upstreamSource !== response.provenance.upstreamSource ||
    proof.target.routeIndex !== response.provenance.routeIndex ||
    proof.window.start !== request.start ||
    proof.window.end !== request.end ||
    proof.window.start !== response.coverage.requestedStart ||
    proof.window.end !== response.coverage.requestedEnd ||
    proof.seriesVersion !== input.seriesVersion ||
    proof.inputFingerprint !== response.inputFingerprint ||
    proof.dataAsOf !== input.dataAsOf
  );
};

export const reconstructionArchivesMatch = (
  proof: MarketPitReconstructionProofV3,
  response: MarketDataBarSeriesResponseV3,
): boolean => {
  return !(
    proof.barArchives.length !== response.bars.length ||
    proof.barArchives.some(
      (archive, index) =>
        compareMarketPitEvidenceInstantStringsV1(
          archive.timestamp,
          response.bars[index]!.timestamp,
        ) !== 0,
    )
  );
};

export const reconstructionFactsWithinCutoff = (
  input: ReconstructionInput,
  basis: MarketPitReconstructionProofV3['sourcePriceBasis'],
): boolean => {
  const { response } = input;
  const onOrBefore = (value: string) => {
    const order = compareMarketPitEvidenceInstantStringsV1(value, input.dataAsOf);
    return order !== undefined && order <= 0;
  };
  return (
    onOrBefore(basis.observedAt) &&
    response.bars.every((bar) => onOrBefore(bar.timestamp) && onOrBefore(bar.availableAt))
  );
};
