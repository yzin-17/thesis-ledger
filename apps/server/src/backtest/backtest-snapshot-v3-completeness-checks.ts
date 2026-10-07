import type {
  BacktestSnapshotManifestV3,
  RunConfigV3,
  BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { planBacktestDependencies } from './backtest-dependency-plan.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import {
  planSnapshotInputsV3,
  SnapshotV3InputPlanError,
} from './backtest-snapshot-v3-input-plan.js';
import type { validateSnapshotDependencyArtifactsV3 } from './backtest-snapshot-v3-dependency-validation.js';

export const priceInputBindingsArtifactKeyV3 = 'metadata/price-input-bindings-v3.parquet';

function fail(message: string): never {
  throw new SnapshotV3InputPlanError(message);
}
const same = (left: unknown, right: unknown) =>
  canonicalizeManifest(left) === canonicalizeManifest(right);

/** Logical uses share one frozen series; the binding is independently replayable. */
export const snapshotPriceInputBindingsRowV3 = (
  input: Parameters<typeof planSnapshotInputsV3>[0],
): ArtifactRow => ({
  kind: 'snapshot-price-input-bindings-v3',
  bindings: canonicalizeManifest(planSnapshotInputsV3(input).priceInputs),
});

export const validateCompleteSnapshotSourceBindingsV3 = (
  manifest: BacktestSnapshotManifestV3,
  byKey: ReadonlyMap<string, readonly ArtifactRow[]>,
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  inputPlan: ReturnType<typeof planSnapshotInputsV3>,
): void => {
  if (
    !same(manifest.dependencyClosure, inputPlan.dependencyClosure) ||
    manifest.dateRange.warmupStartDate !== inputPlan.plan.warmup.startDate ||
    !same(manifest.warmup, inputPlan.warmup)
  ) {
    fail('V3 完整快照依赖闭包或预热计划不一致');
  }
  const aliases = byKey.get(priceInputBindingsArtifactKeyV3);
  if (
    aliases?.length !== 1 ||
    !same(aliases[0], snapshotPriceInputBindingsRowV3({ strategy, runConfig }))
  ) {
    fail('V3 完整快照价格输入绑定缺失或不一致');
  }
  const executionSource = manifest.actualSources.find((source) => source.purpose === 'execution');
  if (!executionSource || !same(executionSource.routeKey, inputPlan.executionRouteKey)) {
    fail('V3 完整快照执行来源与依赖计划不一致');
  }
  const purposes = [...new Set(inputPlan.priceInputs.map((alias) => alias.purpose))];
  if (
    !same(
      manifest.actualSources,
      purposes.map((purpose) => ({ ...executionSource, purpose })),
    )
  ) {
    fail('V3 完整快照信号或基准来源未绑定冻结执行序列');
  }
};

export const validateCompleteSnapshotExecutionFactsV3 = (
  byKey: ReadonlyMap<string, readonly ArtifactRow[]>,
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  inputPlan: ReturnType<typeof planSnapshotInputsV3>,
  validated: ReturnType<typeof validateSnapshotDependencyArtifactsV3>,
): void => {
  const expectedKeys = new Set([
    'metadata/snapshot-metadata-v3.parquet',
    'metadata/market-window-evidence-v3.parquet',
    priceInputBindingsArtifactKeyV3,
    'execution/bars.parquet',
    ...validated.artifacts.map(({ key }) => key),
    ...(runConfig.executionModel ? ['metadata/execution-model-v3.parquet'] : []),
  ]);
  if (byKey.size !== expectedKeys.size || [...byKey.keys()].some((key) => !expectedKeys.has(key))) {
    fail('V3 完整快照包含未规划或缺失的 Artifact');
  }
  if (!runConfig.executionModel) fail('V3 完整快照缺少冻结执行模型');
  const executionFacts = byKey.get(
    `instrumentFacts/${strategy.executionInstrument.market}-${strategy.executionInstrument.symbol}.parquet`,
  );
  if (!executionFacts?.length) fail('V3 完整快照缺少执行标的事实');
  const coordinate = {
    coordinateId: 'execution-series',
    currency: runConfig.executionModel.scope.currency,
    priceBasis: runConfig.executionPriceProtocol.priceBasis,
  };
  for (const fact of executionFacts) {
    const plan = planBacktestDependencies({
      strategy,
      runConfig,
      corporateActionResponses: validated.corporateActionResponses,
      ruleCompatibilityFacts: {
        executionCoordinate: coordinate,
        sourceCoordinates: Object.fromEntries(
          inputPlan.plan.signalSources.map((source) => [source.id, coordinate]),
        ),
        executionUnits: {
          realLotSize: typeof fact.lotSize === 'string' ? fact.lotSize : null,
          realTickSize: typeof fact.tickSize === 'string' ? fact.tickSize : null,
          actualQuantityConversion: { available: false, evidenceRef: null },
        },
      },
    });
    if (plan.status === 'blocked' || plan.ruleCompatibility.status !== 'compatible') {
      fail(
        `V3 完整快照规则不兼容: ${[
          ...plan.blockingIssues.map((issue) => issue.message),
          ...plan.ruleCompatibility.missingInputs,
        ].join('; ')}`,
      );
    }
  }
};
