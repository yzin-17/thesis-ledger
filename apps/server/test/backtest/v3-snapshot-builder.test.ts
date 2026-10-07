import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backtestSnapshotManifestV3Schema } from '@thesis-ledger/schemas';
import { buildInput, makeReaderResult } from './v3-snapshot-fixtures.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import {
  canonicalizeManifest,
  LocalSnapshotStore,
} from '../../src/backtest/backtest-snapshot.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import type { MarketBarReader } from '../../src/market/market-bar-reader.js';
import type { MarketBarWindowReadInputV3 } from '../../src/market/market-bar-reader-v3.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Backtest Snapshot V3 execution writer', () => {
  it('writes a selected pinned execution window and finalizes a replayable V3 manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backtest-v3-snapshot-'));
    temporaryDirectories.push(root);
    const { input } = await buildInput();
    const reader = {
      readV3: vi.fn((request: MarketBarWindowReadInputV3) => makeReaderResult(request)),
    } as unknown as Pick<MarketBarReader, 'readV3'>;
    const snapshots = new LocalSnapshotStore(root);
    const builder = new DsaSnapshotBuilder({} as DsaClient, snapshots, reader);

    const result = await builder.buildV3(input);
    const parsed = backtestSnapshotManifestV3Schema.parse(result.manifest);
    expect(parsed.status).toBe('finalized');
    expect(parsed.quality.completeness).toBe('partial');
    expect(parsed.actualSources).toHaveLength(1);
    expect(parsed.actualSources[0]).toMatchObject({
      purpose: 'execution',
      symbol: '159516.SZ',
      provenance: {
        providerId: 'hithink',
        upstreamSource: 'hithink-financial-api',
        routeIndex: 0,
        effectivePolicyRevision: 1,
      },
    });
    expect(parsed.actualSources[0]?.provenance).not.toHaveProperty('providerRevision');
    expect(parsed.providerRevisions).toEqual({});
    expect(parsed.artifacts).toHaveLength(4);
    expect(parsed.executionModel?.id).toBe('cn-600519-research-2024q1');
    expect(reader.readV3).toHaveBeenCalledOnce();
    const executionArtifact = result.artifactRefs.find((artifact) =>
      artifact.key.endsWith('/execution/bars.parquet'),
    );
    const evidenceArtifact = result.artifactRefs.find((artifact) =>
      artifact.key.endsWith('/market-window-evidence-v3.parquet'),
    );
    const modelArtifact = result.artifactRefs.find((artifact) =>
      artifact.key.endsWith('/execution-model-v3.parquet'),
    );
    if (!executionArtifact || !evidenceArtifact || !modelArtifact)
      throw new Error('Expected execution, evidence and model artifacts');
    const barRows: ArtifactRow[] = [];
    for await (const row of await snapshots.artifacts.openRead(executionArtifact))
      barRows.push(row);
    expect(barRows.length).toBeGreaterThan(0);
    expect(barRows[0]).toMatchObject({
      kind: 'market-bar-v3',
      purpose: 'execution',
      symbol: '159516.SZ',
      providerId: 'hithink',
      upstreamSource: 'hithink-financial-api',
      routeIndex: 0,
      effectivePolicyRevision: 1,
      completionStatus: 'complete',
    });
    const evidenceRows: ArtifactRow[] = [];
    for await (const row of await snapshots.artifacts.openRead(evidenceArtifact))
      evidenceRows.push(row);
    expect(evidenceRows).toHaveLength(1);
    expect(evidenceRows[0]?.kind).toBe('market-window-evidence-v3');
    expect(JSON.parse(String(evidenceRows[0]?.request))).toMatchObject({
      symbol: '159516.SZ',
      routeTarget: {
        providerId: 'hithink',
        upstreamSource: 'hithink-financial-api',
        routeIndex: 0,
      },
    });
    const modelRows: ArtifactRow[] = [];
    for await (const row of await snapshots.artifacts.openRead(modelArtifact)) modelRows.push(row);
    expect(modelRows).toHaveLength(1);
    expect(modelRows[0]?.kind).toBe('execution-model-v3');
    expect(await snapshots.v3.replay(input.runId)).toEqual(parsed);
    expect(result.snapshotRef.contentHash).toBe(parsed.contentHash);
  });

  it('rejects replay when the persisted evidence artifact is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backtest-v3-snapshot-missing-'));
    temporaryDirectories.push(root);
    const { input } = await buildInput();
    const reader = {
      readV3: vi.fn((request: MarketBarWindowReadInputV3) => makeReaderResult(request)),
    } as unknown as Pick<MarketBarReader, 'readV3'>;
    const snapshots = new LocalSnapshotStore(root);
    const result = await new DsaSnapshotBuilder({} as DsaClient, snapshots, reader).buildV3(input);
    const evidence = result.artifactRefs.find((artifact) =>
      artifact.key.endsWith('/market-window-evidence-v3.parquet'),
    );
    if (!evidence) throw new Error('Expected V3 evidence artifact');
    await snapshots.artifacts.delete(evidence);

    await expect(snapshots.v3.replay(input.runId)).rejects.toThrow('artifact is missing');
  });

  it('rejects replay when a valid replacement changes the canonical evidence artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backtest-v3-snapshot-tampered-'));
    temporaryDirectories.push(root);
    const { input } = await buildInput();
    const reader = {
      readV3: vi.fn((request: MarketBarWindowReadInputV3) => makeReaderResult(request)),
    } as unknown as Pick<MarketBarReader, 'readV3'>;
    const snapshots = new LocalSnapshotStore(root);
    const result = await new DsaSnapshotBuilder({} as DsaClient, snapshots, reader).buildV3(input);
    const evidence = result.artifactRefs.find((artifact) =>
      artifact.key.endsWith('/market-window-evidence-v3.parquet'),
    );
    if (!evidence) throw new Error('Expected V3 evidence artifact');
    const rows: ArtifactRow[] = [];
    for await (const row of await snapshots.artifacts.openRead(evidence)) rows.push(row);
    const originalSelection = JSON.parse(String(rows[0]?.selection)) as Record<string, unknown>;
    await snapshots.artifacts.delete(evidence);
    await snapshots.artifacts.put({
      key: evidence.key,
      rows: [
        {
          ...rows[0]!,
          selection: canonicalizeManifest({ ...originalSelection, source: 'backup' }),
        },
      ],
    });

    await expect(snapshots.v3.replay(input.runId)).rejects.toThrow();
  });

  it('rejects a selected target that differs from the exact pinned request', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backtest-v3-snapshot-mismatch-'));
    temporaryDirectories.push(root);
    const { input } = await buildInput();
    const reader = {
      readV3: vi.fn((request: MarketBarWindowReadInputV3) => makeReaderResult(request, true)),
    } as unknown as Pick<MarketBarReader, 'readV3'>;
    const snapshots = new LocalSnapshotStore(root);
    const builder = new DsaSnapshotBuilder({} as DsaClient, snapshots, reader);

    await expect(builder.buildV3(input)).rejects.toMatchObject({
      code: 'reader_evidence_mismatch',
    });
    expect(await snapshots.v3.load(input.runId, true)).toBeUndefined();
  });

  it('refuses to freeze a selected window fetched after dataAsOf', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backtest-v3-snapshot-future-fetch-'));
    temporaryDirectories.push(root);
    const { input } = await buildInput();
    const reader = {
      readV3: vi.fn(async (request: MarketBarWindowReadInputV3) => {
        const result = await makeReaderResult(request);
        if (result.status !== 'selected') throw new Error('selected fixture required');
        result.evidence.fetchedAt = new Date('2026-05-21T08:00:00.001Z');
        return result;
      }),
    } as unknown as MarketBarReader;
    const snapshots = new LocalSnapshotStore(root);
    await expect(
      new DsaSnapshotBuilder({} as DsaClient, snapshots, reader).buildV3(input),
    ).rejects.toMatchObject({ code: 'FUTURE_DATA', missingFields: ['evidence.fetchedAt'] });
    expect(await snapshots.v3.load(input.runId, true)).toBeUndefined();
  });
});
