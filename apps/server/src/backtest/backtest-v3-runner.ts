import { announcementAssumptionWarnings } from './backtest-announcement-events.js';
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
import { researchAnalyticsV3Steps } from './backtest-research-analytics-v3.js';
import { advanceBacktestComputation } from '@thesis-ledger/domain';
import type { ArtifactRef, ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import type { LocalSnapshotStore } from './backtest-snapshot.js';
import type { ExchangeVerticalResult } from './backtest-v2-execution-shared.js';
import { lifecycleExecutionWarningsV3 } from './backtest-lifecycle-execution-v3.js';
import { runExchangeVerticalCooperatively } from './backtest-v2-execution-exchange.js';
import {
  skippedBacktestTradingDatesV3,
  zeroVolumeObservationWarningsV3,
  priceOnlyObservationWarningsV3,
} from './backtest-v3-tradability.js';
import { buildBacktestV3Benchmark } from './backtest-v3-benchmark.js';
import { backtestListingWarningsV3 } from './backtest-listing-disclosure-v3.js';
import { cashDividendDisclosureV3 } from './backtest-cash-dividend-disclosure-v3.js';
import { knownCashDisclosureV3 } from './backtest-known-cash-disclosure-v3.js';
import { dependencyEvidenceKey } from './backtest-snapshot-v3-dependencies.js';
import {
  readSnapshotPublicFeesV3,
  publicFeesWarningsV3,
} from './backtest-public-fees-snapshot-v3.js';
import { publicFeesArtifactKeyV3 } from '@thesis-ledger/schemas';
import { statusPriceExecutionModelV3 } from './backtest-status-price-model-v3.js';
import {
  prepareTradingStatusExecutionV3,
  tradingStatusWarningsV3,
} from './backtest-trading-status-execution-v3.js';
import {
  priceResearchFills,
  priceResearchInputWarnings,
} from './backtest-price-research-result.js';

export interface BacktestV3RunnerInput {
  runId: string;
  snapshotRef: { snapshotId: string; contentHash: string };
  artifactRefs: readonly ArtifactRef[];
}

export interface BacktestV3Runner {
  readonly id: string;
  run(input: BacktestV3RunnerInput, signal: AbortSignal, context?: BacktestV3RunnerContext): Promise<BacktestResultV3>;
}

export interface BacktestV3RunnerContext {
  snapshots: LocalSnapshotStore;
  onStage?: (stage: 'simulating' | 'analyzing') => Promise<void>;
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
  windowEndAt?: string,
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
      reasonCode:
        reject.code === 'DAY_EXPIRED' && reject.occurredAt === windowEndAt
          ? 'BACKTEST_WINDOW_ENDED'
          : reject.code,
      message:
        reject.code === 'DAY_EXPIRED' && reject.occurredAt === windowEndAt
          ? '回测窗口已结束，信号待下一交易日开盘执行；期末持仓按市值估值'
          : reject.reason,
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
  readonly id = 'thesis-ledger-v3-local-runner-v5';

  constructor(private readonly snapshots: LocalSnapshotStore) {}

  async run(input: BacktestV3RunnerInput, signal: AbortSignal, context?: BacktestV3RunnerContext): Promise<BacktestResultV3> {
    const snapshots = context?.snapshots ?? this.snapshots;
    assertNotAborted(signal);
    const manifest = await snapshots.v3.replay(input.runId);
    assertNotAborted(signal);
    assertRunnerSnapshotInput(manifest, input);

    const rowsByArtifact = await readArtifactRows(snapshots, manifest.artifacts, signal);
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
    const publicFees = readSnapshotPublicFeesV3(
      manifest,
      runConfig,
      rowsByArtifact.get(`${manifest.runId}/${publicFeesArtifactKeyV3}`) ?? [],
    );
    let executionRunConfig = publicFees?.runConfig ?? runConfig;
    const tradingStatus = prepareTradingStatusExecutionV3(manifest, runConfig, rowsByArtifact);
    if (tradingStatus.status?.disclosure.status === 'source') {
      executionRunConfig = {
        ...executionRunConfig,
        executionModel: statusPriceExecutionModelV3(
          runConfig,
          tradingStatus.status.disclosure.response,
          executionRunConfig.executionModel,
        ),
      };
    }
    await context?.onStage?.('simulating');
    const vertical = await runExchangeVerticalCooperatively({
      runId: manifest.runId,
      strategyVersionId: manifest.strategyVersionId,
      snapshotId: manifest.contentHash,
      strategy,
      runConfig: executionRunConfig,
      rows: tradingStatus.executionRows,
      artifacts: manifest.artifacts,
      engineVersion: this.id,
      marketRuleVersion: manifest.marketRuleVersion,
      calendarVersion: manifest.calendarVersion,
      aggregationVersion: manifest.aggregationVersion,
    }, { signal });
    assertNotAborted(signal);
    await context?.onStage?.('analyzing');
    const projectedRejects = projectV3SimulationRejects(
      vertical.rejects,
      strategy.executionInstrument.symbol,
      vertical.analytics.equityCurve.at(-1)?.occurredAt,
    );
    const benchmark = buildBacktestV3Benchmark({
      runConfig,
      strategy,
      manifest,
      rows: tradingStatus.benchmarkRows,
      analytics: vertical.analytics,
      skippedTradingDates: [
        ...new Set([...skippedTradingDates, ...tradingStatus.benchmarkSkippedDates]),
      ],
    });
    const hasUnavailableBenchmarkMetric = Object.values(benchmark.benchmark).some(
      (metric) => metric.status !== 'available',
    );
    let completeness = vertical.analytics.completeness;
    if (completeness !== 'unavailable' && hasUnavailableBenchmarkMetric) {
      completeness = 'partial';
    }

    const disclosures = snapshotDisclosures(runConfig, manifest, vertical, rowsByArtifact);
    const fills = priceResearchFills(manifest.runId, strategy, runConfig, rowsByArtifact, vertical.fills);
    const researchAnalytics = await advanceBacktestComputation(researchAnalyticsV3Steps(
      vertical.analytics, fills, runConfig,
      { CN: 'CNY', HK: 'HKD', US: 'USD' }[strategy.executionInstrument.market] as RunConfigV3['baseCurrency'],
      rowsByArtifact,
    ), { signal });
    const resultPayload = {
      source: 'BACKTEST' as const,
      runId: manifest.runId,
      strategyVersionId: manifest.strategyVersionId,
      snapshotId: manifest.contentHash,
      engineVersion: this.id,
      schemaVersion: 'backtest-trade-result-v1' as const,
      snapshotVersion: 'backtest-trade-snapshot-manifest-v1' as const,
      ...disclosures.research,
      marketRuleVersion: manifest.marketRuleVersion,
      calendarVersion: manifest.calendarVersion,
      aggregationVersion: manifest.aggregationVersion,
      contentHash: manifest.contentHash,
      completeness,
      ...disclosures.cash,
      ...(publicFees ? { publicFeesDisclosure: publicFees.disclosure } : {}),
      ...(tradingStatus.status ? { tradingStatusDisclosure: tradingStatus.status.disclosure } : {}),
      ...disclosures.model,
      executionPriceProtocol: manifest.executionPriceProtocol,
      comparableDataFingerprint: manifest.comparableDataFingerprint,
      actualSources: manifest.actualSources,
      warnings: [
        ...priceResearchInputWarnings(manifest.runId, strategy, runConfig, rowsByArtifact),
        ...zeroVolumeObservationWarningsV3(strategy, runConfig, rowsByArtifact, manifest.runId),
        ...priceOnlyObservationWarningsV3(strategy, runConfig, rowsByArtifact, manifest.runId),
        ...backtestListingWarningsV3(
          rowsByArtifact.get(`${manifest.runId}/metadata/market-window-evidence-v3.parquet`)?.[0],
          tradingStatus.status?.disclosure,
        ),
        ...announcementAssumptionWarnings(rowsByArtifact.get(`${manifest.runId}/${dependencyEvidenceKey}`)),
        ...publicFeesWarningsV3(publicFees?.disclosure),
        ...tradingStatusWarningsV3(tradingStatus.status?.disclosure),
        ...tradingStatus.compositionWarnings,
        ...lifecycleExecutionWarningsV3(runConfig),
        ...(skippedTradingDates.length
          ? [`按冻结逐日状态跳过 ${skippedTradingDates.length} 个缺 Bar 交易日。`]
          : []),
        ...vertical.analytics.warnings,
        ...projectedRejects.warnings,
        ...benchmark.warnings,
      ],
      rejectedOrders: projectedRejects.rejectedOrders,
      ...(vertical.dailyOrders ? { dailyOrders: vertical.dailyOrders } : {}),
      simulationFills: fills,
      trades: vertical.trades,
      equityCurve: vertical.analytics.equityCurve,
      drawdownCurve: vertical.analytics.drawdownCurve,
      ...researchAnalytics,
      ...(vertical.ruleDiagnostics ? { ruleDiagnostics: vertical.ruleDiagnostics } : {}),
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

function snapshotDisclosures(
  runConfig: RunConfigV3,
  manifest: BacktestSnapshotManifestV3,
  vertical: ExchangeVerticalResult,
  rowsByArtifact: ReadonlyMap<string, readonly ArtifactRow[]>,
) {
  return {
    research: {
      ...(runConfig.priceResearch
        ? {
            priceResearch: {
              protocolVersion: runConfig.priceResearch.protocolVersion,
              ...(manifest.priceResearch?.actualPriceSource
                ? { actualPriceSource: manifest.priceResearch.actualPriceSource }
                : {}),
              ...vertical.researchBalances,
            },
          }
        : {}),
    },
    cash: {
      ...(runConfig.knownCashPreparation
        ? { knownCashDividendDisclosure: knownCashDisclosureV3(runConfig, vertical.cashEvents) }
        : {}),
      ...(runConfig.executionPriceProtocol.cashEventResearch && !runConfig.knownCashPreparation
        ? {
            cashDividendDisclosure: cashDividendDisclosureV3(
              runConfig,
              rowsByArtifact.get(`${manifest.runId}/${dependencyEvidenceKey}`) ?? [],
              vertical.cashEvents,
            ),
          }
        : {}),
    },
    model: {
      ...(runConfig.executionModel && manifest.executionModel
        ? {
            executionModelDisclosure: {
              model: runConfig.executionModel,
              contentHash: manifest.executionModel.contentHash,
            },
          }
        : {}),
    },
  };
}

function assertRunnerSnapshotInput(
  manifest: BacktestSnapshotManifestV3,
  input: BacktestV3RunnerInput,
): asserts manifest is BacktestSnapshotManifestV3 & { contentHash: string } {
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
}
