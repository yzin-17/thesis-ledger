import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Compression } from 'parquet-wasm/node';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ArtifactCorruptionError,
  ArtifactNotFoundError,
  LocalArtifactStore,
} from '../../src/backtest/backtest-artifact-store.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('LocalArtifactStore', () => {
  it('runs on a Node runtime with disk-backed fs.openAsBlob', () => {
    expect(typeof nodeFs.openAsBlob).toBe('function');
  });

  it('writes actual Parquet with Zstd and streams selected columns', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-artifact-'));
    roots.push(root);
    const store = new LocalArtifactStore(root);
    const ref = await store.put({
      key: 'run-1/bars.parquet',
      rows: [
        { occurredAt: '2026-01-01T00:00:00Z', symbol: 'A', close: 10 },
        { occurredAt: '2026-01-02T00:00:00Z', symbol: 'A', close: 11 },
      ],
    });

    const bytes = await readFile(join(root, ref.key));
    expect(bytes.subarray(0, 4).toString()).toBe('PAR1');
    expect(bytes.subarray(-4).toString()).toBe('PAR1');
    expect(ref.format).toBe('parquet');
    expect((await store.inspect(ref)).compression).toContain(Compression.ZSTD);
    expect((await store.inspect(ref)).columns).toEqual(['close', 'occurredAt', 'symbol']);

    const rows: unknown[] = [];
    for await (const row of await store.openRead(ref, { columns: ['symbol'], batchSize: 1 })) rows.push(row);
    expect(rows).toEqual([{ symbol: 'A' }, { symbol: 'A' }]);
  });

  it('detects missing and corrupt content, and deletes artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-artifact-'));
    roots.push(root);
    const store = new LocalArtifactStore(root);
    const ref = await store.put({ key: 'run-1/data.parquet', rows: [{ value: 1 }] });
    await writeFile(join(root, ref.key), Buffer.from('not parquet'));
    await expect(store.inspect(ref)).rejects.toBeInstanceOf(ArtifactCorruptionError);
    await store.delete(ref);
    expect(await store.exists(ref)).toBe(false);
    await expect(store.openRead(ref)).rejects.toBeInstanceOf(ArtifactNotFoundError);
  });

  it('does not overwrite an existing artifact key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-artifact-'));
    roots.push(root);
    const store = new LocalArtifactStore(root);
    await store.put({ key: 'run-1/immutable.parquet', rows: [{ value: 1 }] });
    await expect(store.put({ key: 'run-1/immutable.parquet', rows: [{ value: 2 }] })).rejects.toMatchObject({ code: 'EEXIST' });
  });
});
