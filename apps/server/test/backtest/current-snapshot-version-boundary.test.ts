import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  LocalSnapshotStore,
  SnapshotIntegrityError,
} from '../../src/backtest/backtest-snapshot.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it.each([
  'snapshot-manifest-v1',
  'snapshot-manifest-v2',
  'snapshot-manifest-v99',
  undefined,
  null,
  1,
])('现行 Store 拒绝旧版或无效版本 %s，即使允许缺失也不降级', async (manifestVersion) => {
  const root = await mkdtemp(join(tmpdir(), 'snapshot-version-'));
  roots.push(root);
  const directory = join(root, 'snapshots', 'run-1');
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'building.json'),
    JSON.stringify({
      manifestVersion,
      status: 'building',
      runId: 'run-1',
    }),
  );
  const store = new LocalSnapshotStore(root);
  await expect(store.v3.load('run-1', true)).rejects.toBeInstanceOf(SnapshotIntegrityError);
});

it('现行 Artifact 写入拒绝跨 Run 路径', async () => {
  const root = await mkdtemp(join(tmpdir(), 'snapshot-key-'));
  roots.push(root);
  const store = new LocalSnapshotStore(root);
  await expect(
    store.v3.putArtifact('a/b', { key: 'data.parquet', rows: [{ value: 1 }] }),
  ).rejects.toThrow('Invalid runId');
  await expect(
    store.v3.putArtifact('safe', { key: '../escape.parquet', rows: [{ value: 1 }] }),
  ).rejects.toThrow('parent segments');
});
