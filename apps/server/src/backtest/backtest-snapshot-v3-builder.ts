import {
  benchmarkExecutionModelCostVersionV3,
  marketDataBarRouteKeyV3Schema,
  runConfigSchemaV3,
  strategySchema,
  validateStrategyInitialCash,
  type BacktestSnapshotManifestV3,
  type MarketDataBarRouteKeyV3,
  type RunConfigV3,
  type BacktestStrategy,
  type BacktestPreflightRevisionStampV3,
} from '@thesis-ledger/schemas';
import {
  buildCurrentSnapshotBase,
  canonicalizeManifest,
  hashCanonicalManifest,
} from './backtest-snapshot.js';
import type { ArtifactRef, ArtifactRow } from './backtest-artifact-store.js';
import { backtestResearchReadOptionsV3 } from './backtest-research-read-options-v3.js';
import { executionBarRowsV3 } from './backtest-v3-execution-bar-rows.js';
import { shareWindowBenchmarkCostVersionV3 } from './backtest-share-window-benchmark-profile-v3.js';
import { createBacktestSnapshotV3Source } from './backtest-snapshot-v3-source.js';
import type { LocalSnapshotV3Store } from './backtest-snapshot-v3-store.js';
import type { MarketBarReader } from '../market/market-bar-reader.js';
import { collectSnapshotDependenciesV3 } from './backtest-snapshot-v3-dependencies.js';
import { planSnapshotInputsV3 } from './backtest-snapshot-v3-input-plan.js';
import type { MarketLifecycleReadPortV3 } from '../market/market-lifecycle-reader-v3.js';
import type { MarketKnownCashControlResponseV3 } from '@thesis-ledger/schemas';
import { knownCashSnapshotContextV3 } from './backtest-known-cash-snapshot-v3.js';
import {
  assertLifecyclePreparationV3,
  lifecycleInputHashV3,
} from './backtest-lifecycle-preparation-v3.js';
import {
  assertActualWarmupBarsV3,
  tradabilityWindowFromResponseV3,
} from './backtest-snapshot-v3-tradability.js';
import { assertPreparedSelection } from './backtest-preparation-fence.js';
import {
  BacktestHistoricalInputErrorV3,
  backtestHistoricalExecutionPreflightFailureV3,
  type BacktestReconstructionPreflightPortV3,
} from './backtest-reconstruction-preflight-v3.js';
import { writeBacktestSnapshotV3Artifacts } from './backtest-snapshot-v3-artifact-writer.js';
import { collectSnapshotPublicFeesV3 } from './backtest-public-fees-snapshot-v3.js';
import { publicFeesArtifactKeyV3, publicFeesCompositionVersionV3 } from '@thesis-ledger/schemas';
import { tradingStatusArtifactKeyV3 } from '@thesis-ledger/schemas';
import { collectSnapshotStatusInputsV1 } from './backtest-status-composition-v1.js';
import { statusCompositionArtifactKeyV1 } from '@thesis-ledger/schemas';

export interface BacktestSnapshotV3BuildInput {
  runId: string;
  strategyVersionId: string;
  strategyVersionHash: string;
  strategy: BacktestStrategy;
  runConfig: RunConfigV3;
  executionRouteKey: MarketDataBarRouteKeyV3;
  preparationStamp?: BacktestPreflightRevisionStampV3;
  beforeFinalize?: () => Promise<void>;
}

export interface BacktestSnapshotV3BuildResult {
  manifest: BacktestSnapshotManifestV3;
  snapshotRef: { snapshotId: string; contentHash: string };
  artifactRefs: readonly ArtifactRef[];
}

const sourcePriceBasisForProtocol = (manifest: BacktestSnapshotManifestV3) =>
  Object.fromEntries(
    Object.entries(manifest.executionPriceProtocol.priceBasis).filter(
      ([key]) => key !== 'quantityBasis',
    ),
  );

const executionSymbol = (strategy: BacktestStrategy) => {
  const instrument = strategy.executionInstrument;
  return instrument.symbol;
};

const requiredAssetType = (strategy: BacktestStrategy): 'STOCK' | 'ETF' => {
  if (strategy.executionInstrument.assetType === 'stock') return 'STOCK';
  if (strategy.executionInstrument.assetType === 'etf') return 'ETF';
  throw new Error('当前 Snapshot V3 execution 写入切片仅支持股票与 ETF');
};

const assertRouteMatchesStrategy = (
  routeKey: MarketDataBarRouteKeyV3,
  strategy: BacktestStrategy,
  protocolAdjustment: string,
): void => {
  if (strategy.primaryTimeframe !== '1d') {
    throw new Error('当前 MarketBarReader V3 execution 写入切片仅支持日线');
  }
  if (
    routeKey.market !== strategy.executionInstrument.market ||
    routeKey.assetType !== requiredAssetType(strategy) ||
    routeKey.timeframe !== '1d' ||
    routeKey.adjustment !== protocolAdjustment
  ) {
    throw new Error('预先确定的 V3 execution RouteKey 与策略标的或价格协议不一致');
  }
};

const buildBuildingManifest = (input: BacktestSnapshotV3BuildInput): BacktestSnapshotManifestV3 => {
  strategySchema.parse(input.strategy);
  const strategy = input.strategy;
  const runConfig = runConfigSchemaV3.parse(input.runConfig);
  const inputPlan = runConfig.priceInputBindings
    ? planSnapshotInputsV3({ strategy, runConfig })
    : undefined;
  const validation = validateStrategyInitialCash(strategy, runConfig);
  if (!validation.valid) {
    throw new Error(validation.errors.map((error) => error.message).join('; '));
  }
  const base = buildCurrentSnapshotBase(strategy, runConfig);
  const routeKey = marketDataBarRouteKeyV3Schema.parse(input.executionRouteKey);
  assertRouteMatchesStrategy(
    routeKey,
    strategy,
    runConfig.executionPriceProtocol.priceBasis.adjustment,
  );
  if (runConfig.endDate > runConfig.dataAsOf.slice(0, 10)) {
    throw new Error('RunConfig endDate 不能晚于 dataAsOf');
  }

  return {
    manifestVersion: 'snapshot-manifest-v3',
    benchmarkCostVersion: benchmarkExecutionModelCostVersionV3,
    runId: input.runId,
    strategyVersionId: input.strategyVersionId,
    strategyVersionHash: input.strategyVersionHash,
    dataAsOf: runConfig.dataAsOf,
    runConfigChecksum: hashCanonicalManifest(runConfig),
    ...(runConfig.executionModel
      ? {
          executionModel: {
            schemaVersion: 'execution-model-v1' as const,
            id: runConfig.executionModel.id,
            version: runConfig.executionModel.version,
            contentHash: hashCanonicalManifest(runConfig.executionModel),
            artifactKey: `${input.runId}/metadata/execution-model-v3.parquet`,
          },
        }
      : {}),
    executionPriceProtocol: runConfig.executionPriceProtocol,
    ...(runConfig.frozenExecutionWindow
      ? { frozenExecutionWindow: runConfig.frozenExecutionWindow }
      : {}),
    actualSources: [],
    aggregationVersion: base.aggregationVersion,
    marketRuleVersion: base.marketRuleVersion,
    calendarVersion: base.calendarVersion,
    corporateActionVersion: base.corporateActionVersion,
    availabilitySemanticsVersion: base.availabilitySemanticsVersion,
    // Only non-price response revisions enter this map. V3 price provenance is
    // frozen separately and must never acquire a fabricated providerRevision.
    providerRevisions: {},
    dependencyClosure: inputPlan?.dependencyClosure ?? base.dependencyClosure,
    dateRange: {
      ...base.dateRange,
      warmupStartDate: inputPlan?.warmup.startDate ?? base.dateRange.warmupStartDate,
    },
    warmup: inputPlan?.warmup ?? base.warmup,
    quality: inputPlan ? { completeness: 'complete', warnings: [] } : base.quality,
    artifacts: [],
    status: 'building',
  };
};

const assertExistingSnapshotMatches = (
  existing: BacktestSnapshotManifestV3,
  input: BacktestSnapshotV3BuildInput,
  plannedRouteKey: MarketDataBarRouteKeyV3,
  expectedSymbol: string,
): void => {
  const executionSource = existing.actualSources.find((source) => source.purpose === 'execution');
  if (
    existing.runId !== input.runId ||
    existing.strategyVersionId !== input.strategyVersionId ||
    existing.strategyVersionHash !== input.strategyVersionHash ||
    existing.runConfigChecksum !==
      hashCanonicalManifest(runConfigSchemaV3.parse(input.runConfig)) ||
    !executionSource ||
    executionSource.symbol !== expectedSymbol ||
    canonicalizeManifest(executionSource.routeKey) !== canonicalizeManifest(plannedRouteKey)
  ) {
    throw new Error(`Finalized Snapshot V3 identity mismatch: ${input.runId}`);
  }
};

const replayResult = (manifest: BacktestSnapshotManifestV3): BacktestSnapshotV3BuildResult => {
  if (!manifest.contentHash) throw new Error('Snapshot V3 contentHash 缺失');
  return {
    manifest,
    snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
    artifactRefs: manifest.artifacts,
  };
};

const assertExecutionWindowMatchesProtocol = (
  readResult: Extract<Awaited<ReturnType<MarketBarReader['readV3']>>, { status: 'selected' }>,
  initialManifest: BacktestSnapshotManifestV3,
): void => {
  if (
    initialManifest.frozenExecutionWindow &&
    canonicalizeManifest(readResult.frozenWindowRef) !==
      canonicalizeManifest(initialManifest.frozenExecutionWindow)
  ) {
    throw new Error('V3 execution 行情未使用指定的冻结窗口');
  }
  const sourcePriceBasis = readResult.selection.response.sourcePriceBasis;
  if (
    canonicalizeManifest(sourcePriceBasis) !==
    canonicalizeManifest(sourcePriceBasisForProtocol(initialManifest))
  ) {
    throw new Error('V3 execution 来源价格事实与 RunConfig 价格协议不一致');
  }
};

export const buildBacktestSnapshotV3 = async (
  input: BacktestSnapshotV3BuildInput,
  snapshots: LocalSnapshotV3Store,
  bars: Pick<MarketBarReader, 'readV3'>,
  dsa?: Parameters<typeof collectSnapshotDependenciesV3>[1],
  reconstruction?: BacktestReconstructionPreflightPortV3,
  lifecycle?: MarketLifecycleReadPortV3,
  knownCashCheck?: () => Promise<MarketKnownCashControlResponseV3>,
): Promise<BacktestSnapshotV3BuildResult> => {
  const initialManifest = buildBuildingManifest(input);
  const strategy = input.strategy;
  const routeKey = marketDataBarRouteKeyV3Schema.parse(input.executionRouteKey);
  const symbol = executionSymbol(strategy);
  const existing = await snapshots.load(input.runId, true);
  if (existing?.status === 'finalized') {
    assertExistingSnapshotMatches(existing, input, routeKey, symbol);
    return replayResult(await snapshots.replay(input.runId));
  }
  if (typeof bars.readV3 !== 'function') throw new Error('MarketBarReader V3 未注入');
  const cashContext = knownCashSnapshotContextV3(
    input.runConfig.knownCashPreparation,
    knownCashCheck,
  );
  await cashContext.read();

  const window = {
    start: initialManifest.dateRange.warmupStartDate,
    end: initialManifest.dateRange.endDate,
  };
  if (input.runConfig.lifecyclePreparation) {
    if (!lifecycle) throw new Error('生命周期准备冻结缺少当前来源复核端口');
    const prepared = input.runConfig.lifecyclePreparation;
    const current = await lifecycle.read({
      market: 'CN',
      symbol,
      start: prepared.response.range.start,
      end: prepared.response.range.end,
    });
    if (prepared.inputHash !== lifecycleInputHashV3(current))
      throw new Error('生命周期准备输入变化，请重新准备');
  }
  const readResult = await bars.readV3({
    market: routeKey.market,
    symbol,
    routeKey,
    window,
    ...backtestResearchReadOptionsV3(routeKey.market, initialManifest.executionPriceProtocol),
    ...(initialManifest.frozenExecutionWindow
      ? {
          frozenWindowRef: initialManifest.frozenExecutionWindow,
          warmup: {
            analysisStart:
              input.runConfig.lifecyclePreparation?.signalStartDate ??
              initialManifest.dateRange.startDate,
            minimumSessions: initialManifest.warmup.lookbackPeriods,
          },
        }
      : {}),
  });
  const sourceOutput = createBacktestSnapshotV3Source(
    { purpose: 'execution', symbol, routeKey, window },
    readResult,
  );
  if (input.preparationStamp) assertPreparedSelection(input.preparationStamp, readResult);
  if (readResult.status !== 'selected') throw new Error('V3 execution 行情窗口未 selected');
  assertExecutionWindowMatchesProtocol(readResult, initialManifest);
  assertActualWarmupBarsV3(
    readResult.selection.response,
    input.runConfig.lifecyclePreparation?.signalStartDate ?? initialManifest.dateRange.startDate,
    initialManifest.warmup.lookbackPeriods,
  );

  const rows = executionBarRowsV3(
    readResult.selection.response,
    symbol,
    initialManifest.executionPriceProtocol,
  );
  if (rows.length === 0) throw new Error('V3 execution Snapshot 未返回完整 Bar 数据');
  const runConfig = runConfigSchemaV3.parse(input.runConfig);
  cashContext.assertPriceRevisions(readResult.evidence);
  const historyFailure = await backtestHistoricalExecutionPreflightFailureV3(
    {
      request: readResult.request,
      response: readResult.selection.response,
      seriesVersion: readResult.seriesVersion,
      dataAsOf: runConfig.dataAsOf,
      fetchedAt: readResult.evidence.fetchedAt,
    },
    runConfig,
    reconstruction,
  );
  if (historyFailure) throw new BacktestHistoricalInputErrorV3(historyFailure);
  assertLifecyclePreparationV3(
    runConfig,
    readResult.selection.response.bars,
    initialManifest.warmup.lookbackPeriods,
  );
  const publicFees = await collectSnapshotPublicFeesV3(runConfig, dsa);
  const { statusComposition, tradingStatus } = await collectSnapshotStatusInputsV1(runConfig, dsa);
  const inputPlan = runConfig.priceInputBindings
    ? planSnapshotInputsV3({ strategy, runConfig })
    : undefined;
  if (inputPlan && !dsa) throw new Error('V3 完整冻结缺少非价格依赖读取器');
  const dependencies =
    inputPlan && dsa
      ? await collectSnapshotDependenciesV3(
          {
            strategy,
            runConfig,
            plan: inputPlan.plan,
            tradabilityWindow: tradabilityWindowFromResponseV3(readResult.selection.response),
            settlementCalendarPolicy: 'settlement-calendar-v1',
            eventRevisions: {
              desiredRevision: readResult.evidence.desiredRevision,
              effectivePolicyRevision: readResult.evidence.effectivePolicyRevision,
              catalogRevision: readResult.evidence.catalogRevision,
            },
          },
          dsa,
        )
      : undefined;
  const evidenceRow: ArtifactRow = {
    ...sourceOutput.evidenceRow,
    barRowsFingerprint: hashCanonicalManifest(rows),
    ...(readResult.frozenWindowRef
      ? { frozenWindowRef: JSON.stringify(readResult.frozenWindowRef) }
      : {}),
  };
  const knownCash = await cashContext.read();
  const manifest = {
    ...initialManifest,
    benchmarkCostVersion: shareWindowBenchmarkCostVersionV3(
      initialManifest.executionPriceProtocol,
      sourceOutput.actualSource,
    ),
    ...(statusComposition ? { statusComposition: { artifactKey: `${input.runId}/${statusCompositionArtifactKeyV1}`, freezeVersion: statusComposition.freezeVersion } } : {}),
    ...(tradingStatus
      ? {
          tradingStatus: {
            artifactKey: `${input.runId}/${tradingStatusArtifactKeyV3}`,
            freezeVersion: tradingStatus.freezeVersion,
          },
        }
      : {}),
    ...(publicFees
      ? {
          publicFees: {
            artifactKey: `${input.runId}/${publicFeesArtifactKeyV3}`,
            compositionVersion: publicFeesCompositionVersionV3,
          },
        }
      : {}),
    actualSources: inputPlan
      ? [...new Set(inputPlan.priceInputs.map((alias) => alias.purpose))].map((purpose) => ({
          ...sourceOutput.actualSource,
          purpose,
        }))
      : [sourceOutput.actualSource],
    ...cashContext.manifest,
    providerRevisions: {
      ...(dependencies?.providerRevisions ?? {}),
      ...cashContext.providerRevisions,
    },
  } satisfies BacktestSnapshotManifestV3;

  const building = await snapshots.startBuild(manifest);
  if (building.status === 'finalized') return replayResult(await snapshots.replay(input.runId));
  try {
    const artifactRefs = await writeBacktestSnapshotV3Artifacts(
      input,
      snapshots,
      rows,
      evidenceRow,
      inputPlan,
      strategy,
      runConfig,
      dependencies,
      publicFees,
      tradingStatus,
      knownCash,
      statusComposition,
    );
    await input.beforeFinalize?.();
    await cashContext.read();
    if (runConfig.lifecyclePreparation && lifecycle) {
      const prepared = runConfig.lifecyclePreparation;
      const current = await lifecycle.read({
        market: 'CN',
        symbol,
        start: prepared.response.range.start,
        end: prepared.response.range.end,
      });
      assertLifecyclePreparationV3(
        runConfig,
        readResult.selection.response.bars,
        initialManifest.warmup.lookbackPeriods,
        current,
      );
    }
    const finalized = await snapshots.finalize(input.runId, building, artifactRefs);
    return replayResult(finalized);
  } catch (error) {
    await snapshots.deleteRun(input.runId).catch(() => undefined);
    throw error;
  }
};
