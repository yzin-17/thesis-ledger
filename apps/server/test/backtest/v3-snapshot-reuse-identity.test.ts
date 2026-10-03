import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  backtestSnapshotManifestV3Schema,
  type BacktestSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import {
  canonicalizeManifest,
  LocalSnapshotStore,
  SnapshotIntegrityError,
} from '../../src/backtest/backtest-snapshot.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import type { MarketBarReader } from '../../src/market/market-bar-reader.js';
import type { MarketBarWindowReadInputV3 } from '../../src/market/market-bar-reader-v3.js';
import { buildInput, makeReaderResult } from './v3-snapshot-fixtures.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const frozen = async () => {
  const root = await mkdtemp(join(tmpdir(), 'c04-snapshot-reuse-'));
  roots.push(root);
  const { input } = await buildInput();
  const reader = {
    readV3: vi.fn((request: MarketBarWindowReadInputV3) => makeReaderResult(request)),
  } as unknown as Pick<MarketBarReader, 'readV3'>;
  const store = new LocalSnapshotStore(root);
  const { manifest } = await new DsaSnapshotBuilder({} as DsaClient, store, reader).buildV3(input);
  const path = join(root, 'snapshots', manifest.runId, 'finalized.json');
  return { root, store, reader, manifest, path };
};

const building = (manifest: BacktestSnapshotManifestV3) => {
  const candidate = { ...manifest, status: 'building' as const };
  delete candidate.contentHash;
  delete candidate.comparableDataFingerprint;
  return backtestSnapshotManifestV3Schema.parse(candidate);
};

it('离线复用冻结快照时验证全部产物且不再次读取市场服务', async () => {
  const { store, reader, manifest, path } = await frozen();
  reader.readV3 = vi.fn().mockRejectedValue(new Error('市场服务已离线'));
  const original = await readFile(path);
  expect(await store.v3.startBuild(building(manifest))).toEqual(manifest);
  expect(await store.v3.finalize(manifest.runId, building(manifest), manifest.artifacts)).toEqual(
    manifest,
  );
  expect(await store.v3.replay(manifest.runId)).toEqual(manifest);
  expect(reader.readV3).not.toHaveBeenCalled();
  expect(await readFile(path)).toEqual(original);
});

it.each(['building.json', 'finalized.json'])('拒绝复制到其他 Run 目录的 %s', async (filename) => {
  const { root, store, manifest } = await frozen();
  const directory = join(root, 'snapshots', 'other-run');
  await mkdir(directory, { recursive: true });
  const candidate = filename === 'building.json' ? building(manifest) : manifest;
  const path = join(directory, filename);
  const original = `${canonicalizeManifest(candidate)}\n`;
  await writeFile(path, original);
  await expect(store.v3.load('other-run', true)).rejects.toThrow('directory identity mismatch');
  await expect(store.v3.replay('other-run')).rejects.toBeInstanceOf(SnapshotIntegrityError);
  await expect(store.v3.startBuild({ ...building(manifest), runId: 'other-run' })).rejects.toThrow(
    'directory identity mismatch',
  );
  expect(await readFile(path, 'utf8')).toBe(original);
});

it.each(['building.json', 'finalized.json'])('拒绝与内容状态不符的 %s', async (filename) => {
  const { root, store, manifest, path } = await frozen();
  await rm(path);
  const candidate = filename === 'building.json' ? manifest : building(manifest);
  const misplaced = join(root, 'snapshots', manifest.runId, filename);
  const original = `${canonicalizeManifest(candidate)}\n`;
  await writeFile(misplaced, original);
  await expect(store.v3.load(manifest.runId, true)).rejects.toThrow('file state mismatch');
  expect(await readFile(misplaced, 'utf8')).toBe(original);
});

it.each(['missing', 'tampered'])('冻结复用拒绝 %s metadata，保留终态文件', async (fault) => {
  const { root, store, manifest, path } = await frozen();
  const metadata = manifest.artifacts.find((ref) => ref.key.includes('/metadata/'));
  if (!metadata) throw new Error('缺少 metadata 测试产物');
  const artifactPath = join(root, 'artifacts', metadata.key);
  const original = await readFile(path);
  if (fault === 'missing') {
    await rm(artifactPath);
  } else {
    const bytes = await readFile(artifactPath);
    bytes[bytes.length - 9] = bytes[bytes.length - 9]! ^ 1;
    await writeFile(artifactPath, bytes);
  }
  await expect(store.v3.startBuild(building(manifest))).rejects.toThrow();
  await expect(
    store.v3.finalize(manifest.runId, building(manifest), manifest.artifacts),
  ).rejects.toThrow();
  await expect(store.v3.replay(manifest.runId)).rejects.toThrow();
  expect(await readFile(path)).toEqual(original);
});
