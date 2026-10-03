import { runConfigSchemaV3, type RunConfigV3, type BacktestStrategy } from '@thesis-ledger/schemas';
import type { ArtifactRef, ArtifactRow } from './backtest-artifact-store.js';
import type { BacktestSnapshotV3BuildInput } from './backtest-snapshot-v3-builder.js';
import type { collectSnapshotDependenciesV3 } from './backtest-snapshot-v3-dependencies.js';
import type { planSnapshotInputsV3 } from './backtest-snapshot-v3-input-plan.js';
import type { LocalSnapshotV3Store } from './backtest-snapshot-v3-store.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import {
  priceInputBindingsArtifactKeyV3,
  snapshotPriceInputBindingsRowV3,
} from './backtest-snapshot-v3-completeness.js';

/** Writes the frozen artifacts in their required order; the builder owns cleanup and finalize. */
export const writeBacktestSnapshotV3Artifacts = async (
  input: BacktestSnapshotV3BuildInput,
  snapshots: LocalSnapshotV3Store,
  rows: readonly ArtifactRow[],
  evidenceRow: ArtifactRow,
  inputPlan: ReturnType<typeof planSnapshotInputsV3> | undefined,
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  dependencies: Awaited<ReturnType<typeof collectSnapshotDependenciesV3>> | undefined,
): Promise<ArtifactRef[]> => {
  const artifactRefs: ArtifactRef[] = [];
  const putSnapshotArtifact = (key: string, artifactRows: readonly ArtifactRow[]) =>
    snapshots.putArtifact(input.runId, {
      key,
      rows: artifactRows,
      artifactId: hashCanonicalManifest({ runId: input.runId, key, rows: artifactRows }),
    });
  artifactRefs.push(
    await putSnapshotArtifact('metadata/snapshot-metadata-v3.parquet', [
      {
        kind: 'snapshot-metadata-v3',
        ...(inputPlan ? { settlementCalendarPolicy: 'settlement-calendar-v1' } : {}),
        strategy: canonicalizeManifest(strategy),
        runConfig: canonicalizeManifest(runConfigSchemaV3.parse(input.runConfig)),
      },
    ]),
  );
  const parsedRunConfig = runConfigSchemaV3.parse(input.runConfig);
  if (parsedRunConfig.executionModel) {
    artifactRefs.push(
      await putSnapshotArtifact('metadata/execution-model-v3.parquet', [
        {
          kind: 'execution-model-v3',
          model: canonicalizeManifest(parsedRunConfig.executionModel),
        },
      ]),
    );
  }
  artifactRefs.push(await putSnapshotArtifact('execution/bars.parquet', rows));
  artifactRefs.push(
    await putSnapshotArtifact('metadata/market-window-evidence-v3.parquet', [evidenceRow]),
  );
  if (dependencies) {
    artifactRefs.push(
      await putSnapshotArtifact(priceInputBindingsArtifactKeyV3, [
        snapshotPriceInputBindingsRowV3({ strategy, runConfig }),
      ]),
    );
    for (const dependency of dependencies.artifacts) {
      artifactRefs.push(await putSnapshotArtifact(dependency.key, dependency.rows));
    }
  }
  return artifactRefs;
};
