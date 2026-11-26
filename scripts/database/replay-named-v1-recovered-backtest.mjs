import assert from 'node:assert/strict';
import { LocalSnapshotStore } from './apps/server/dist/src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from './apps/server/dist/src/backtest/backtest-v3-runner.js';

// 此文件作为旧 Worker 镜像 /app 下的标准输入执行，容器没有网络且制品只读。
const [runId, expectedChecksum] = process.argv.slice(2);
assert(runId);
const store = new LocalSnapshotStore('/app/var/backtest');
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
if (expectedChecksum) assert.equal(first.resultChecksum, expectedChecksum);
assert.equal(first.snapshotId, manifest.contentHash);
console.log(JSON.stringify({ identicalReplay: true, replayCount: 2, resultChecksum: first.resultChecksum }));
