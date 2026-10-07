import {
  backtestSnapshotActualSourceV3Schema,
  type marketDataBarSeriesRequestResponseV3Schema,
  type MarketDataBarRouteKeyV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import type {
  BacktestSnapshotV3SourceArtifacts,
  BacktestSnapshotV3SourcePlan,
} from './backtest-snapshot-v3-source.js';
import type { MarketBarWindowReadResultV3 } from '../market/market-bar-reader-v3.js';

type SelectedSource = Extract<MarketBarWindowReadResultV3, { status: 'selected' }>;
type CorrelatedSource = ReturnType<typeof marketDataBarSeriesRequestResponseV3Schema.parse>;

interface SourceEvidenceInput {
  plan: BacktestSnapshotV3SourcePlan;
  readResult: SelectedSource;
  request: CorrelatedSource['request'];
  response: CorrelatedSource['response'];
  plannedRouteKey: MarketDataBarRouteKeyV3;
  expectedWindow: { start: string; end: string };
  target: NonNullable<CorrelatedSource['request']['routeTarget']>;
}

/** Compares persisted evidence to the selected response before any artifact encoding. */
export const snapshotSourceEvidenceMatchesV3 = (input: SourceEvidenceInput): boolean => {
  const { plan, readResult, response, plannedRouteKey, expectedWindow, target } = input;
  const { selection, evidence, seriesVersion } = readResult;
  const expectedEvidence = {
    routeKey: plannedRouteKey,
    target,
    symbol: plan.symbol,
    window: expectedWindow,
    seriesVersion,
    inputFingerprint: response.inputFingerprint,
    desiredRevision: selection.desiredRevision,
    effectivePolicyRevision: selection.effectivePolicyRevision,
    catalogRevision: selection.catalogRevision,
    sourcePriceBasis: response.sourcePriceBasis,
    coverageProof: response.coverageProof,
  };
  const actualEvidence = {
    routeKey: evidence.routeKey,
    target: evidence.target,
    symbol: evidence.symbol,
    window: evidence.window,
    seriesVersion: evidence.seriesVersion,
    inputFingerprint: evidence.inputFingerprint,
    desiredRevision: evidence.desiredRevision,
    effectivePolicyRevision: evidence.effectivePolicyRevision,
    catalogRevision: evidence.catalogRevision,
    sourcePriceBasis: evidence.sourcePriceBasis,
    coverageProof: evidence.coverageProof,
  };
  return !(
    canonicalizeManifest(actualEvidence) !== canonicalizeManifest(expectedEvidence) ||
    typeof evidence.identityFingerprint !== 'string' ||
    evidence.identityFingerprint.trim().length === 0 ||
    !(evidence.fetchedAt instanceof Date) ||
    !Number.isFinite(evidence.fetchedAt.getTime())
  );
};

/** Encodes the validated complete source response into the scalar-only frozen evidence. */
export const encodeSnapshotSourceEvidenceV3 = (
  input: SourceEvidenceInput,
): BacktestSnapshotV3SourceArtifacts => {
  const { plan, readResult, request, response, plannedRouteKey, expectedWindow, target } = input;
  const { selection, evidence, seriesVersion } = readResult;
  const fetchedAt = evidence.fetchedAt.toISOString();
  const selectionEvidence = {
    source: selection.source,
    routeIndex: selection.routeIndex,
    ...(selection.primaryFailure === undefined ? {} : { primaryFailure: selection.primaryFailure }),
  };
  const actualSource = backtestSnapshotActualSourceV3Schema.parse({
    purpose: plan.purpose,
    symbol: plan.symbol,
    routeKey: plannedRouteKey,
    provenance: response.provenance,
    inputFingerprint: response.inputFingerprint,
    ...('windowObservations' in response
      ? { windowProtocol: 'market-multi-window-content-v1' }
      : {}),
  });
  const evidenceRow: ArtifactRow = {
    kind: 'market-window-evidence-v3',
    purpose: plan.purpose,
    symbol: plan.symbol,
    routeKey: canonicalizeManifest(plannedRouteKey),
    window: canonicalizeManifest(expectedWindow),
    request: canonicalizeManifest(request),
    target: canonicalizeManifest(target),
    selection: canonicalizeManifest(selectionEvidence),
    revisions: canonicalizeManifest({
      desiredRevision: selection.desiredRevision,
      effectivePolicyRevision: selection.effectivePolicyRevision,
      catalogRevision: selection.catalogRevision,
    }),
    provenance: canonicalizeManifest(response.provenance),
    seriesVersion: canonicalizeManifest(seriesVersion),
    inputFingerprint: canonicalizeManifest(response.inputFingerprint),
    coverage: canonicalizeManifest(response.coverage),
    sourcePriceBasis: canonicalizeManifest(response.sourcePriceBasis),
    coverageProof: canonicalizeManifest(response.coverageProof),
    ...(response.historicalTradabilityWindows ? {
      historicalTradabilityWindows: canonicalizeManifest(response.historicalTradabilityWindows),
    } : {}),
    ...('windowObservations' in response
      ? { multiWindowResponse: canonicalizeManifest(response) }
      : {}),
    identityFingerprint: canonicalizeManifest(evidence.identityFingerprint),
    fetchedAt: canonicalizeManifest(fetchedAt),
  };
  return { actualSource, evidenceRow };
};
