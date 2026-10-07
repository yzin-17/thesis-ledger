import type { BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import type { SnapshotV3EvidenceContext } from './backtest-snapshot-v3-execution-evidence.js';
import type { ExecutionWindowEvidence } from './backtest-snapshot-v3-execution-window.js';

type ExecutionSource = BacktestSnapshotManifestV3['actualSources'][number];
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const validateExecutionIdentityFactsV3 = (
  source: ExecutionSource,
  parsed: ExecutionWindowEvidence,
  context: SnapshotV3EvidenceContext,
) => {
  const {
    evidence,
    target,
    selection,
    provenance,
    revisions,
    evidenceInputFingerprint,
    identityFingerprint,
    fetchedAt,
    seriesVersion,
  } = parsed;
  function fail(message: string): never {
    throw context.integrityError(message);
  }
  if (
    !isObject(target) ||
    !isObject(selection) ||
    !isObject(provenance) ||
    !isObject(revisions) ||
    evidence.purpose !== 'execution' ||
    evidence.symbol !== source.symbol ||
    evidenceInputFingerprint !== source.inputFingerprint ||
    typeof identityFingerprint !== 'string' ||
    identityFingerprint.length === 0 ||
    typeof fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(fetchedAt)) ||
    typeof seriesVersion !== 'string'
  ) {
    fail('Snapshot V3 actualSource 与窗口证据 identity 不一致');
  }
  return { target, selection, provenance, revisions };
};

export const validateExecutionWindowIdentityV3 = (
  source: ExecutionSource,
  parsed: ExecutionWindowEvidence,
  context: SnapshotV3EvidenceContext,
): void => {
  const { routeKey, routeTarget } = parsed;
  const { target, selection, provenance, revisions } = validateExecutionIdentityFactsV3(
    source,
    parsed,
    context,
  );
  function fail(message: string): never {
    throw context.integrityError(message);
  }
  if (
    context.canonicalize(routeKey) !== context.canonicalize(source.routeKey) ||
    context.canonicalize(provenance) !== context.canonicalize(source.provenance) ||
    context.canonicalize(target) !== context.canonicalize(routeTarget) ||
    selection.routeIndex !== routeTarget.routeIndex ||
    (selection.source !== 'primary' && selection.source !== 'backup') ||
    target.providerId !== source.provenance.providerId ||
    target.upstreamSource !== source.provenance.upstreamSource ||
    target.routeIndex !== routeTarget.routeIndex ||
    target.routeIndex !== source.provenance.routeIndex ||
    context.canonicalize(revisions.effectivePolicyRevision) !==
      context.canonicalize(source.provenance.effectivePolicyRevision)
  ) {
    fail('Snapshot V3 actualSource 与窗口证据 identity 不一致');
  }
};
