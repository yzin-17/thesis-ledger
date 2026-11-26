import { z } from 'zod';
import { omit } from 'es-toolkit';
import { backtestSnapshotManifestV3Schema } from '@thesis-ledger/schemas';
import { fingerprintBacktestRunData, type ComparableDataFingerprintRange } from '../backtest/backtest-comparable-run-data.js';
import { comparableTradabilityWindows } from '../backtest/backtest-comparable-tradability.js';
import { type LocalSnapshotStore, canonicalizeManifest } from '../backtest/backtest-snapshot.js';
import { optimizationDataArtifactFingerprint, optimizationSha256, toRecord } from '../strategy-optimization/strategy-optimization-common.js';
import { convertLegacyTradeRunConfig, type BacktestMigrationRow } from './named-v1-backtest-conversion.js';
import { convertObservation } from './named-v1-market-window-conversion.js';
import { convertStrategyDefinition } from './named-v1-strategy-conversion.js';

type Json = Record<string, unknown>;
export type OptimizationStrategy = { schemaVersion: number; definition: unknown };
export type OptimizationRunPair = { original: BacktestMigrationRow; converted: BacktestMigrationRow };
type ReadRun = (runId: string) => OptimizationRunPair | undefined;
type PriorWindowNormalizer = typeof comparableTradabilityWindows;

const rangeSchema = z.strictObject({ start: z.iso.date(), end: z.iso.date() })
  .refine(({ start, end }) => start <= end);
const splitName = z.enum(['development', 'validation', 'test']);

function legacyComparableWindows(encoded: string, range: ComparableDataFingerprintRange) {
  const current = (JSON.parse(encoded) as Json[]).map(convertObservation);
  const sliced = JSON.parse(comparableTradabilityWindows(canonicalizeManifest(current), range)) as Json[];
  return canonicalizeManifest(sliced.map(observation => ({
    ...omit(observation, ['contract', 'priceOnlyAllowed']),
    contractVersion: observation.priceOnlyAllowed ? 2 : 1,
  })));
}

export function currentOptimizationStrategy(strategy: OptimizationStrategy) {
  const result = convertStrategyDefinition(strategy.schemaVersion, strategy.definition);
  if (!('definition' in result)) throw new Error(result.reason);
  return result.definition;
}

export function convertOptimizationCandidate(row: Json, strategy: OptimizationStrategy) {
  if (optimizationSha256(strategy.definition) !== row.executionHash)
    throw new Error('原候选策略摘要不一致');
  return { ...row, executionHash: optimizationSha256(currentOptimizationStrategy(strategy)) };
}

export function convertOptimizationAdoption(row: Json, candidate: { original: Json; converted: Json }) {
  if (candidate.original.id !== row.candidateId || candidate.original.experimentId !== row.experimentId ||
      candidate.original.executionHash !== row.candidateHash ||
      candidate.original.adoptedStrategyVersionId !== row.formalStrategyVersionId)
    throw new Error('原采纳回执与候选策略不一致');
  return { ...row, candidateHash: candidate.converted.executionHash };
}

async function readRunFingerprint(
  run: BacktestMigrationRow,
  range: ComparableDataFingerprintRange,
  snapshots: LocalSnapshotStore,
  normalizeWindows?: PriorWindowNormalizer,
) {
  const manifest = backtestSnapshotManifestV3Schema.parse(normalizeWindows
    ? { ...toRecord(run.snapshotManifest), manifestVersion: 'backtest-trade-snapshot-manifest-v1' }
    : run.snapshotManifest);
  const data = await fingerprintBacktestRunData(run.id, range, manifest, snapshots.artifacts, normalizeWindows);
  return optimizationDataArtifactFingerprint(data, toRecord(run.result));
}

type FrozenComparison = {
  previous: string;
  current: string;
  range: ComparableDataFingerprintRange;
  normalizePriorWindows: PriorWindowNormalizer;
};

export async function convertOptimizationExperiment(
  row: Json,
  strategy: OptimizationStrategy,
  findRun: ReadRun,
  source: LocalSnapshotStore,
  target: LocalSnapshotStore,
) {
  const fingerprintInput = {
    schema: strategy.definition,
    runConfig: row.runConfig,
    split: row.split,
    semanticVersion: 'strategy-optimization-v1',
  };
  if (optimizationSha256(fingerprintInput) !== row.dataFingerprint)
    throw new Error('原优化实验配置摘要不一致');
  const config = convertLegacyTradeRunConfig(toRecord(row.runConfig));
  if ('reason' in config) throw new Error(config.reason);
  const dataFingerprint = optimizationSha256({
    ...fingerprintInput, schema: currentOptimizationStrategy(strategy), runConfig: config.runConfig,
  });
  const baselineRunRefs = toRecord(row.baselineRunRefs);
  const baselineMetrics = toRecord(row.baselineMetrics);
  const frozen: Json = {};
  const comparisons = new Map<string, FrozenComparison>();
  for (const [name, expected] of Object.entries(toRecord(row.frozenDataFingerprints))) {
    splitName.parse(name);
    const id = baselineRunRefs[name];
    const run = typeof id === 'string' && findRun(id);
    if (!run || run.original.status !== 'succeeded' || toRecord(baselineMetrics[name]).runId !== id)
      throw new Error('原冻结分区没有可核验的基线作业');
    const range = rangeSchema.parse(toRecord(row.split)[name]);
    let normalizePriorWindows = legacyComparableWindows;
    let previous = await readRunFingerprint(run.original, range, source, normalizePriorWindows);
    if (previous !== expected) {
      // 更早的比较实现把交易状态窗口原样计入摘要。
      normalizePriorWindows = (encoded) => encoded;
      previous = await readRunFingerprint(run.original, range, source, normalizePriorWindows);
      if (previous !== expected)
        throw new Error('原冻结分区摘要无法从已验证制品重算：' + name);
    }
    const current = await readRunFingerprint(run.converted, range, target);
    frozen[name] = current;
    comparisons.set(name, { previous, current, range, normalizePriorWindows });
  }
  return {
    row: { ...row, runConfig: config.runConfig, dataFingerprint, frozenDataFingerprints: frozen },
    comparisons,
  };
}

export async function verifyOptimizationCandidateComparisons(
  candidate: Json,
  experiment: Json,
  comparisons: ReadonlyMap<string, FrozenComparison>,
  findRun: ReadRun,
  source: LocalSnapshotStore,
  target: LocalSnapshotStore,
) {
  const metrics = toRecord(candidate.metrics);
  let retainedHistoricalComparisons = 0;
  for (const [name, id] of Object.entries(toRecord(candidate.runRefs))) {
    const run = typeof id === 'string' && findRun(id);
    const metric = toRecord(metrics[name]);
    if (!run || metric.runId !== id)
      throw new Error('原候选分区没有可核验的作业');
    if (run.original.status !== 'succeeded') continue;
    const baseline = comparisons.get(name);
    if (!baseline) throw new Error('原候选分区缺少冻结基线');
    const previous = await readRunFingerprint(run.original, baseline.range, source, baseline.normalizePriorWindows);
    const current = await readRunFingerprint(run.converted, baseline.range, target);
    if ((previous === baseline.previous) === (current === baseline.current)) continue;
    // 保留已结束实验按运行时算法记录的失效事实，当前摘要仅反映已转换的制品。
    if (previous !== baseline.previous && current === baseline.current && name === 'test' &&
        experiment.status === 'succeeded' && experiment.stage === 'completed' &&
        candidate.validationStatus === 'test_invalid' && metric.status === 'invalid' &&
        metric.reason === '封存测试候选与基准数据 Artifact 指纹不一致') {
      retainedHistoricalComparisons += 1;
      continue;
    }
    throw new Error('候选分区与基线的可比性在转换后改变：' + name);
  }
  return retainedHistoricalComparisons;
}
