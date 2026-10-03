import { isDeepStrictEqual } from 'node:util';
import {
  bindMarketPitReconstructionManifestV3,
  marketRouteKeyIdV3,
  type MarketDataBarSeriesRequestV3,
  type MarketDataBarSeriesResponseV3,
  type MarketPitReconstructionManifestV3,
} from '@thesis-ledger/schemas';
import {
  marketFrozenWindowHashV3,
  marketWindowSeriesVersionV3,
} from './market-frozen-window-v3.js';
import { parseMarketWindowEvidenceResponseV3 } from './market-window-response-v3.js';
import type { MarketWindowEvidenceV3Repository } from './market-window-evidence-v3.repository.js';
import { marketPitArchiveExceedsCutoffV3 } from './market-pit-reconstruction-content-clock-v3.js';

export type MarketPitReconstructionInputV3 = {
  request: MarketDataBarSeriesRequestV3;
  response: MarketDataBarSeriesResponseV3;
  seriesVersion: string;
  dataAsOf: string;
};
type FrozenWindow = NonNullable<
  Awaited<ReturnType<MarketWindowEvidenceV3Repository['findFrozen']>>
>;
export type MarketPitBoundArchiveV3 = Omit<FrozenWindow, 'evidence'> & {
  evidence: Omit<FrozenWindow['evidence'], 'fetchedAt'> & { fetchedAt: string };
};
export type MarketPitArchiveContentResultV3 =
  | {
      status: 'archives-bound';
      proof: MarketPitReconstructionManifestV3;
      archives: MarketPitBoundArchiveV3[];
    }
  | {
      status: 'unavailable';
      reason:
        | 'input-mismatch'
        | 'archive-missing'
        | 'archive-invalid'
        | 'archive-scope-mismatch'
        | 'archive-bar-mismatch'
        | 'archive-future';
    };

const sameScope = (archive: FrozenWindow, input: MarketPitReconstructionInputV3) => {
  const { request, response } = archive;
  const expected = input.response;
  if (
    request.symbol !== input.request.symbol ||
    response.symbol !== expected.symbol ||
    marketRouteKeyIdV3(request.routeKey) !== marketRouteKeyIdV3(input.request.routeKey) ||
    marketRouteKeyIdV3(response.routeKey) !== marketRouteKeyIdV3(expected.routeKey) ||
    !isDeepStrictEqual(request.routeTarget, input.request.routeTarget) ||
    response.provenance.providerId !== expected.provenance.providerId ||
    response.provenance.upstreamSource !== expected.provenance.upstreamSource ||
    response.provenance.routeIndex !== expected.provenance.routeIndex ||
    archive.seriesVersion !== input.seriesVersion ||
    !isDeepStrictEqual(
      { ...response.sourcePriceBasis, observedAt: null },
      { ...expected.sourcePriceBasis, observedAt: null },
    )
  )
    return false;
  return (
    response.sourcePriceBasis.basisScope !== 'request-window' ||
    (request.start === input.request.start && request.end === input.request.end)
  );
};

/** 实际归档内容绑定；结果尚未获得历史决策时点资格。 */
export const bindMarketPitArchiveContentV3 = async (
  input: MarketPitReconstructionInputV3 & { proof: unknown },
  windows: Pick<MarketWindowEvidenceV3Repository, 'findFrozen'>,
): Promise<MarketPitArchiveContentResultV3> => {
  const binding = bindMarketPitReconstructionManifestV3(input);
  if (binding.status !== 'bound') return { status: 'unavailable', reason: 'input-mismatch' };
  const { proof } = binding;
  const archives = new Map<
    string,
    {
      window: FrozenWindow;
      bars: Map<number, MarketDataBarSeriesResponseV3['bars']>;
    }
  >();
  try {
    if (marketWindowSeriesVersionV3(input.request, input.response) !== input.seriesVersion) {
      return { status: 'unavailable', reason: 'input-mismatch' };
    }
    for (const [index, reference] of proof.barArchives.entries()) {
      let entry = archives.get(reference.windowIdentityFingerprint);
      if (!entry) {
        const loaded = await windows.findFrozen(reference.windowIdentityFingerprint);
        if (!loaded) return { status: 'unavailable', reason: 'archive-missing' };
        const archive = loaded;
        const response = parseMarketWindowEvidenceResponseV3(archive.response, archive.request);
        if (
          archive.evidence.identityFingerprint !== reference.windowIdentityFingerprint ||
          archive.completeResponseHash !== reference.completeResponseHash ||
          marketFrozenWindowHashV3(response) !== reference.completeResponseHash ||
          marketWindowSeriesVersionV3(archive.request, response) !== archive.seriesVersion
        ) {
          return { status: 'unavailable', reason: 'archive-invalid' };
        }
        if (!sameScope(archive, input))
          return { status: 'unavailable', reason: 'archive-scope-mismatch' };
        if (
          marketPitArchiveExceedsCutoffV3({
            fetchedAt: archive.evidence.fetchedAt,
            response,
            dataAsOf: input.dataAsOf,
            contractVersion: proof.contractVersion,
          })
        ) {
          return { status: 'unavailable', reason: 'archive-future' };
        }
        const bars = new Map<number, MarketDataBarSeriesResponseV3['bars']>();
        for (const bar of archive.response.bars) {
          const time = Date.parse(bar.timestamp);
          const matches = bars.get(time) ?? [];
          matches.push(bar);
          bars.set(time, matches);
        }
        entry = { window: archive, bars };
        archives.set(reference.windowIdentityFingerprint, entry);
      }
      const matches = entry.bars.get(Date.parse(reference.timestamp)) ?? [];
      if (matches.length !== 1 || !isDeepStrictEqual(matches[0], input.response.bars[index])) {
        return { status: 'unavailable', reason: 'archive-bar-mismatch' };
      }
    }
    return {
      status: 'archives-bound',
      proof,
      archives: structuredClone(
        [...archives.values()].map(({ window }) => ({
          ...window,
          evidence: { ...window.evidence, fetchedAt: window.evidence.fetchedAt.toISOString() },
        })),
      ),
    };
  } catch {
    return { status: 'unavailable', reason: 'archive-invalid' };
  }
};
