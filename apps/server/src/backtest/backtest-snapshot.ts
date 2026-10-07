import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';

import { strategyRequiredLookback } from '@thesis-ledger/domain';
import type { RunConfigV3, BacktestStrategy, Timeframe } from '@thesis-ledger/schemas';
import { LocalArtifactStore } from './backtest-artifact-store.js';
import { LocalSnapshotV3Store } from './backtest-snapshot-v3-store.js';

export type SnapshotDatasetPurpose =
  | 'signal'
  | 'execution'
  | 'benchmark'
  | 'fx'
  | 'corporateActions'
  | 'calendar'
  | 'instrumentFacts'
  | 'nav';

export interface SnapshotDatasetDependency {
  instrument: string;
  purpose: SnapshotDatasetPurpose;
  requestedTimeframe: Timeframe;
  baseTimeframe: Timeframe;
}

export interface SnapshotDependencyClosure {
  signalSources: string[];
  executionInstrument: string;
  benchmark?: string;
  requiredFx: string[];
  corporateActions: string[];
  calendars: string[];
  instrumentFacts: string[];
  baseTimeframes: Timeframe[];
  datasets: SnapshotDatasetDependency[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Stable JSON used for checksums and replay; object key order never affects it. */
function canonicalize(value: unknown, omitRootContentHash: boolean): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry, false)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !omitRootContentHash || key !== 'contentHash')
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry, false)}`).join(',')}}`;
}

export function canonicalizeManifest(value: unknown): string {
  return canonicalize(value, false);
}

export function hashCanonicalManifest(value: unknown): string {
  return sha256(canonicalize(value, true));
}

export function deriveRunConfigChecksum(runConfig: RunConfigV3): string {
  return hashCanonicalManifest(runConfig);
}

const currencyByMarket = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;
const timeframeRank: Record<Timeframe, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '60m': 60, '1d': 1440 };

function collectExpressionSources(value: unknown, sourceIds: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectExpressionSources(entry, sourceIds));
    return;
  }
  const node = value as Record<string, unknown>;
  if (node.type === 'series' && typeof node.sourceId === 'string') sourceIds.add(node.sourceId);
  Object.values(node).forEach((entry) => collectExpressionSources(entry, sourceIds));
}

const WARMUP_RANGE_POLICY_VERSION = 'calendar-aware-conservative-v1';
const WARMUP_CALENDAR_BUFFER_DAYS = 14;

function subtractDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

function instrumentKey(instrument: { market: string; symbol: string; assetType: string }): string {
  return `${instrument.market}:${instrument.symbol}:${instrument.assetType}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function baseTimeframe(timeframe: Timeframe): Timeframe {
  return timeframe === '1d' ? '1d' : '1m';
}

function deriveDatasets(
  strategy: BacktestStrategy,
  sources: BacktestStrategy['signalSources'],
  dependencyInstruments: BacktestStrategy['signalSources'][number]['asset'][],
  requiredFx: string[],
): SnapshotDatasetDependency[] {
  const datasets: SnapshotDatasetDependency[] = sources.map((source) => ({
    instrument: instrumentKey(source.asset),
    purpose: 'signal',
    requestedTimeframe: source.timeframe,
    baseTimeframe: baseTimeframe(source.timeframe),
  }));
  const executionInstrument = strategy.executionInstrument;
  datasets.push({
    instrument: instrumentKey(executionInstrument),
    purpose: 'execution',
    requestedTimeframe: strategy.primaryTimeframe,
    baseTimeframe: baseTimeframe(strategy.primaryTimeframe),
  });
  if (strategy.benchmark) {
    datasets.push({
      instrument: instrumentKey(strategy.benchmark),
      purpose: 'benchmark',
      requestedTimeframe: strategy.primaryTimeframe,
      baseTimeframe: baseTimeframe(strategy.primaryTimeframe),
    });
  }
  for (const instrument of dependencyInstruments) {
    const key = instrumentKey(instrument);
    datasets.push({ instrument: key, purpose: 'corporateActions', requestedTimeframe: '1d', baseTimeframe: '1d' });
    datasets.push({ instrument: key, purpose: 'instrumentFacts', requestedTimeframe: '1d', baseTimeframe: '1d' });
    datasets.push({ instrument: instrument.market, purpose: 'calendar', requestedTimeframe: '1d', baseTimeframe: '1d' });
    if (instrument.assetType === 'fund' && instrument.market === 'CN') {
      datasets.push({ instrument: key, purpose: 'nav', requestedTimeframe: '1d', baseTimeframe: '1d' });
    }
  }
  for (const fx of requiredFx) {
    datasets.push({ instrument: fx, purpose: 'fx', requestedTimeframe: '1d', baseTimeframe: '1d' });
  }
  const unique = new Map<string, SnapshotDatasetDependency>();
  for (const dataset of datasets) {
    const key = `${dataset.instrument}|${dataset.purpose}|${dataset.requestedTimeframe}|${dataset.baseTimeframe}`;
    unique.set(key, dataset);
  }
  return [...unique.values()].sort((left, right) =>
    `${left.instrument}|${left.purpose}|${left.requestedTimeframe}|${left.baseTimeframe}`.localeCompare(
      `${right.instrument}|${right.purpose}|${right.requestedTimeframe}|${right.baseTimeframe}`,
    ),
  );
}

export function deriveSnapshotDependencyClosure(
  strategy: BacktestStrategy,
  runConfig: Pick<RunConfigV3, 'baseCurrency'>,
): SnapshotDependencyClosure & { lookbackPeriods: number; lookbackTimeframe: Timeframe } {
  const sourceIds = new Set<string>();
  collectExpressionSources(strategy.entry, sourceIds);
  collectExpressionSources(strategy.exit, sourceIds);
  // Including declared sources makes the closure safe when a future AST node
  // refers to a source through a non-expression dependency.
  strategy.signalSources.forEach((source) => sourceIds.add(source.id));
  const sources = strategy.signalSources.filter((source) => sourceIds.has(source.id));
  const dependencyInstruments = [
    ...sources.map((source) => source.asset),
    strategy.executionInstrument,
    ...(strategy.benchmark ? [strategy.benchmark] : []),
  ];
  const sourceCurrencies = new Set(dependencyInstruments.map((instrument) => currencyByMarket[instrument.market]));
  const requiredFx = [...sourceCurrencies]
    .filter((currency) => currency !== runConfig.baseCurrency)
    .map((currency) => `${currency}/${runConfig.baseCurrency}`)
    .sort();
  const lookbackTimeframe = sources.reduce<Timeframe>(
    (current, source) => (timeframeRank[baseTimeframe(source.timeframe)] < timeframeRank[current] ? baseTimeframe(source.timeframe) : current),
    baseTimeframe(strategy.primaryTimeframe),
  );
  const lookbackPeriods = strategyRequiredLookback(
    strategy,
  ).required;
  const datasets = deriveDatasets(strategy, sources, dependencyInstruments, requiredFx);
  return {
    signalSources: uniqueSorted(sources.map((source) => source.id)),
    executionInstrument: instrumentKey(strategy.executionInstrument),
    ...(strategy.benchmark ? { benchmark: instrumentKey(strategy.benchmark) } : {}),
    requiredFx,
    corporateActions: uniqueSorted(dependencyInstruments.map(instrumentKey)),
    calendars: uniqueSorted(dependencyInstruments.map((instrument) => instrument.market)),
    instrumentFacts: uniqueSorted(dependencyInstruments.map(instrumentKey)),
    baseTimeframes: [...new Set(datasets.map((dataset) => dataset.baseTimeframe))].sort((left, right) => timeframeRank[left] - timeframeRank[right]),
    datasets,
    lookbackPeriods,
    lookbackTimeframe,
  };
}

export function buildCurrentSnapshotBase(
  strategy: BacktestStrategy,
  runConfig: Pick<RunConfigV3, 'startDate' | 'endDate' | 'baseCurrency'>,
) {
  const closure = deriveSnapshotDependencyClosure(strategy, runConfig);
  const warmupStartDate = subtractDays(
    runConfig.startDate,
    closure.lookbackPeriods * 2 + WARMUP_CALENDAR_BUFFER_DAYS,
  );
  return {
    aggregationVersion: 'bar-aggregation-v1',
    marketRuleVersion: 'market-rules-v1',
    calendarVersion: 'calendar-v1',
    corporateActionVersion: 'corporate-actions-v1',
    availabilitySemanticsVersion: 'availability-v1',
    dependencyClosure: {
      signalSources: closure.signalSources,
      executionInstrument: closure.executionInstrument,
      ...(closure.benchmark ? { benchmark: closure.benchmark } : {}),
      requiredFx: closure.requiredFx,
      corporateActions: closure.corporateActions,
      calendars: closure.calendars,
      instrumentFacts: closure.instrumentFacts,
      datasets: closure.datasets,
      baseTimeframes: closure.baseTimeframes,
    },
    dateRange: {
      startDate: runConfig.startDate,
      endDate: runConfig.endDate,
      warmupStartDate,
    },
    warmup: {
      lookbackPeriods: closure.lookbackPeriods,
      lookbackTimeframe: closure.lookbackTimeframe,
      startDate: warmupStartDate,
      rangePolicyVersion: WARMUP_RANGE_POLICY_VERSION,
      calendarBufferDays: WARMUP_CALENDAR_BUFFER_DAYS,
    },
    quality: {
      completeness: 'partial' as const,
      warnings: ['已冻结 execution 日线；其余策略依赖数据尚未写入 Snapshot。'],
    },
  };
}

export class SnapshotIntegrityError extends Error {
  readonly code = 'SNAPSHOT_HASH_MISMATCH';
}

export class LocalSnapshotStore {
  readonly artifacts: LocalArtifactStore;
  readonly v3: LocalSnapshotV3Store;

  constructor(rootDirectory: string) {
    this.artifacts = new LocalArtifactStore(resolve(rootDirectory, 'artifacts'));
    this.v3 = new LocalSnapshotV3Store({
      rootDirectory,
      artifacts: this.artifacts,
      putArtifact: (runId, input) => {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) {
          throw new Error('Invalid runId');
        }
        if (!input.key || isAbsolute(input.key) || input.key.split(/[\\/]/).includes('..')) {
          throw new Error('Artifact key must be relative and cannot contain parent segments');
        }
        return this.artifacts.put({
          ...input,
          key: `${runId}/${input.key.replace(/^\/+/, '')}`,
        });
      },
      canonicalize: canonicalizeManifest,
      hash: hashCanonicalManifest,
      integrityError: (message) => new SnapshotIntegrityError(message),
    });
  }
}
