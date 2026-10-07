import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backtestSnapshotManifestV3Schema,
  type BacktestSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import { buildInput, makeReaderResult } from './v3-snapshot-fixtures.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import {
  canonicalizeManifest,
  hashCanonicalManifest,
  LocalSnapshotStore,
} from '../../src/backtest/backtest-snapshot.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import type { MarketBarReader } from '../../src/market/market-bar-reader.js';
import type { MarketBarWindowReadInputV3 } from '../../src/market/market-bar-reader-v3.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((root) => rm(root, { recursive: true })));
});

const fixedSnapshot = async () => {
  const root = await mkdtemp(join(tmpdir(), 's05-old-strict-v3-guard-'));
  directories.push(root);
  const { input } = await buildInput();
  const reader = {
    readV3: vi.fn((request: MarketBarWindowReadInputV3) => makeReaderResult(request)),
  } as unknown as Pick<MarketBarReader, 'readV3'>;
  const store = new LocalSnapshotStore(root);
  const result = await new DsaSnapshotBuilder({} as DsaClient, store, reader).buildV3(input);
  return { root, store, input, manifest: result.manifest };
};

const buildingCandidate = (manifest: BacktestSnapshotManifestV3) =>
  backtestSnapshotManifestV3Schema.parse({
    ...manifest,
    status: 'building',
    contentHash: undefined,
    comparableDataFingerprint: undefined,
  });

/** 构造具有真实 Parquet、合法校验和及原始文件的旧严格快照。 */
const oldStrictSnapshot = async (fakeFinalEvidence: boolean) => {
  const fixture = await fixedSnapshot();
  const { store, manifest, input, root } = fixture;
  const protocol = {
    ...manifest.executionPriceProtocol,
    history: {
      basis: 'point-in-time' as const,
      reconstructionEvidenceRef: 'synthetic-nonempty-reference',
    },
  };
  const config = { ...input.runConfig, executionPriceProtocol: protocol };
  const metadata = manifest.artifacts.find((ref) =>
    ref.key.endsWith('/snapshot-metadata-v3.parquet'),
  );
  if (!metadata) throw new Error('Missing metadata artifact');
  const rows: ArtifactRow[] = [];
  for await (const row of await store.artifacts.openRead(metadata)) rows.push(row);
  await store.artifacts.delete(metadata);
  const replacement = await store.artifacts.put({
    key: metadata.key,
    rows: [
      {
        ...rows[0]!,
        runConfig: canonicalizeManifest(config),
        finalEvidenceVerified: fakeFinalEvidence,
      },
    ],
  });
  const artifacts = manifest.artifacts.map((ref) => (ref.key === metadata.key ? replacement : ref));
  if (fakeFinalEvidence) {
    artifacts.push(
      await store.artifacts.put({
        key: `${manifest.runId}/metadata/custom-historical-final-evidence.parquet`,
        rows: [
          { kind: 'synthetic-final-evidence', historicalDecisionWindow: true, verified: true },
        ],
      }),
    );
  }
  const strict = {
    ...manifest,
    executionPriceProtocol: protocol,
    runConfigChecksum: hashCanonicalManifest(config),
    artifacts: artifacts.sort((left, right) => left.key.localeCompare(right.key)),
  };
  const finalized = backtestSnapshotManifestV3Schema.parse({
    ...strict,
    contentHash: hashCanonicalManifest(strict),
  });
  const path = join(root, 'snapshots', manifest.runId, 'finalized.json');
  await writeFile(path, `${canonicalizeManifest(finalized)}\n`);
  const original = await readFile(path);
  const originalArtifacts = await Promise.all(
    finalized.artifacts.map((ref) => readFile(join(root, 'artifacts', ref.key))),
  );
  return { ...fixture, manifest: finalized, path, original, originalArtifacts };
};

const unavailable = {
  code: 'DATA_UNAVAILABLE',
  message: expect.stringContaining('historicalDecisionWindow'),
};

describe('旧 STRICT V3 终态执行保护', () => {
  it.each([false, true])(
    '拒绝旧严格重放和幂等 finalize，保留原字节（伪最终证据：%s）',
    async (fakeFinalEvidence) => {
      const { store, manifest, path, original, originalArtifacts, root, input } =
        await oldStrictSnapshot(fakeFinalEvidence);
      expect(await store.v3.load(manifest.runId)).toEqual(manifest);
      await expect(store.v3.replay(manifest.runId)).rejects.toMatchObject(unavailable);
      const candidate = buildingCandidate(manifest);
      await expect(
        store.v3.finalize(manifest.runId, candidate, manifest.artifacts),
      ).rejects.toMatchObject(unavailable);
      await expect(
        store.v3.finalize(manifest.runId, candidate, manifest.artifacts),
      ).rejects.toMatchObject(unavailable);
      const downgraded = {
        ...candidate,
        executionPriceProtocol: input.runConfig.executionPriceProtocol,
      };
      await expect(
        store.v3.finalize(manifest.runId, downgraded, manifest.artifacts),
      ).rejects.toMatchObject(unavailable);
      expect(await readFile(path)).toEqual(original);
      expect(
        await Promise.all(
          manifest.artifacts.map((ref) => readFile(join(root, 'artifacts', ref.key))),
        ),
      ).toEqual(originalArtifacts);
      expect(await store.v3.load(manifest.runId)).toEqual(manifest);
    },
  );

  it('拒绝 building 严格快照的首次 finalize，保留 building 原文件', async () => {
    const { store, manifest, path, root } = await oldStrictSnapshot(false);
    await rm(path);
    const candidate = buildingCandidate(manifest);
    const buildingPath = join(root, 'snapshots', manifest.runId, 'building.json');
    await writeFile(buildingPath, `${canonicalizeManifest(candidate)}\n`);
    const original = await readFile(buildingPath);
    await expect(
      store.v3.finalize(manifest.runId, candidate, manifest.artifacts),
    ).rejects.toMatchObject(unavailable);
    expect(await readFile(buildingPath)).toEqual(original);
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('固定 V3 仍可重放和幂等 finalize', async () => {
    const { store, manifest } = await fixedSnapshot();
    expect(await store.v3.replay(manifest.runId)).toEqual(manifest);
    expect(
      await store.v3.finalize(manifest.runId, buildingCandidate(manifest), manifest.artifacts),
    ).toEqual(manifest);
  });
});
