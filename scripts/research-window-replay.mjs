import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, syncBuiltinESMExports } from 'node:module';

// 在目标 /app 下只读现有 Snapshot；输出供宿主独立核对，不保存结果。
const [runId, expectedChecksum] = process.argv.slice(2);
assert(runId && expectedChecksum, '需提供任务 ID 和持久校验和');
const require = createRequire(resolve(process.cwd(), 'package.json'));
let networkCalls = 0;
const deny = () => {
  networkCalls += 1;
  throw new Error('离线重放禁止网络访问');
};
globalThis.fetch = deny;
for (const [name, methods] of [
  ['node:http', ['request', 'get']],
  ['node:https', ['request', 'get']],
  ['node:net', ['connect', 'createConnection']],
  ['node:tls', ['connect']],
]) {
  const transport = require(name);
  for (const method of methods) transport[method] = deny;
}
syncBuiltinESMExports();
const server = resolve(process.cwd(), 'apps/server/dist/src/backtest');
const { LocalSnapshotStore } = await import(pathToFileURL(resolve(server, 'backtest-snapshot.js')));
const { LocalSnapshotV3Runner } = await import(
  pathToFileURL(resolve(server, 'backtest-v3-runner.js'))
);
const store = new LocalSnapshotStore(
  process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'),
);
const manifest = await store.v3.replay(runId);
const input = {
  runId,
  snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
  artifactRefs: manifest.artifacts,
};
const runner = new LocalSnapshotV3Runner(store);
const first = await runner.run(input, new AbortController().signal);
const second = await runner.run(input, new AbortController().signal);
assert.deepEqual(first, second);
assert.equal(first.resultChecksum, expectedChecksum);
assert.equal(first.snapshotId, manifest.contentHash);
const inputs = {};
const frozenRows = new Map();
const artifactIdentities = [];
for (const artifact of manifest.artifacts) {
  const values = [];
  for await (const row of await store.artifacts.openRead(artifact)) values.push(row);
  frozenRows.set(artifact.key, values);
  artifactIdentities.push({ ...artifact, verifiedRows: values.length });
  if (artifact.key.endsWith('/metadata/snapshot-metadata-v3.parquet')) {
    assert.equal(values.length, 1);
    inputs.runConfig = JSON.parse(values[0].runConfig);
    inputs.strategy = JSON.parse(values[0].strategy);
  }
  if (artifact.key.endsWith('/execution/bars.parquet')) {
    inputs.bars = values.map((row) => ({
      occurredAt: row.occurredAt,
      availableAt: row.availableAt,
      symbol: row.symbol,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      amount: row.amount,
    }));
  }
  if (artifact.key.endsWith('/metadata/execution-model-v3.parquet')) {
    assert.equal(values.length, 1);
    inputs.executionModel = JSON.parse(values[0].model);
  }
  if (artifact.key.endsWith('/metadata/public-fees-v3.parquet')) {
    assert.equal(values.length, 1);
    inputs.publicFees = JSON.parse(values[0].payload);
  }
  if (artifact.key.endsWith('/metadata/trading-status-v3.parquet')) {
    assert.equal(values.length, 1);
    inputs.tradingStatus = JSON.parse(values[0].payload);
  }
  if (artifact.key.split('/').at(-2) === 'calendar') {
    inputs.calendar = values.map((row) => {
      const value = { ...row };
      for (const key of ['sessions', 'sessionOverrides', 'holidays', 'range'])
        value[key] = JSON.parse(row[key]);
      return value;
    });
  }
  if (artifact.key.split('/').at(-2) === 'instrumentFacts') inputs.instrumentFacts = values;
}
assert.equal(networkCalls, 0);
let cashComparison;
const { runFrozenExchange } = await import('./known-cash-frozen-comparison.mjs');
const ledger = await runFrozenExchange(manifest, frozenRows, inputs.strategy, inputs.runConfig);
assert.deepEqual(ledger.analytics.equityCurve, first.equityCurve);
if (process.argv.includes('--cash-comparison')) {
  const { compareFrozenKnownCash } = await import('./known-cash-frozen-comparison.mjs');
  cashComparison = await compareFrozenKnownCash(
    manifest,
    frozenRows,
    inputs.strategy,
    inputs.runConfig,
  );
  assert.equal(networkCalls, 0);
}
console.log(
  JSON.stringify({
    runId,
    snapshotId: manifest.contentHash,
    resultChecksum: first.resultChecksum,
    identicalReplay: true,
    replayCount: 2,
    networkCalls,
    networkTransportsBlocked: ['fetch', 'http', 'https', 'net', 'tls'],
    benchmarkCostVersion: manifest.benchmarkCostVersion,
    result: first,
    inputs,
    ledger,
    artifactIdentities,
    ...(cashComparison ? { cashComparison } : {}),
  }),
);
