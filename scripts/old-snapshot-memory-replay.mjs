import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, syncBuiltinESMExports } from 'node:module';

// 输入来自已校验的旧 dump 与 tar；只在内存解码，禁止网络、文件写入及数据库恢复。
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const bundle = JSON.parse(Buffer.concat(chunks).toString('utf8'));
assert.equal(bundle.version, 1);
const require = createRequire(resolve(process.cwd(), 'apps/server/package.json'));
let networkCalls = 0;
const deny = () => { networkCalls += 1; throw new Error('旧快照内存重放禁止网络'); };
globalThis.fetch = deny;
let fileWriteCalls = 0;
const denyWrite = () => { fileWriteCalls += 1; throw new Error('旧快照内存重放禁止文件写入'); };
const fs = require('node:fs');
for (const method of ['writeFile', 'appendFile', 'mkdir', 'rename', 'rm', 'unlink', 'rmdir', 'link', 'symlink', 'copyFile', 'truncate']) {
  fs[method] = denyWrite;
  fs[`${method}Sync`] = denyWrite;
  fs.promises[method] = denyWrite;
}
fs.createWriteStream = denyWrite;
for (const [name, methods] of [
  ['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
  ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']],
]) {
  const transport = require(name);
  for (const method of methods) transport[method] = deny;
}
syncBuiltinESMExports();
const { ParquetFile } = require('parquet-wasm/node');
const { tableFromIPC } = require('apache-arrow');
const { backtestSnapshotManifestV3Schema } = require('@thesis-ledger/schemas');
const server = resolve(process.cwd(), 'apps/server/dist/src/backtest');
const { canonicalizeManifest, hashCanonicalManifest } = await import(pathToFileURL(resolve(server, 'backtest-snapshot.js')));
const { LocalSnapshotV3Store } = await import(pathToFileURL(resolve(server, 'backtest-snapshot-v3-store.js')));
const { LocalSnapshotV3Runner } = await import(pathToFileURL(resolve(server, 'backtest-v3-runner.js')));
const { LocalNavSnapshotStore } = await import(pathToFileURL(resolve(server, 'backtest-nav-snapshot-store.js')));
const { LocalNavSnapshotV3Runner } = await import(pathToFileURL(resolve(server, 'backtest-nav-v3-runner.js')));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (value) => {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  const text = JSON.stringify(value);
  assert.notEqual(text, undefined);
  return text;
};
const results = [];
for (const run of bundle.runs) {
  const records = new Map(run.artifacts.map((item) => [item.ref.key, item]));
  assert.equal(records.size, run.artifacts.length);
  const validatedBytes = (ref) => {
    const record = records.get(ref.key);
    assert(record, '引用必须属于所选旧冻结输入');
    assert.deepEqual(ref, record.ref);
    const bytes = Buffer.from(record.bytesBase64, 'base64');
    assert.equal(bytes.length, ref.sizeBytes);
    assert.equal(bytes.subarray(0, 4).toString(), 'PAR1');
    assert.equal(bytes.subarray(-4).toString(), 'PAR1');
    assert.equal(sha256(bytes), ref.contentHash);
    return bytes;
  };
  const artifacts = {
    async exists(ref) { if (!records.has(ref.key)) return false; validatedBytes(ref); return true; },
    async inspect(ref) {
      const file = await ParquetFile.fromFile(new Blob([validatedBytes(ref)]));
      const metadata = file.metadata();
      try {
        const columns = metadata.rowGroups()[0]?.columns() ?? [];
        return { rows: metadata.fileMetadata().numRows(), columns: columns.map((col) => col.columnPath().join('.')),
          compression: columns.map((col) => col.compression()) };
      } finally { metadata.free(); file.free(); }
    },
    async openRead(ref, options) {
      const file = await ParquetFile.fromFile(new Blob([validatedBytes(ref)]));
      return (async function* () {
        const stream = await file.stream(options);
        const reader = stream.getReader();
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            assert.equal(typeof next.value.intoIPCStream, 'function');
            for (const row of tableFromIPC(next.value.intoIPCStream())) {
              yield Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalize(value)]));
            }
          }
        } finally { reader.releaseLock(); file.free(); }
      })();
    },
  };
  // 只替换物理加载；生产 replay 仍校验产物、比较指纹、完整性、PIT 与执行证据。
  class MemorySnapshotStore extends LocalSnapshotV3Store {
    async load(runId) {
      assert.equal(runId, run.runId);
      const manifest = backtestSnapshotManifestV3Schema.parse(run.manifest);
      assert.equal(manifest.status, 'finalized');
      assert.equal(manifest.contentHash, hashCanonicalManifest(manifest));
      return manifest;
    }
  }
  const v3 = new MemorySnapshotStore({
    rootDirectory: '/unused-readonly-memory-store', artifacts,
    putArtifact: () => { throw new Error('禁止重写旧产物'); },
    canonicalize: canonicalizeManifest, hash: hashCanonicalManifest,
    integrityError: (message) => new Error(message),
  });
  let runner;
  let manifest;
  let artifactRefs;
  if (run.family === 'nav') {
    // 直接复用生产 verify 的 Schema、上下文、规划、原件及指纹校验；物理读取来自原备份内存。
    class MemoryNavSnapshotStore extends LocalNavSnapshotStore {
      constructor() { super('/unused-readonly-memory-store'); this.artifacts = artifacts; }
      async replay(runId) {
        assert.equal(runId, run.runId);
        return this.verify(run.manifest, runId);
      }
    }
    const navStore = new MemoryNavSnapshotStore();
    ({ manifest } = await navStore.replay(run.runId));
    runner = new LocalNavSnapshotV3Runner(navStore);
    artifactRefs = run.artifacts.map((item) => item.ref);
  } else {
    manifest = await v3.replay(run.runId);
    runner = new LocalSnapshotV3Runner({ artifacts, v3 });
    artifactRefs = manifest.artifacts;
  }
  const input = { runId: run.runId, snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
    artifactRefs };
  const execute = () => run.family === 'nav' ? runner.runNav(input, new AbortController().signal)
    : runner.run(input, new AbortController().signal);
  const first = await execute();
  const second = await execute();
  assert.deepEqual(first, second);
  assert.equal(first.resultChecksum, run.expectedChecksum);
  assert.equal(first.completeness, run.expectedCompleteness);
  assert.equal(first.snapshotId, manifest.contentHash);
  results.push({ runId: run.runId, checksum: first.resultChecksum, snapshotId: first.snapshotId,
    family: run.family, completeness: first.completeness, artifactCount: artifactRefs.length, replayCount: 2 });
}
assert.equal(networkCalls, 0);
assert.equal(fileWriteCalls, 0);
console.log(JSON.stringify({ backupCreatedAt: bundle.backupCreatedAt, backupSchemaHead: bundle.backupSchemaHead,
  sourceFiles: bundle.sourceFiles, persistentJobCount: bundle.persistentJobCount,
  mode: 'readonly-memory-backup-replay', databaseRestored: false, networkCalls, fileWriteCalls, results }, null, 2));
