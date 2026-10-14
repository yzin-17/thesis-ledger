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
import { publicFeesArtifactKeyV3, type BacktestPublicFeesSnapshotV3 } from '@thesis-ledger/schemas';
import { publicFeesArtifactRowsV3 } from './backtest-public-fees-snapshot-v3.js';
import {
  tradingStatusArtifactKeyV3,
  type BacktestTradingStatusSnapshotV3,
} from '@thesis-ledger/schemas';
import { tradingStatusArtifactRowsV3 } from './backtest-trading-status-snapshot-v3.js';
import { statusCompositionArtifactKeyV1, type BacktestStatusCompositionV1 } from '@thesis-ledger/schemas';
import { statusCompositionArtifactRowsV1 } from './backtest-status-composition-v1.js';
import {
  knownCashMetadataKeyV3,
  knownCashRecordsKeyV3,
  type knownCashSnapshotRowsV3,
} from './backtest-known-cash-snapshot-v3.js';

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
  publicFees?: BacktestPublicFeesSnapshotV3,
  tradingStatus?: BacktestTradingStatusSnapshotV3,
  knownCash?: ReturnType<typeof knownCashSnapshotRowsV3>,
  statusComposition?: BacktestStatusCompositionV1,
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
  if (knownCash) {
    artifactRefs.push(await putSnapshotArtifact(knownCashMetadataKeyV3, knownCash.metadata));
    artifactRefs.push(await putSnapshotArtifact(knownCashRecordsKeyV3, knownCash.records));
  }
  if (publicFees) {
    artifactRefs.push(
      await putSnapshotArtifact(publicFeesArtifactKeyV3, publicFeesArtifactRowsV3(publicFees)),
    );
  }
  artifactRefs.push(
    await putSnapshotArtifact('metadata/market-window-evidence-v3.parquet', [evidenceRow]),
  );
  if (tradingStatus) {
    artifactRefs.push(
      await putSnapshotArtifact(
        tradingStatusArtifactKeyV3,
        tradingStatusArtifactRowsV3(tradingStatus),
      ),
    );
  }
  if (statusComposition) artifactRefs.push(await putSnapshotArtifact(statusCompositionArtifactKeyV1, statusCompositionArtifactRowsV1(statusComposition)));
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
