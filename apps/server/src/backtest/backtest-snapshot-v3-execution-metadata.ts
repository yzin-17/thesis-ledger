import {
  backtestExecutionModelSchemaV3,
  runConfigSchemaV3,
  strategySchema,
} from '@thesis-ledger/schemas';
import type { BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import type { ArtifactRef, ArtifactRow } from './backtest-artifact-store.js';
import type { SnapshotV3EvidenceContext } from './backtest-snapshot-v3-execution-evidence.js';

type RunConfig = ReturnType<typeof runConfigSchemaV3.parse>;

export const validateExecutionMetadataV3 = (
  manifest: BacktestSnapshotManifestV3,
  rows: ArtifactRow[],
  context: SnapshotV3EvidenceContext,
): RunConfig => {
  function fail(message: string): never {
    throw context.integrityError(message);
  }
  if (
    rows.length !== 1 ||
    rows[0]?.kind !== 'snapshot-metadata-v3' ||
    typeof rows[0]?.runConfig !== 'string' ||
    typeof rows[0]?.strategy !== 'string'
  ) {
    fail('Snapshot V3 metadata Artifact 结构无效');
  }
  let config: ReturnType<typeof runConfigSchemaV3.parse>;
  try {
    config = runConfigSchemaV3.parse(JSON.parse(rows[0].runConfig) as unknown);
    strategySchema.parse(JSON.parse(rows[0].strategy) as unknown);
  } catch {
    fail('Snapshot V3 metadata 中的策略或 RunConfig 无效');
  }
  if (
    context.hash(config) !== manifest.runConfigChecksum ||
    config.dataAsOf !== manifest.dataAsOf ||
    config.startDate !== manifest.dateRange.startDate ||
    config.endDate !== manifest.dateRange.endDate
  ) {
    fail('Snapshot V3 metadata 与冻结 manifest 身份不一致');
  }
  return config;
};

export const validateExecutionModelEvidenceV3 = async (
  manifest: BacktestSnapshotManifestV3,
  artifacts: readonly ArtifactRef[],
  config: RunConfig,
  context: SnapshotV3EvidenceContext,
): Promise<void> => {
  function fail(message: string): never {
    throw context.integrityError(message);
  }
  if (manifest.executionModel) {
    if (
      manifest.executionModel.artifactKey !==
      `${manifest.runId}/metadata/execution-model-v3.parquet`
    ) {
      fail('Snapshot V3 executionModel Artifact 路径无效');
    }
    const modelRef = artifacts.find(
      (artifact) => artifact.key === manifest.executionModel?.artifactKey,
    );
    if (!modelRef || !config.executionModel) {
      fail('Snapshot V3 executionModel 或其 Artifact 缺失');
    }
    const modelRows = await context.readRows(modelRef);
    if (
      modelRows.length !== 1 ||
      modelRows[0]?.kind !== 'execution-model-v3' ||
      typeof modelRows[0]?.model !== 'string'
    ) {
      fail('Snapshot V3 executionModel Artifact 结构无效');
    }
    const model = backtestExecutionModelSchemaV3.parse(JSON.parse(modelRows[0].model) as unknown);
    if (
      context.hash(model) !== manifest.executionModel.contentHash ||
      context.hash(model) !== context.hash(config.executionModel) ||
      model.id !== manifest.executionModel.id ||
      model.version !== manifest.executionModel.version ||
      model.schemaVersion !== manifest.executionModel.schemaVersion
    ) {
      fail('Snapshot V3 executionModel 内容或 RunConfig 不一致');
    }
  } else if (config.executionModel) {
    fail('Snapshot V3 RunConfig 有 executionModel 但 manifest 未冻结引用');
  }
};
