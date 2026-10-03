import {
  backtestResultSchemaV3,
  runConfigSchemaV3,
  strategySchema,
  type BacktestResultV3,
  type BacktestSnapshotManifestV3,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import type { ArtifactRef, ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import type { LocalSnapshotStore } from './backtest-snapshot.js';
import type { ExchangeVerticalResult } from './backtest-v2-execution-shared.js';
import { runExchangeVertical } from './backtest-v2-execution-exchange.js';
import { skippedBacktestTradingDatesV3 } from './backtest-v3-tradability.js';
import { buildBacktestV3Benchmark } from './backtest-v3-benchmark.js';

export interface BacktestV3RunnerInput {
  runId: string;
  snapshotRef: { snapshotId: string; contentHash: string };
  artifactRefs: readonly ArtifactRef[];
}

export interface BacktestV3Runner {
  readonly id: string;
  run(input: BacktestV3RunnerInput, signal: AbortSignal): Promise<BacktestResultV3>;
}

export const BACKTEST_V3_RUNNER = Symbol('BACKTEST_V3_RUNNER');

export class BacktestV3RejectedOrderProjectionError extends Error {
  readonly code = 'V3_REJECTED_ORDER_IDENTITY_UNAVAILABLE';
  readonly rejects: ExchangeVerticalResult['rejects'];

  constructor(rejects: ExchangeVerticalResult['rejects']) {
    const details = rejects
      .map(({ orderId, code, reason }) => `${code}${orderId ? ` (${orderId})` : ''}: ${reason}`)
      .join('; ');
    super(`V3 Runner cannot safely project rejected-order identity: ${details}`);
    this.name = 'BacktestV3RejectedOrderProjectionError';
    this.rejects = rejects;
  }
}

export const projectV3SimulationRejects = (
  rejects: ExchangeVerticalResult['rejects'],
  executionSymbol: string,
) => {
  const rejectedOrders: BacktestResultV3['rejectedOrders'] = [];
  const warnings: string[] = [];
  const identityMissing: ExchangeVerticalResult['rejects'][number][] = [];
  for (const reject of rejects) {
    const orderId =
      typeof reject.orderId === 'string' && reject.orderId.trim().length > 0
        ? reject.orderId
        : undefined;
    const side = reject.side === 'buy' || reject.side === 'sell' ? reject.side : undefined;
    if (!orderId && !side) {
      warnings.push(
        `模拟诊断 ${reject.rejectionId ?? 'ID未知'} ${reject.code} @ ${reject.occurredAt}: ${reject.reason}`,
      );
      continue;
    }
    if (!orderId || !side) {
      identityMissing.push(reject);
      continue;
    }
    rejectedOrders.push({
      orderId,
      executionSymbol,
      side,
      reasonCode: reject.code,
      message: reject.reason,
      occurredAt: reject.occurredAt,
    });
  }
  if (identityMissing.length > 0) {
    throw new BacktestV3RejectedOrderProjectionError(identityMissing);
  }
  return { rejectedOrders, warnings };
};

const assertNotAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new Error('回测已取消');
};

const same = (left: unknown, right: unknown): boolean =>
  canonicalizeManifest(left) === canonicalizeManifest(right);

const parseMetadataJson = (row: ArtifactRow, field: string): unknown => {
  const value = row[field];
  if (typeof value !== 'string') throw new Error(`V3 Snapshot metadata 缺少 ${field}`);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`V3 Snapshot metadata ${field} 不是有效 JSON`);
  }
};

const assertExactArtifactRefs = (
  inputRefs: readonly ArtifactRef[],
  manifestRefs: readonly ArtifactRef[],
): void => {
  const suppliedByKey = new Map(inputRefs.map((artifact) => [artifact.key, artifact]));
  if (suppliedByKey.size !== inputRefs.length) {
    throw new Error('V3 Runner ArtifactRefs 包含重复 key');
  }
  const expectedByKey = new Map(manifestRefs.map((artifact) => [artifact.key, artifact]));
  if (expectedByKey.size !== manifestRefs.length || suppliedByKey.size !== expectedByKey.size) {
    throw new Error('V3 Runner ArtifactRefs 必须与 finalized Snapshot 完全一致');
  }
  for (const [key, expected] of expectedByKey) {
    const supplied = suppliedByKey.get(key);
    if (!supplied || !same(supplied, expected)) {
      throw new Error(`V3 Runner ArtifactRef 不属于 finalized Snapshot: ${key}`);
    }
  }
};

const readArtifactRows = async (
  snapshots: LocalSnapshotStore,
  refs: readonly ArtifactRef[],
  signal: AbortSignal,
): Promise<Map<string, ArtifactRow[]>> => {
  const rowsByArtifact = new Map<string, ArtifactRow[]>();
  for (const artifact of refs) {
    assertNotAborted(signal);
    const rows: ArtifactRow[] = [];
    for await (const row of await snapshots.artifacts.openRead(artifact)) {
      assertNotAborted(signal);
      rows.push(row);
    }
    rowsByArtifact.set(artifact.key, rows);
  }
  return rowsByArtifact;
};

const readStrictMetadata = (
  manifest: BacktestSnapshotManifestV3,
  metadataRows: readonly ArtifactRow[],
): { strategy: BacktestStrategy; runConfig: RunConfigV3 } => {
  if (metadataRows.length !== 1 || metadataRows[0]?.kind !== 'snapshot-metadata-v3') {
    throw new Error('V3 Snapshot metadata Artifact 结构无效');
  }
  const parsedStrategy = strategySchema.parse(parseMetadataJson(metadataRows[0], 'strategy'));
  const strategy: BacktestStrategy = {
    ...parsedStrategy,
    entry: parsedStrategy.entry as BacktestStrategy['entry'],
    exit: parsedStrategy.exit as BacktestStrategy['exit'],
    execution: parsedStrategy.execution as BacktestStrategy['execution'],
  };
  const runConfig = runConfigSchemaV3.parse(parseMetadataJson(metadataRows[0], 'runConfig'));
  if (hashCanonicalManifest(strategy) !== manifest.strategyVersionHash) {
    throw new Error('V3 Snapshot strategy metadata 与 strategyVersionHash 不一致');
  }
  if (
    hashCanonicalManifest(runConfig) !== manifest.runConfigChecksum ||
    runConfig.dataAsOf !== manifest.dataAsOf ||
    runConfig.startDate !== manifest.dateRange.startDate ||
    runConfig.endDate !== manifest.dateRange.endDate ||
    !same(runConfig.executionPriceProtocol, manifest.executionPriceProtocol)
  ) {
    throw new Error('V3 Snapshot RunConfig metadata 与冻结 manifest 身份不一致');
  }
  return { strategy, runConfig };
};

export class LocalSnapshotV3Runner implements BacktestV3Runner {
  readonly id = 'thesis-ledger-v3-local-runner-v2';

  constructor(private readonly snapshots: LocalSnapshotStore) {}

  async run(input: BacktestV3RunnerInput, signal: AbortSignal): Promise<BacktestResultV3> {
    assertNotAborted(signal);
    const manifest = await this.snapshots.v3.replay(input.runId);
    assertNotAborted(signal);
    if (manifest.status !== 'finalized' || manifest.quality.completeness !== 'complete') {
      throw new Error('V3 Runner 只执行 finalized complete Snapshot');
    }
    if (manifest.runId !== input.runId) {
      throw new Error('V3 Runner Snapshot runId 不匹配');
    }
    if (
      input.snapshotRef.snapshotId !== manifest.contentHash ||
      input.snapshotRef.contentHash !== manifest.contentHash
    ) {
      throw new Error('V3 Snapshot contentHash 不匹配');
    }
    assertExactArtifactRefs(input.artifactRefs, manifest.artifacts);

    const rowsByArtifact = await readArtifactRows(this.snapshots, manifest.artifacts, signal);
    const metadataKey = `${manifest.runId}/metadata/snapshot-metadata-v3.parquet`;
    const { strategy, runConfig } = readStrictMetadata(
      manifest,
      rowsByArtifact.get(metadataKey) ?? [],
    );
    assertNotAborted(signal);

    const skippedTradingDates = skippedBacktestTradingDatesV3(
      strategy,
      runConfig,
      rowsByArtifact,
      manifest.runId,
    );
    const vertical = runExchangeVertical({
      runId: manifest.runId,
      strategyVersionId: manifest.strategyVersionId,
      snapshotId: manifest.contentHash,
      strategy,
      runConfig,
      rows: rowsByArtifact,
      artifacts: manifest.artifacts,
      engineVersion: this.id,
      marketRuleVersion: manifest.marketRuleVersion,
      calendarVersion: manifest.calendarVersion,
      aggregationVersion: manifest.aggregationVersion,
    });
    assertNotAborted(signal);
    const projectedRejects = projectV3SimulationRejects(
      vertical.rejects,
      strategy.executionInstrument.symbol,
    );
    const benchmark = buildBacktestV3Benchmark({
      runConfig,
      strategy,
      manifest,
      rows: rowsByArtifact,
      analytics: vertical.analytics,
      skippedTradingDates,
    });
    const hasUnavailableBenchmarkMetric = Object.values(benchmark.benchmark).some(
      (metric) => metric.status !== 'available',
    );
    let completeness = vertical.analytics.completeness;
    if (completeness !== 'unavailable' && hasUnavailableBenchmarkMetric) {
      completeness = 'partial';
    }

    const resultPayload = {
      source: 'BACKTEST' as const,
      runId: manifest.runId,
      strategyVersionId: manifest.strategyVersionId,
      snapshotId: manifest.contentHash,
      engineVersion: this.id,
      schemaVersion: '3' as const,
      snapshotVersion: 'snapshot-manifest-v3' as const,
      marketRuleVersion: manifest.marketRuleVersion,
      calendarVersion: manifest.calendarVersion,
      aggregationVersion: manifest.aggregationVersion,
      contentHash: manifest.contentHash,
      completeness,
      ...(runConfig.executionModel && manifest.executionModel
        ? {
            executionModelDisclosure: {
              model: runConfig.executionModel,
              contentHash: manifest.executionModel.contentHash,
            },
          }
        : {}),
      executionPriceProtocol: manifest.executionPriceProtocol,
      comparableDataFingerprint: manifest.comparableDataFingerprint,
      actualSources: manifest.actualSources,
      warnings: [
        ...(skippedTradingDates.length
          ? [`按冻结逐日状态跳过 ${skippedTradingDates.length} 个缺 Bar 交易日。`]
          : []),
        ...vertical.analytics.warnings,
        ...projectedRejects.warnings,
        ...benchmark.warnings,
      ],
      rejectedOrders: projectedRejects.rejectedOrders,
      simulationFills: vertical.fills.map((fill) => ({ ...fill, charges: [...fill.charges] })),
      trades: vertical.trades,
      equityCurve: vertical.analytics.equityCurve,
      drawdownCurve: vertical.analytics.drawdownCurve,
      metrics: vertical.analytics.metrics,
      benchmark: benchmark.benchmark,
      benchmarkCompatibility: benchmark.benchmarkCompatibility,
    };

    assertNotAborted(signal);
    return backtestResultSchemaV3.parse({
      ...resultPayload,
      resultChecksum: deterministicResultChecksum(resultPayload),
    });
  }
}
