import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, syncBuiltinESMExports } from 'node:module';

// 目标Worker只读已生成业务快照；不查询当前政策、凭据或在线来源。
const [runId, expectedHash] = process.argv.slice(2);
assert(/^[a-zA-Z0-9_-]{1,128}$/.test(runId ?? '') && /^[a-f0-9]{64}$/.test(expectedHash ?? ''), '需要精确运行与内容哈希');
const require = createRequire(resolve(process.cwd(), 'package.json'));
let networkCalls = 0;
const deny = () => { networkCalls += 1; throw new Error('组合冻结核验禁止联网'); };
globalThis.fetch = deny;
for (const [name, methods] of [['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
  ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']]]) {
  const transport = require(name); for (const method of methods) transport[method] = deny;
}
syncBuiltinESMExports();
const server = resolve(process.cwd(), 'apps/server/dist/src/backtest');
const { LocalSnapshotStore, hashCanonicalManifest } = await import(pathToFileURL(resolve(server, 'backtest-snapshot.js')));
const { readSnapshotStatusCompositionV1 } = await import(pathToFileURL(resolve(server, 'backtest-status-composition-v1.js')));
const store = new LocalSnapshotStore(process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'));
const manifest = await store.v3.replay(runId);
assert.equal(manifest.contentHash, expectedHash);
assert.equal(manifest.status, 'finalized');
assert(manifest.statusComposition && !manifest.tradingStatus, '需要新组合且无重复聚合');
const rows = new Map();
for (const ref of manifest.artifacts) {
  const values = []; for await (const row of await store.artifacts.openRead(ref)) values.push(row);
  rows.set(ref.key, values);
}
const metadata = rows.get(`${runId}/metadata/snapshot-metadata-v3.parquet`);
assert.equal(metadata?.length, 1);
const config = JSON.parse(metadata[0].runConfig);
assert.equal(hashCanonicalManifest(config), manifest.runConfigChecksum);
assert.equal(config.executionPriceProtocol.accountingBasis, 'normalized-series');
assert.equal(config.executionPriceProtocol.history.basis, 'fixed-provider-snapshot');
assert.equal(config.executionModel.scope.symbol, '600519.SH');
assert.equal(config.startDate, '2026-10-08'); assert.equal(config.endDate, '2026-10-09');
const frozen = readSnapshotStatusCompositionV1(manifest, config, rows.get(manifest.statusComposition.artifactKey));
const entries = frozen.composition.entries;
assert.deepEqual(entries.map((e) => e.query.routeKey.capability).sort(),
  ['DAILY_PRICE_RULE', 'DAILY_TRADING_STATUS', 'LISTING_PHASE', 'RISK_WARNING', 'SECURITY_BASIC_DATES']);
for (const capability of ['DAILY_TRADING_STATUS', 'SECURITY_BASIC_DATES']) {
  const entry = entries.find((e) => e.query.routeKey.capability === capability);
  assert.equal(entry.status, 'included', '状态与基础日期必须取得独立实际事实');
  assert.equal(entry.result.routeTarget.providerId, 'baostock');
  if (capability === 'DAILY_TRADING_STATUS') assert.equal(entry.result.coverage.complete, true);
  else assert.equal(entry.result.dates.ipoDateStatus, 'known');
}
const prices = rows.get(`${runId}/execution/bars.parquet`);
assert(prices?.length > 0 && prices.every((p) => p.providerId === 'hithink' && p.symbol === '600519.SH'), '价格必须保留实际主源整窗');
assert.equal(networkCalls, 0);
console.log(JSON.stringify({ runId, contentHash: manifest.contentHash, networkCalls,
  prices: prices.length, priceProvider: 'hithink', adoption: frozen.adoption,
  optionalFailures: entries.filter((e) => e.requirement === 'optional' && e.status === 'failed').length,
  entries: entries.map((e) => ({ capability: e.query.routeKey.capability, requirement: e.requirement,
    status: e.status, ...(e.status === 'failed' ? { error: e.error } : {
      request: e.request, clock: e.result.clock, routeTarget: e.result.routeTarget,
      coverage: e.result.coverage, policyRevision: e.result.policyRevision }) })) }));
