import { readAdditionalSignalPricesV3 } from './backtest-signal-price-inputs-v3.js';
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
import { planSnapshotInputsV3, snapshotExecutionRouteKeyV3 } from './backtest-snapshot-v3-input-plan.js';
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
import { readPriceResearchReference } from './backtest-price-research-input.js';

export interface BacktestSnapshotV3BuildInput {
  runId: string;
  strategyVersionId: string;
  strategyVersionHash: string;
  strategy: BacktestStrategy;
  runConfig: RunConfigV3;
  executionRouteKey: MarketDataBarRouteKeyV3;
  preparationStamp?: BacktestPreflightRevisionStampV3;
  beforeFinalize?: () => Promise<void>;
  signal?: AbortSignal;
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

const assertRouteMatchesStrategy = (
  routeKey: MarketDataBarRouteKeyV3,
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
): void => {
  if (canonicalizeManifest(routeKey) !== canonicalizeManifest(snapshotExecutionRouteKeyV3(strategy, runConfig))) {
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
    runConfig,
  );
  if (runConfig.endDate > runConfig.dataAsOf.slice(0, 10)) {
    throw new Error('RunConfig endDate 不能晚于 dataAsOf');
  }

  return {
    manifestVersion: 'backtest-trade-snapshot-manifest-v1',
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
    ...(runConfig.priceResearch
      ? { priceResearch: { protocolVersion: runConfig.priceResearch.protocolVersion,
        ...(runConfig.priceResearch.dailyObservationContract !== undefined ? { dailyObservationContract: runConfig.priceResearch.dailyObservationContract } : {}) } }
      : {}),
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
  input.signal?.throwIfAborted();
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
    await assertPreparedLifecycleSource(input.runConfig.lifecyclePreparation, symbol, lifecycle);
  }
  const readResult = await bars.readV3(
    snapshotExecutionReadRequest(input, initialManifest, routeKey, symbol, window),
  );
  input.signal?.throwIfAborted();
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
    Boolean(input.runConfig.priceResearch),
  );
  if (rows.length === 0) throw new Error('V3 execution Snapshot 未返回完整 Bar 数据');
  const runConfig = runConfigSchemaV3.parse(input.runConfig);
  const reference = await readPriceResearchReference({
    strategy,
    runConfig,
    execution: readResult,
    reader: bars,
  });
  const additionalSignals = await readAdditionalSignalPricesV3({ strategy, runConfig, reader: bars,
    warmupStart: initialManifest.dateRange.warmupStartDate, requireFrozen: true, ...(reference ? { actualBasis: reference.response.sourcePriceBasis } : {}) });
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
  const { inputPlan, dependencies } = await collectPreparedSnapshotDependencies(
    strategy,
    runConfig,
    readResult,
    dsa,
  );
  const evidenceRow: ArtifactRow = {
    ...sourceOutput.evidenceRow,
    barRowsFingerprint: hashCanonicalManifest(rows),
    ...(readResult.frozenWindowRef
      ? { frozenWindowRef: JSON.stringify(readResult.frozenWindowRef) }
      : {}),
  };
  const knownCash = await cashContext.read();
  const manifest = preparedSnapshotManifest({
    input,
    initialManifest,
    runConfig,
    reference,
    additionalSignals,
    sourceOutput,
    statusComposition,
    tradingStatus,
    publicFees,
    inputPlan,
    cashContext,
    dependencies,
  });

  const building = await snapshots.startBuild(manifest);
  input.signal?.throwIfAborted();
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
      reference,
      additionalSignals,
    );
    await input.beforeFinalize?.();
    input.signal?.throwIfAborted();
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
    await snapshots.load(input.runId, true).then((current) => {
      if (current?.status !== 'finalized') return snapshots.deleteRun(input.runId);
    }).catch(() => undefined);
    throw error;
  }
};

async function assertPreparedLifecycleSource(
  prepared: NonNullable<BacktestSnapshotV3BuildInput['runConfig']['lifecyclePreparation']>,
  symbol: string,
  lifecycle: MarketLifecycleReadPortV3 | undefined,
) {
  if (!lifecycle) throw new Error('生命周期准备冻结缺少当前来源复核端口');
  const current = await lifecycle.read({
    market: 'CN',
    symbol,
    start: prepared.response.range.start,
    end: prepared.response.range.end,
  });
  if (prepared.inputHash !== lifecycleInputHashV3(current))
    throw new Error('生命周期准备输入变化，请重新准备');
}
function snapshotExecutionReadRequest(
  input: BacktestSnapshotV3BuildInput,
  initialManifest: BacktestSnapshotManifestV3,
  routeKey: ReturnType<typeof marketDataBarRouteKeyV3Schema.parse>,
  symbol: string,
  window: { start: string; end: string },
): Parameters<MarketBarReader['readV3']>[0] {
  return {
    market: routeKey.market,
    symbol,
    routeKey,
    window,
    ...backtestResearchReadOptionsV3(routeKey.market, initialManifest.executionPriceProtocol, routeKey.timeframe,
      input.runConfig.priceResearch?.dailyObservationContract),
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
  };
}

type SnapshotManifestMaterial = {
  input: BacktestSnapshotV3BuildInput;
  initialManifest: BacktestSnapshotManifestV3;
  runConfig: ReturnType<typeof runConfigSchemaV3.parse>;
  reference: Awaited<ReturnType<typeof readPriceResearchReference>>;
  additionalSignals: Awaited<ReturnType<typeof readAdditionalSignalPricesV3>>;
  sourceOutput: ReturnType<typeof createBacktestSnapshotV3Source>;
  statusComposition: Awaited<ReturnType<typeof collectSnapshotStatusInputsV1>>['statusComposition'];
  tradingStatus: Awaited<ReturnType<typeof collectSnapshotStatusInputsV1>>['tradingStatus'];
  publicFees: Awaited<ReturnType<typeof collectSnapshotPublicFeesV3>>;
  inputPlan: ReturnType<typeof planSnapshotInputsV3> | undefined;
  cashContext: ReturnType<typeof knownCashSnapshotContextV3>;
  dependencies: Awaited<ReturnType<typeof collectSnapshotDependenciesV3>> | undefined;
};
function preparedSnapshotManifest({
  input,
  initialManifest,
  runConfig,
  reference,
  sourceOutput,
  additionalSignals,
  statusComposition,
  tradingStatus,
  publicFees,
  inputPlan,
  cashContext,
  dependencies,
}: SnapshotManifestMaterial) {
  return {
    ...initialManifest,
    ...(runConfig.priceResearch
      ? {
          priceResearch: {
            protocolVersion: runConfig.priceResearch.protocolVersion,
            ...(runConfig.priceResearch.dailyObservationContract !== undefined ? { dailyObservationContract: runConfig.priceResearch.dailyObservationContract } : {}),
            ...(reference ? { actualPriceSource: reference.actualSource } : {}),
          },
        }
      : {}),
    benchmarkCostVersion: shareWindowBenchmarkCostVersionV3(
      initialManifest.executionPriceProtocol,
      sourceOutput.actualSource,
    ),
    ...(statusComposition
      ? {
          statusComposition: {
            artifactKey: `${input.runId}/${statusCompositionArtifactKeyV1}`,
            freezeVersion: statusComposition.freezeVersion,
          },
        }
      : {}),
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
      ? [
          ...new Set(
            inputPlan.priceInputs
              .filter((alias) => alias.artifactKey === 'execution/bars.parquet')
              .map((alias) => alias.purpose),
          ),
        ].map((purpose) => ({
          ...sourceOutput.actualSource,
          purpose,
        })).concat(additionalSignals.map(item => item.actualSource))
      : [sourceOutput.actualSource],
    ...cashContext.manifest,
    providerRevisions: {
      ...(dependencies?.providerRevisions ?? {}),
      ...cashContext.providerRevisions,
    },
  } satisfies BacktestSnapshotManifestV3;
}

async function collectPreparedSnapshotDependencies(
  strategy: BacktestSnapshotV3BuildInput['strategy'],
  runConfig: ReturnType<typeof runConfigSchemaV3.parse>,
  readResult: Extract<Awaited<ReturnType<MarketBarReader['readV3']>>, { status: 'selected' }>,
  dsa: Parameters<typeof collectSnapshotDependenciesV3>[1] | undefined,
) {
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
  return { inputPlan, dependencies };
}
