import assert from 'node:assert/strict';
import { deterministicResultChecksum } from '../packages/domain/dist/index.js';
import { backtestNavRunResponseV3Schema } from '../packages/schemas/dist/index.js';

// 只读复核既有成功 Run，不创建运行或写入账户账本。
const origin = new URL(process.env.LEDGER_ASSOCIATION_ORIGIN ?? 'http://127.0.0.1:3000');
assert.equal(origin.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname));
const runIds = process.argv.slice(2);
assert.ok(runIds.length > 0, '必须提供待复核的既有 NAV Run ID');
assert.equal(new Set(runIds).size, runIds.length, 'Run ID 不得重复');
const headers = {};
if (process.env.THESIS_LEDGER_API_TOKEN)
  headers.authorization = `Bearer ${process.env.THESIS_LEDGER_API_TOKEN}`;
const summaries = [];
const allRequestIds = new Set();
for (const id of runIds) {
  assert.match(id, /^[a-f0-9-]{36}$/i);
  const response = await fetch(new URL(`/api/v1/backtests/runs/nav/${id}`, origin), {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `Run ${id} 读取失败`);
  const run = backtestNavRunResponseV3Schema.parse(await response.json());
  assert.equal(run.id, id);
  assert.equal(run.status, 'succeeded');
  assert.ok(run.result && run.snapshotManifest);
  const result = run.result;
  const manifest = run.snapshotManifest;
  assert.equal(result.runId, id);
  assert.equal(manifest.runId, id);
  assert.equal(result.strategyVersionId, run.strategyVersionId);
  assert.equal(manifest.strategyVersionId, run.strategyVersionId);
  assert.equal(result.snapshotId, run.snapshotId);
  assert.equal(manifest.contentHash, run.snapshotId);
  assert.equal(result.contentHash, run.snapshotId);
  const { resultChecksum, ...payload } = result;
  assert.equal(deterministicResultChecksum(payload), resultChecksum);
  assert.equal(resultChecksum, run.resultChecksum);
  assert.ok(result.simulationFills.length > 0, '必须有实际经济成交');
  const requestIds = new Set();
  for (const request of result.requests) {
    assert.ok(request.requestId.startsWith(`${id}:`), '申请身份必须属于当前 Run');
    assert.ok(!allRequestIds.has(request.requestId), '不同 Run 申请身份不得重复');
    requestIds.add(request.requestId);
    allRequestIds.add(request.requestId);
  }
  assert.equal(requestIds.size, result.requests.length);
  for (const fill of result.simulationFills)
    assert.ok(requestIds.has(fill.orderId), '成交必须关联当前 Run 的申请');
  for (const requestId of result.pendingRequestIds)
    assert.ok(requestIds.has(requestId), '待处理申请必须属于当前 Run');
  summaries.push({
    runId: id,
    symbol: result.executionSymbol,
    strategyVersionId: run.strategyVersionId,
    snapshotId: run.snapshotId,
    resultChecksum,
    requests: result.requests.length,
    fills: result.simulationFills.length,
    pendingRequests: result.pendingRequestIds.length,
    cash: result.cash,
    position: result.position,
    completeness: result.completeness,
  });
}
console.log(
  JSON.stringify(
    { checkedAt: new Date().toISOString(), origin: origin.origin, runs: summaries },
    null,
    2,
  ),
);
