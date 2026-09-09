import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import { strategyRequiredLookback } from '@thesis-ledger/domain';
import type { RunConfig, StrategySchemaV2, Timeframe } from '@thesis-ledger/schemas';

import {
  ArtifactNotFoundError,
  type ArtifactPutInput,
  type ArtifactRef,
  LocalArtifactStore,
} from './backtest-artifact-store.js';

export type SnapshotStatus = 'building' | 'finalized';
export type SnapshotCompleteness = 'complete' | 'partial' | 'unavailable';

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

export interface SnapshotManifest {
  manifestVersion: string;
  runId: string;
  strategyVersionId: string;
  strategyVersionHash: string;
  dataAsOf: string;
  runConfigChecksum: string;
  aggregationVersion: string;
  marketRuleVersion: string;
  calendarVersion: string;
  corporateActionVersion: string;
  availabilitySemanticsVersion: string;
  providerRevisions: Record<string, string>;
  dependencyClosure: SnapshotDependencyClosure;
  dateRange: { startDate: string; endDate: string; warmupStartDate: string };
  warmup: {
    lookbackPeriods: number;
    lookbackTimeframe: Timeframe;
    startDate: string;
    rangePolicyVersion: string;
    calendarBufferDays: number;
  };
  quality: { completeness: SnapshotCompleteness; warnings: string[] };
  artifacts: ArtifactRef[];
  status: SnapshotStatus;
  contentHash?: string;
}

export interface SnapshotBuildInput {
  runId: string;
  strategyVersionId: string;
  strategyVersionHash: string;
  strategy: StrategySchemaV2;
  runConfig: RunConfig;
  versions?: Partial<Pick<SnapshotManifest, 'manifestVersion' | 'aggregationVersion' | 'marketRuleVersion' | 'calendarVersion' | 'corporateActionVersion' | 'availabilitySemanticsVersion'>>;
  providerRevisions?: Record<string, string>;
  quality?: SnapshotManifest['quality'];
}

export interface MigrationDryRunResult {
  allowed: boolean;
  contract: 'expand-cutover-contract';
  blockers: string[];
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

export function deriveRunConfigChecksum(runConfig: RunConfig): string {
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
  strategy: StrategySchemaV2,
  sources: StrategySchemaV2['signalSources'],
  dependencyInstruments: StrategySchemaV2['signalSources'][number]['asset'][],
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

export function deriveSnapshotDependencyClosure(strategy: StrategySchemaV2, runConfig: RunConfig): SnapshotDependencyClosure & { lookbackPeriods: number; lookbackTimeframe: Timeframe } {
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
    strategy as unknown as Parameters<typeof strategyRequiredLookback>[0],
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

export function buildSnapshotManifest(input: SnapshotBuildInput): SnapshotManifest {
  const closure = deriveSnapshotDependencyClosure(input.strategy, input.runConfig);
  const warmupStartDate = subtractDays(
    input.runConfig.startDate,
    closure.lookbackPeriods * 2 + WARMUP_CALENDAR_BUFFER_DAYS,
  );
  return {
    manifestVersion: input.versions?.manifestVersion ?? 'snapshot-manifest-v1',
    runId: input.runId,
    strategyVersionId: input.strategyVersionId,
    strategyVersionHash: input.strategyVersionHash,
    dataAsOf: input.runConfig.dataAsOf,
    runConfigChecksum: deriveRunConfigChecksum(input.runConfig),
    aggregationVersion: input.versions?.aggregationVersion ?? 'bar-aggregation-v1',
    marketRuleVersion: input.versions?.marketRuleVersion ?? 'market-rules-v1',
    calendarVersion: input.versions?.calendarVersion ?? 'calendar-v1',
    corporateActionVersion: input.versions?.corporateActionVersion ?? 'corporate-actions-v1',
    availabilitySemanticsVersion: input.versions?.availabilitySemanticsVersion ?? 'availability-v1',
    providerRevisions: Object.fromEntries(Object.entries(input.providerRevisions ?? {}).sort(([left], [right]) => left.localeCompare(right))),
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
    dateRange: { startDate: input.runConfig.startDate, endDate: input.runConfig.endDate, warmupStartDate },
    warmup: {
      lookbackPeriods: closure.lookbackPeriods,
      lookbackTimeframe: closure.lookbackTimeframe,
      startDate: warmupStartDate,
      rangePolicyVersion: WARMUP_RANGE_POLICY_VERSION,
      calendarBufferDays: WARMUP_CALENDAR_BUFFER_DAYS,
    },
    quality: input.quality ?? { completeness: 'complete', warnings: [] },
    artifacts: [],
    status: 'building',
  };
}

export function finalizeSnapshotManifest(manifest: SnapshotManifest, artifacts: readonly ArtifactRef[]): SnapshotManifest {
  const finalized = { ...manifest, artifacts: [...artifacts].sort((left, right) => left.key.localeCompare(right.key)), status: 'finalized' as const };
  return { ...finalized, contentHash: hashCanonicalManifest(finalized) };
}

function canonicalBuildingIdentity(manifest: SnapshotManifest): string {
  const { artifacts: _artifacts, contentHash: _contentHash, status: _status, ...identity } = manifest;
  return canonicalizeManifest(identity);
}

export function migrationDryRun(input: { retainedV1Rows?: number; legacyCallers?: number } = {}): MigrationDryRunResult {
  const blockers: string[] = [];
  if ((input.retainedV1Rows ?? 0) > 0) blockers.push('retained V1 rows require an expand step');
  if ((input.legacyCallers ?? 0) > 0) blockers.push('legacy callers require a cutover step');
  return { allowed: blockers.length === 0, contract: 'expand-cutover-contract', blockers };
}

export class SnapshotNotFoundError extends Error {
  readonly code = 'SNAPSHOT_NOT_FOUND';
}

export class SnapshotIntegrityError extends Error {
  readonly code = 'SNAPSHOT_HASH_MISMATCH';
}

export class LocalSnapshotStore {
  readonly artifacts: LocalArtifactStore;

  constructor(private readonly rootDirectory: string) {
    this.artifacts = new LocalArtifactStore(resolve(rootDirectory, 'artifacts'));
  }

  private runDirectory(runId: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) throw new Error('Invalid runId');
    return resolve(this.rootDirectory, 'snapshots', runId);
  }

  private async writeManifest(path: string, manifest: SnapshotManifest, exclusive = false): Promise<void> {
    const staging = `${path}.staging-${randomUUID()}`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(staging, `${canonicalizeManifest(manifest)}\n`, { flag: 'wx' });
      if (exclusive) await link(staging, path);
      else await rename(staging, path);
    } finally {
      await rm(staging, { force: true });
    }
  }

  async startBuild(input: SnapshotBuildInput): Promise<SnapshotManifest> {
    const finalized = await this.load(input.runId, true);
    if (finalized?.status === 'finalized') {
      const expectedChecksum = deriveRunConfigChecksum(input.runConfig);
      if (
        finalized.strategyVersionId !== input.strategyVersionId ||
        finalized.strategyVersionHash !== input.strategyVersionHash ||
        finalized.runConfigChecksum !== expectedChecksum
      ) {
        throw new SnapshotIntegrityError(`Finalized snapshot identity mismatch: ${input.runId}`);
      }
      return finalized;
    }
    await rm(this.runDirectory(input.runId), { recursive: true, force: true });
    await rm(resolve(this.rootDirectory, 'staging', input.runId), { recursive: true, force: true });
    await rm(resolve(this.rootDirectory, 'artifacts', input.runId), { recursive: true, force: true });
    const manifest = buildSnapshotManifest(input);
    await this.writeManifest(resolve(this.runDirectory(input.runId), 'building.json'), manifest);
    return manifest;
  }

  async putArtifact(runId: string, input: Omit<ArtifactPutInput, 'key'> & { key: string }): Promise<ArtifactRef> {
    this.runDirectory(runId);
    if (!input.key || isAbsolute(input.key) || input.key.split(/[\\/]/).includes('..')) {
      throw new Error('Artifact key must be relative and cannot contain parent segments');
    }
    const key = `${runId}/${input.key.replace(/^\/+/, '')}`;
    return this.artifacts.put({ ...input, key });
  }

  async finalize(runId: string, manifest: SnapshotManifest, artifacts: readonly ArtifactRef[]): Promise<SnapshotManifest> {
    if (manifest.runId !== runId || manifest.status !== 'building') throw new SnapshotIntegrityError('Snapshot is not a building manifest');
    const persisted = await this.load(runId, true);
    if (!persisted) throw new SnapshotIntegrityError(`Building snapshot is missing: ${runId}`);
    if (persisted.status === 'finalized') {
      const candidate = finalizeSnapshotManifest(manifest, artifacts);
      if (persisted.contentHash === candidate.contentHash) return persisted;
      throw new SnapshotIntegrityError(`Finalized snapshot already differs: ${runId}`);
    }
    if (canonicalBuildingIdentity(persisted) !== canonicalBuildingIdentity(manifest)) {
      throw new SnapshotIntegrityError(`Building snapshot identity mismatch: ${runId}`);
    }
    if (manifest.quality.completeness !== 'unavailable' && artifacts.length === 0) {
      throw new SnapshotIntegrityError('Complete or partial snapshots require at least one artifact');
    }
    for (const artifact of artifacts) {
      if (!(await this.artifacts.exists(artifact))) throw new ArtifactNotFoundError(artifact.key);
      if (!artifact.key.startsWith(`${runId}/`)) throw new SnapshotIntegrityError('Artifact does not belong to run');
      await this.artifacts.inspect(artifact);
    }
    const finalized = finalizeSnapshotManifest(manifest, artifacts);
    try {
      await this.writeManifest(resolve(this.runDirectory(runId), 'finalized.json'), finalized, true);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const concurrent = await this.load(runId, true);
      if (concurrent?.status === 'finalized' && concurrent.contentHash === finalized.contentHash) return concurrent;
      throw new SnapshotIntegrityError(`Concurrent finalized snapshot differs: ${runId}`);
    }
    await rm(resolve(this.runDirectory(runId), 'building.json'), { force: true });
    await rm(resolve(this.rootDirectory, 'staging', runId), { recursive: true, force: true });
    return finalized;
  }

  async load(runId: string, allowMissing = false): Promise<SnapshotManifest | undefined> {
    for (const filename of ['finalized.json', 'building.json']) {
      try {
        const raw = await readFile(resolve(this.runDirectory(runId), filename), 'utf8');
        const manifest = JSON.parse(raw) as SnapshotManifest;
        if (manifest.status === 'finalized' && manifest.contentHash !== hashCanonicalManifest(manifest)) {
          throw new SnapshotIntegrityError(`Manifest hash mismatch: ${runId}`);
        }
        return manifest;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
    }
    if (allowMissing) return undefined;
    throw new SnapshotNotFoundError(`Snapshot not found: ${runId}`);
  }

  async retry(runId: string): Promise<SnapshotManifest> {
    const manifest = await this.load(runId);
    if (!manifest) throw new SnapshotNotFoundError(`Snapshot not found: ${runId}`);
    if (manifest.status !== 'finalized') throw new Error(`Snapshot ${runId} is not finalized`);
    return manifest;
  }

  async replay(runId: string): Promise<SnapshotManifest> {
    const manifest = await this.retry(runId);
    for (const artifact of manifest.artifacts) await this.artifacts.inspect(artifact);
    return manifest;
  }

  async deleteRun(runId: string): Promise<void> {
    this.runDirectory(runId);
    await rm(this.runDirectory(runId), { recursive: true, force: true });
    await rm(resolve(this.rootDirectory, 'staging', runId), { recursive: true, force: true });
    await rm(resolve(this.rootDirectory, 'artifacts', runId), { recursive: true, force: true });
  }
}
