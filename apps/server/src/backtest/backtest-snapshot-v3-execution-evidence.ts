import type { BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import type { ArtifactRef, ArtifactRow } from './backtest-artifact-store.js';
import {
  validateExecutionMetadataV3,
  validateExecutionModelEvidenceV3,
} from './backtest-snapshot-v3-execution-metadata.js';
import {
  parseExecutionWindowEvidenceV3,
  validateExecutionWindowCoverageV3,
} from './backtest-snapshot-v3-execution-window.js';
import { validateExecutionWindowIdentityV3 } from './backtest-snapshot-v3-execution-identity.js';
import { validateExecutionBarsEvidenceV3 } from './backtest-snapshot-v3-execution-bars.js';

export interface SnapshotV3EvidenceContext {
  readRows: (ref: ArtifactRef) => Promise<ArtifactRow[]>;
  canonicalize: (value: unknown) => string;
  hash: (value: unknown) => string;
  integrityError: (message: string) => Error;
}

const v3MetadataKey = (runId: string) => `${runId}/metadata/snapshot-metadata-v3.parquet`;
const v3EvidenceKey = (runId: string) => `${runId}/metadata/market-window-evidence-v3.parquet`;
const v3ExecutionBarsKey = (runId: string) => `${runId}/execution/bars.parquet`;

export const validateSnapshotExecutionEvidenceV3 = async (
  manifest: BacktestSnapshotManifestV3,
  artifacts: readonly ArtifactRef[],
  context: SnapshotV3EvidenceContext,
): Promise<void> => {
  function fail(message: string): never {
    throw context.integrityError(message);
  }
  const executionSources = manifest.actualSources.filter(
    (source) => source.purpose === 'execution',
  );
  if (
    executionSources.length !== 1 ||
    (manifest.quality.completeness !== 'complete' && manifest.actualSources.length !== 1)
  ) {
    fail('Snapshot V3 要求唯一 execution actualSource');
  }
  const source = executionSources[0]!;
  const executionRouteKey = source.routeKey;
  if (executionRouteKey.kind !== 'bar')
    fail('Snapshot V3 execution source must use a bar RouteKey');
  const refFor = (key: string) => artifacts.find((artifact) => artifact.key === key);
  const metadataRef = refFor(v3MetadataKey(manifest.runId));
  const evidenceRef = refFor(v3EvidenceKey(manifest.runId));
  const barsRef = refFor(v3ExecutionBarsKey(manifest.runId));
  if (!metadataRef || !evidenceRef || !barsRef) {
    fail('Snapshot V3 缺少 metadata、execution bars 或窗口证据 Artifact');
  }

  const [metadataRows, evidenceRows, barsRows] = await Promise.all([
    context.readRows(metadataRef),
    context.readRows(evidenceRef),
    context.readRows(barsRef),
  ]);
  const config = validateExecutionMetadataV3(manifest, metadataRows, context);
  if (manifest.executionModel) {
    await validateExecutionModelEvidenceV3(manifest, artifacts, config, context);
  } else if (config.executionModel) {
    fail('Snapshot V3 RunConfig 有 executionModel 但 manifest 未冻结引用');
  }
  const parsed = parseExecutionWindowEvidenceV3(
    manifest,
    config,
    source,
    evidenceRows,
    barsRows,
    context,
  );
  validateExecutionWindowIdentityV3(source, parsed, context);
  validateExecutionWindowCoverageV3(manifest, source, executionRouteKey, parsed, context);
  validateExecutionBarsEvidenceV3(
    manifest,
    source,
    executionRouteKey,
    parsed.evidence,
    barsRows,
    parsed.coverageProof,
    context,
  );
};
