import { runConfigSchemaV3, statusCompositionArtifactKeyV1, type BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import type { ArtifactRef, ArtifactRow, LocalArtifactStore } from './backtest-artifact-store.js';
import { validateSnapshotExecutionEvidenceV3 } from './backtest-snapshot-v3-execution-evidence.js';
import { validateCompleteSnapshotInputsV3 } from './backtest-snapshot-v3-completeness.js';
import { readSnapshotStatusCompositionV1 } from './backtest-status-composition-v1.js';

interface SnapshotValidationDependenciesV3 {
  artifacts: LocalArtifactStore;
  canonicalize: (value: unknown) => string;
  hash: (value: unknown) => string;
  integrityError: (message: string) => Error;
}

export const readSnapshotArtifactRowsV3 = async (
  artifacts: LocalArtifactStore,
  ref: ArtifactRef,
): Promise<ArtifactRow[]> => {
  const rows: ArtifactRow[] = [];
  for await (const row of await artifacts.openRead(ref)) rows.push(row);
  return rows;
};

/** 统一冻结和重放的执行证据与完整输入校验。 */
export const validateSnapshotInputsV3 = async (
  manifest: BacktestSnapshotManifestV3,
  artifacts: readonly ArtifactRef[],
  dependencies: SnapshotValidationDependenciesV3,
): Promise<void> => {
  await validateSnapshotExecutionEvidenceV3(manifest, artifacts, {
    ...dependencies,
    readRows: (ref) => readSnapshotArtifactRowsV3(dependencies.artifacts, ref),
  });
  try {
    const inputs = await Promise.all(artifacts.map(async (artifact) => ({
      key: artifact.key.slice(manifest.runId.length + 1),
      rows: await readSnapshotArtifactRowsV3(dependencies.artifacts, artifact),
    })));
    const compositionRows = inputs.find((input) => input.key === statusCompositionArtifactKeyV1)?.rows ?? [];
    if (manifest.statusComposition || compositionRows.length) {
      const metadata = inputs.find((input) => input.key === 'metadata/snapshot-metadata-v3.parquet')?.rows;
      if (metadata?.length !== 1 || typeof metadata[0]?.runConfig !== 'string') throw new Error('组合冻结缺少唯一运行配置');
      readSnapshotStatusCompositionV1(manifest, runConfigSchemaV3.parse(JSON.parse(metadata[0].runConfig)), compositionRows);
    }
    validateCompleteSnapshotInputsV3(
      manifest,
      inputs,
    );
  } catch (error) {
    throw dependencies.integrityError(
      error instanceof Error ? error.message : 'Snapshot V3 完整输入校验失败',
    );
  }
};
