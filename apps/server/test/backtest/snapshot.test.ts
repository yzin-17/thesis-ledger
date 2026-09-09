import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { strategySchemaV2, runConfigSchemaV2, type RunConfig, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import {
  buildSnapshotManifest,
  canonicalizeManifest,
  deriveSnapshotDependencyClosure,
  hashCanonicalManifest,
  LocalSnapshotStore,
  migrationDryRun,
} from '../../src/backtest/backtest-snapshot.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function contracts(): { strategy: StrategySchemaV2; runConfig: RunConfig } {
  const strategy = strategySchemaV2.parse({
    schemaVersion: '2',
    name: 'snapshot test',
    signalSources: [
      { id: 'cn-close', asset: { symbol: '000001', market: 'CN', assetType: 'stock' }, timeframe: '1d', series: ['close'] },
      { id: 'us-close', asset: { symbol: 'AAPL', market: 'US', assetType: 'stock' }, timeframe: '1d', series: ['close'] },
    ],
    executionInstrument: { symbol: '000001', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
    entry: { type: 'compare', operator: 'gt', left: { type: 'indicator', name: 'MA', input: { type: 'series', sourceId: 'cn-close', field: 'close' }, params: { period: 5 } }, right: { type: 'constant', value: '0' } },
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'fixedQuantity', quantity: '1' },
    risk: [],
    execution: { mode: 'exchange', orderType: 'market', timeInForce: 'DAY', timing: 'nextEligibleBarOpen' },
    cost: { commissionRate: '0', slippageRate: '0' },
    benchmark: { symbol: '000300', market: 'CN', assetType: 'etf' },
  }) as StrategySchemaV2;
  const runConfig = runConfigSchemaV2.parse({
    startDate: '2026-01-01',
    endDate: '2026-02-01',
    dataAsOf: '2026-02-02T00:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    valuationPolicy: { baseTimezone: 'Asia/Shanghai', dailyValuationTime: '15:00', pricePolicy: 'latestAvailable', fxPolicy: 'latestAvailable' },
  });
  return { strategy, runConfig };
}

describe('Run-owned DataSnapshot', () => {
  it('canonicalizes manifests, closes dependencies, and includes warmup range', () => {
    const { strategy, runConfig } = contracts();
    expect(canonicalizeManifest({ b: 2, a: 1 })).toBe(canonicalizeManifest({ a: 1, b: 2 }));
    const closure = deriveSnapshotDependencyClosure(strategy, runConfig);
    expect(closure.signalSources).toEqual(['cn-close', 'us-close']);
    expect(closure.requiredFx).toEqual(['USD/CNY']);
    expect(closure.lookbackPeriods).toBe(5);
    const manifest = buildSnapshotManifest({ runId: 'run-a', strategyVersionId: 'sv-1', strategyVersionHash: 'strategy-hash', strategy, runConfig });
    expect(manifest.dateRange.warmupStartDate < runConfig.startDate).toBe(true);
    expect(manifest.warmup.rangePolicyVersion).toBe('calendar-aware-conservative-v1');
    expect(manifest.runConfigChecksum).toBe(hashCanonicalManifest(runConfig));
  });

  it('isolates runs and reuses a finalized snapshot on retry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-snapshot-'));
    roots.push(root);
    const store = new LocalSnapshotStore(root);
    const contractsValue = contracts();
    const buildA = await store.startBuild({ runId: 'run-a', strategyVersionId: 'sv-1', strategyVersionHash: 'hash-a', ...contractsValue });
    const artifactA = await store.putArtifact('run-a', { key: 'bars.parquet', rows: [{ symbol: '000001', close: 10 }] });
    const finalizedA = await store.finalize('run-a', buildA, [artifactA]);
    expect((await store.retry('run-a')).contentHash).toBe(finalizedA.contentHash);

    const buildB = await store.startBuild({ runId: 'run-b', strategyVersionId: 'sv-1', strategyVersionHash: 'hash-a', ...contractsValue });
    expect(buildB.runId).not.toBe(buildA.runId);
    expect(buildB.contentHash).toBeUndefined();
    expect(await store.replay('run-a')).toEqual(finalizedA);
    await store.deleteRun('run-a');
    expect(await store.artifacts.exists(artifactA)).toBe(false);
  });

  it('rejects a missing or corrupt artifact before finalization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-snapshot-'));
    roots.push(root);
    const store = new LocalSnapshotStore(root);
    const build = await store.startBuild({ runId: 'run-corrupt', strategyVersionId: 'sv-1', strategyVersionHash: 'hash-a', ...contracts() });
    const artifact = await store.putArtifact('run-corrupt', { key: 'bars.parquet', rows: [{ symbol: '000001', close: 10 }] });
    await writeFile(join(root, 'artifacts', artifact.key), Buffer.from('corrupt'));
    await expect(store.finalize('run-corrupt', build, [artifact])).rejects.toThrow('corrupt');
  });

  it('uses Domain lookback for nested indicators and collapses derived bars to 1m', () => {
    const { strategy, runConfig } = contracts();
    const nested = {
      ...strategy,
      entry: {
        type: 'compare' as const,
        operator: 'gt' as const,
        left: {
          type: 'indicator' as const,
          name: 'MA' as const,
          input: {
            type: 'indicator' as const,
            name: 'RSI' as const,
            input: { type: 'series' as const, sourceId: 'cn-close', field: 'close' as const },
            params: { period: 14 },
          },
          params: { period: 5 },
        },
        right: { type: 'constant' as const, value: '0' },
      },
    } as StrategySchemaV2;
    const derived = {
      ...nested,
      primaryTimeframe: '5m' as const,
      signalSources: [...nested.signalSources, { id: 'derived-5m', asset: { symbol: '000001', market: 'CN' as const, assetType: 'stock' as const }, timeframe: '5m' as const, series: ['close' as const] }],
    } as StrategySchemaV2;
    const manifest = buildSnapshotManifest({ runId: 'nested', strategyVersionId: 'sv', strategyVersionHash: 'hash', strategy: derived, runConfig });
    expect(manifest.warmup.lookbackPeriods).toBe(19);
    expect(manifest.dependencyClosure.datasets).toContainEqual({ instrument: 'CN:000001:stock', purpose: 'signal', requestedTimeframe: '5m', baseTimeframe: '1m' });
    expect(manifest.dependencyClosure.baseTimeframes).toContain('1m');
  });

  it('rejects traversal keys and cleans unrecorded artifacts with the run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-snapshot-'));
    roots.push(root);
    const store = new LocalSnapshotStore(root);
    await expect(store.putArtifact('run-safe', { key: '../escape.parquet', rows: [{ value: 1 }] })).rejects.toThrow('parent segments');
    await store.startBuild({ runId: 'run-safe', strategyVersionId: 'sv-1', strategyVersionHash: 'hash-a', ...contracts() });
    const orphan = await store.putArtifact('run-safe', { key: 'orphan.parquet', rows: [{ value: 1 }] });
    await store.startBuild({ runId: 'run-safe', strategyVersionId: 'sv-1', strategyVersionHash: 'hash-a', ...contracts() });
    expect(await store.artifacts.exists(orphan)).toBe(false);
    const orphanAfterRestart = await store.putArtifact('run-safe', { key: 'orphan-after-restart.parquet', rows: [{ value: 1 }] });
    await store.deleteRun('run-safe');
    expect(await store.artifacts.exists(orphanAfterRestart)).toBe(false);
  });

  it('does not reuse a finalized snapshot with changed identity or config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-snapshot-'));
    roots.push(root);
    const store = new LocalSnapshotStore(root);
    const value = contracts();
    const build = await store.startBuild({ runId: 'run-identity', strategyVersionId: 'sv-1', strategyVersionHash: 'hash-a', ...value });
    const artifact = await store.putArtifact('run-identity', { key: 'identity.parquet', rows: [{ value: 1 }] });
    await store.finalize('run-identity', build, [artifact]);
    await expect(store.finalize('run-identity', { ...build, quality: { completeness: 'partial', warnings: [] } }, [artifact])).rejects.toThrow('already differs');
    await expect(store.startBuild({ runId: 'run-identity', strategyVersionId: 'sv-1', strategyVersionHash: 'hash-b', ...value })).rejects.toThrow('identity mismatch');
    const changedConfig = { ...value.runConfig, endDate: '2026-02-02' };
    await expect(store.startBuild({ runId: 'run-identity', strategyVersionId: 'sv-1', strategyVersionHash: 'hash-a', strategy: value.strategy, runConfig: changedConfig })).rejects.toThrow('identity mismatch');
  });

  it('uses persisted building manifest as finalize authority and requires artifacts for complete snapshots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-snapshot-'));
    roots.push(root);
    const store = new LocalSnapshotStore(root);
    const value = contracts();
    const build = await store.startBuild({ runId: 'run-authority', strategyVersionId: 'sv-1', strategyVersionHash: 'hash-a', ...value });
    await expect(store.finalize('run-authority', { ...build, strategyVersionHash: 'tampered' }, [])).rejects.toThrow('identity mismatch');
    await expect(store.finalize('run-authority', build, [])).rejects.toThrow('require at least one artifact');
    const unavailableBuild = await store.startBuild({ runId: 'run-unavailable', strategyVersionId: 'sv', strategyVersionHash: 'hash', ...value, quality: { completeness: 'unavailable', warnings: ['data unavailable'] } });
    await expect(store.finalize('run-unavailable', unavailableBuild, [])).resolves.toMatchObject({ status: 'finalized' });
  });

  it('restricts Run IDs to one safe path segment and deletes damaged manifests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-snapshot-'));
    roots.push(root);
    const store = new LocalSnapshotStore(root);
    const value = contracts();
    await expect(store.startBuild({ runId: 'a/b', strategyVersionId: 'sv', strategyVersionHash: 'hash', ...value })).rejects.toThrow('Invalid runId');
    await expect(store.startBuild({ runId: 'a\\b', strategyVersionId: 'sv', strategyVersionHash: 'hash', ...value })).rejects.toThrow('Invalid runId');
    const build = await store.startBuild({ runId: 'run-damaged', strategyVersionId: 'sv', strategyVersionHash: 'hash', ...value });
    const artifact = await store.putArtifact('run-damaged', { key: 'data.parquet', rows: [{ value: 1 }] });
    await store.finalize('run-damaged', build, [artifact]);
    await writeFile(join(root, 'snapshots', 'run-damaged', 'finalized.json'), '{ damaged');
    await expect(store.deleteRun('run-damaged')).resolves.toBeUndefined();
    await expect(access(join(root, 'snapshots', 'run-damaged'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await store.artifacts.exists(artifact)).toBe(false);
  });

  it('keeps migration dry-run explicit', () => {
    expect(migrationDryRun()).toEqual({ allowed: true, contract: 'expand-cutover-contract', blockers: [] });
    expect(migrationDryRun({ retainedV1Rows: 1 }).allowed).toBe(false);
  });
});
