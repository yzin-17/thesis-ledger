import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as nodeFs from 'node:fs';
import { link, mkdir, open, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { tableFromArrays, tableFromIPC, tableToIPC, type Table as ArrowTable } from 'apache-arrow';
import {
  Compression,
  ParquetFile,
  Table as ParquetTable,
  WriterPropertiesBuilder,
  writeParquet,
} from 'parquet-wasm/node';

export type ArtifactScalar = string | number | boolean | null;
export type ArtifactRow = Record<string, ArtifactScalar>;

export interface ArtifactRef {
  artifactId: string;
  key: string;
  format: 'parquet';
  compression: 'zstd';
  contentHash: string;
  sizeBytes: number;
}

export interface ArtifactPutInput {
  key: string;
  rows: readonly ArtifactRow[];
  artifactId?: string;
}

export interface ArtifactInspection {
  rows: number;
  columns: string[];
  compression: Compression[];
}

export interface ArtifactReadOptions {
  columns?: string[];
  batchSize?: number;
  rowGroups?: number[];
  limit?: number;
  offset?: number;
}

export class ArtifactNotFoundError extends Error {
  readonly code = 'ARTIFACT_NOT_FOUND';

  constructor(readonly key: string) {
    super(`Artifact not found: ${key}`);
    this.name = 'ArtifactNotFoundError';
  }
}

export class ArtifactCorruptionError extends Error {
  readonly code = 'ARTIFACT_CORRUPT';

  constructor(readonly key: string, reason: string) {
    super(`Artifact is corrupt (${key}): ${reason}`);
    this.name = 'ArtifactCorruptionError';
  }
}

export interface ArtifactStore {
  put(input: ArtifactPutInput): Promise<ArtifactRef>;
  openRead(ref: ArtifactRef, options?: ArtifactReadOptions): Promise<AsyncIterable<ArtifactRow>>;
  exists(ref: ArtifactRef): Promise<boolean>;
  delete(ref: ArtifactRef): Promise<void>;
}

const PARQUET_MAGIC = Buffer.from('PAR1');

function openDiskBlob(path: string): Promise<Blob> {
  if (typeof nodeFs.openAsBlob !== 'function') {
    throw new Error('LocalArtifactStore requires a Node.js runtime with fs.openAsBlob support');
  }
  return nodeFs.openAsBlob(path);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertParquetMagic(head: Uint8Array, tail: Uint8Array, key: string): void {
  if (
    !Buffer.from(head).equals(PARQUET_MAGIC) ||
    !Buffer.from(tail).equals(PARQUET_MAGIC)
  ) {
    throw new ArtifactCorruptionError(key, 'invalid parquet magic');
  }
}

function tableFromRows(rows: readonly ArtifactRow[]): ArrowTable {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  if (columns.length === 0) {
    throw new Error('Artifact partition must contain at least one column');
  }
  return tableFromArrays(
    Object.fromEntries(
      columns.map((column) => [column, rows.map((row) => row[column] ?? null)]),
    ),
  );
}

function normalizeValue(value: unknown): ArtifactScalar {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function* streamRows(parquetFile: ParquetFile, options?: ArtifactReadOptions): AsyncIterable<ArtifactRow> {
  const stream = await parquetFile.stream(options);
  const reader = stream.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const table = tableFromIPC(next.value.intoIPCStream());
      for (const row of table) {
        yield Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, normalizeValue(value)]));
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly rootDirectory: string) {}

  private pathFor(key: string): string {
    if (!key || isAbsolute(key) || key.split(/[\\/]/).includes('..')) {
      throw new Error('Artifact key must be a non-empty relative path without parent segments');
    }
    const root = resolve(this.rootDirectory);
    const path = resolve(root, key);
    const rel = relative(root, path);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Artifact key escapes store: ${key}`);
    return path;
  }

  private async validateFile(ref: ArtifactRef): Promise<string> {
    const path = this.pathFor(ref.key);
    const info = await stat(path).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ArtifactNotFoundError(ref.key);
      throw error;
    });
    if (info.size !== ref.sizeBytes || info.size < PARQUET_MAGIC.length * 2) {
      throw new ArtifactCorruptionError(ref.key, 'size mismatch');
    }
    const handle = await open(path, 'r');
    try {
      const head = Buffer.alloc(PARQUET_MAGIC.length);
      const tail = Buffer.alloc(PARQUET_MAGIC.length);
      await handle.read(head, 0, head.byteLength, 0);
      await handle.read(tail, 0, tail.byteLength, info.size - tail.byteLength);
      assertParquetMagic(head, tail, ref.key);
    } finally {
      await handle.close();
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    const actual = hash.digest('hex');
    if (actual !== ref.contentHash) throw new ArtifactCorruptionError(ref.key, 'content hash mismatch');
    return path;
  }

  async put(input: ArtifactPutInput): Promise<ArtifactRef> {
    const path = this.pathFor(input.key);
    const table = tableFromRows(input.rows);
    const wasmTable = ParquetTable.fromIPCStream(tableToIPC(table, 'stream'));
    const properties = new WriterPropertiesBuilder().setCompression(Compression.ZSTD).build();
    // parquet-wasm consumes both handles during writeParquet; freeing either
    // afterwards causes a native null-pointer panic in the Node entrypoint.
    const bytes = writeParquet(wasmTable, properties);
    assertParquetMagic(
      bytes.subarray(0, PARQUET_MAGIC.length),
      bytes.subarray(bytes.byteLength - PARQUET_MAGIC.length),
      input.key,
    );
    const contentHash = sha256(bytes);
    const stagingPath = `${path}.staging-${randomUUID()}`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(stagingPath, bytes, { flag: 'wx' });
      await link(stagingPath, path);
    } finally {
      await rm(stagingPath, { force: true });
    }
    return {
      artifactId: input.artifactId ?? randomUUID(),
      key: input.key,
      format: 'parquet',
      compression: 'zstd',
      contentHash,
      sizeBytes: bytes.byteLength,
    };
  }

  async openRead(ref: ArtifactRef, options?: ArtifactReadOptions): Promise<AsyncIterable<ArtifactRow>> {
    const path = await this.validateFile(ref);
    const file = await ParquetFile.fromFile(await openDiskBlob(path));
    return (async function* readAndFree(): AsyncIterable<ArtifactRow> {
      try {
        yield* streamRows(file, options);
      } finally {
        file.free();
      }
    })();
  }

  async inspect(ref: ArtifactRef): Promise<ArtifactInspection> {
    const path = await this.validateFile(ref);
    const file = await ParquetFile.fromFile(await openDiskBlob(path));
    const metadata = file.metadata();
    try {
      const rowGroup = metadata.rowGroups()[0];
      const columns = rowGroup ? rowGroup.columns() : [];
      return {
        rows: metadata.fileMetadata().numRows(),
        columns: columns.map((column) => column.columnPath().join('.')),
        compression: columns.map((column) => column.compression()),
      };
    } finally {
      metadata.free();
      file.free();
    }
  }

  async exists(ref: ArtifactRef): Promise<boolean> {
    try {
      await stat(this.pathFor(ref.key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async delete(ref: ArtifactRef): Promise<void> {
    await rm(this.pathFor(ref.key), { force: true });
  }
}
