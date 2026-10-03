import { isDeepStrictEqual } from 'node:util';
import type { HistoricalDecisionWindowV3 } from '@thesis-ledger/schemas';
import { marketFrozenWindowHashV3 } from './market-frozen-window-v3.js';
import type { MarketPitReconstructionInputV3 } from './market-pit-reconstruction-content-v3.js';
import type {
  MarketPitDecisionWindowInputV3,
  MarketPitDecisionWindowFailureV3,
} from './market-pit-decision-window-v3.js';
import { compareDecisionClockV3 } from './market-pit-decision-window-calendar-v3.js';

type Binding = HistoricalDecisionWindowV3['barDecisionBindings'][number];
function fail(reason: MarketPitDecisionWindowFailureV3): never {
  throw new Error(reason);
}

export function assertMarketPitDecisionEvidenceCutoffV3(
  evidence: HistoricalDecisionWindowV3,
  cutoff: string,
): void {
  for (const item of [...evidence.originalEvidence, ...evidence.calendars]) {
    if (
      compareDecisionClockV3(item.knownAvailableAt, cutoff) > 0 ||
      compareDecisionClockV3(item.acquiredAt, cutoff) > 0
    )
      fail('evidence-future');
  }
  for (const witness of evidence.sourceWitnesses)
    if (compareDecisionClockV3(witness.revisionKnownAvailableAt, cutoff) > 0)
      fail('evidence-future');
}

function assertArchiveScope(
  archive: MarketPitDecisionWindowInputV3['content']['archives'][number],
  input: MarketPitReconstructionInputV3,
): void {
  const actual = archive.response;
  const expected = input.response;
  if (
    archive.request.symbol !== input.request.symbol ||
    !isDeepStrictEqual(archive.request.routeKey, input.request.routeKey) ||
    !isDeepStrictEqual(archive.request.routeTarget, input.request.routeTarget) ||
    actual.symbol !== expected.symbol ||
    !isDeepStrictEqual(actual.routeKey, expected.routeKey) ||
    actual.provenance.providerId !== expected.provenance.providerId ||
    actual.provenance.upstreamSource !== expected.provenance.upstreamSource ||
    actual.provenance.routeIndex !== expected.provenance.routeIndex ||
    archive.seriesVersion !== input.seriesVersion ||
    !isDeepStrictEqual(
      { ...actual.sourcePriceBasis, observedAt: null },
      { ...expected.sourcePriceBasis, observedAt: null },
    )
  )
    fail('archive-binding-mismatch');
  if (
    actual.sourcePriceBasis.basisScope === 'request-window' &&
    (archive.request.start !== input.request.start || archive.request.end !== input.request.end)
  )
    fail('archive-binding-mismatch');
}

export function indexMarketPitDecisionArchivesV3({
  content,
  input,
}: MarketPitDecisionWindowInputV3) {
  const archives = new Map<string, (typeof content.archives)[number]>();
  const hashes = new Set<string>();
  for (const archive of content.archives) {
    assertArchiveScope(archive, input);
    for (const bar of archive.response.bars)
      for (const clock of [bar.timestamp, bar.availableAt])
        if (compareDecisionClockV3(clock, input.dataAsOf) > 0) fail('evidence-future');
    if (
      archives.has(archive.evidence.identityFingerprint) ||
      hashes.has(archive.completeResponseHash) ||
      marketFrozenWindowHashV3(archive.response) !== archive.completeResponseHash
    )
      fail('archive-binding-mismatch');
    archives.set(archive.evidence.identityFingerprint, archive);
    hashes.add(archive.completeResponseHash);
  }
  const expected = new Set(content.proof.barArchives.map((item) => item.windowIdentityFingerprint));
  if (expected.size !== archives.size || [...archives.keys()].some((id) => !expected.has(id)))
    fail('archive-binding-mismatch');
  return archives;
}

export function assertMarketPitDecisionSourceClocksV3(
  claim: Binding,
  reference: MarketPitDecisionWindowInputV3['content']['proof']['barArchives'][number],
  bar: MarketPitReconstructionInputV3['response']['bars'][number],
  source: MarketPitDecisionWindowInputV3['sourceTimes']['bindings'][number],
  calendar: HistoricalDecisionWindowV3['calendars'][number],
  window: Pick<Binding, 'closedAt' | 'nextTradingDate' | 'nextOpenedAt'>,
  evidence: HistoricalDecisionWindowV3,
  cutoff: string,
): void {
  const witness = evidence.sourceWitnesses.find((item) => item.id === claim.sourceWitnessId);
  if (
    !witness ||
    witness.windowIdentityFingerprint !== reference.windowIdentityFingerprint ||
    witness.completeResponseHash !== reference.completeResponseHash
  )
    fail('archive-binding-mismatch');
  if (compareDecisionClockV3(witness.revisionKnownAvailableAt, bar.availableAt) > 0)
    fail('historical-revision-unavailable');
  if (compareDecisionClockV3(calendar.knownAvailableAt, bar.availableAt) > 0)
    fail('calendar-horizon-unavailable');
  if (
    compareDecisionClockV3(window.closedAt, bar.availableAt) > 0 ||
    compareDecisionClockV3(bar.availableAt, window.nextOpenedAt) >= 0
  )
    fail('outside-decision-window');
  if (
    compareDecisionClockV3(window.closedAt, source.sourceObservedAt) > 0 ||
    compareDecisionClockV3(source.sourceObservedAt, bar.availableAt) > 0 ||
    compareDecisionClockV3(source.sourceObservedAt, source.fetchedAt) > 0 ||
    compareDecisionClockV3(source.fetchedAt, window.nextOpenedAt) >= 0
  )
    fail('historical-source-late');
  for (const clock of [bar.timestamp, bar.availableAt, source.sourceObservedAt, source.fetchedAt])
    if (compareDecisionClockV3(clock, cutoff) > 0) fail('evidence-future');
}

export function assertMarketPitDecisionSourceBindingV3(
  bar: MarketPitReconstructionInputV3['response']['bars'][number],
  reference: MarketPitDecisionWindowInputV3['content']['proof']['barArchives'][number],
  source: MarketPitDecisionWindowInputV3['sourceTimes']['bindings'][number],
  archives: ReturnType<typeof indexMarketPitDecisionArchivesV3>,
): void {
  const archive = archives.get(reference.windowIdentityFingerprint);
  const matches = archive?.response.bars.filter((item) => item.timestamp === bar.timestamp);
  if (
    !archive ||
    archive.completeResponseHash !== reference.completeResponseHash ||
    matches?.length !== 1 ||
    !isDeepStrictEqual(matches[0], bar)
  )
    fail('archive-binding-mismatch');
  if (
    source.timestamp !== bar.timestamp ||
    source.availableAt !== bar.availableAt ||
    source.windowIdentityFingerprint !== reference.windowIdentityFingerprint ||
    source.sourceObservedAt !== archive.response.sourcePriceBasis.observedAt ||
    source.fetchedAt !== archive.evidence.fetchedAt
  )
    fail('source-time-binding-mismatch');
}
