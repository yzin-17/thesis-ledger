import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeSplitCase, splitPlan } from './market-split-target-acceptance.mjs';

const baseline = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'baseline', revision: 111, enabled: true,
  routes: [{ key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
    targets: [{ providerId: 'hithink', upstreamSource: 'fund-corporate-actions-dividends' }, { providerId: 'official-dividends', upstreamSource: 'cn-etf-cash-notices' }] }],
  syncState: 'applied', effectiveStale: false, dsaRevision: 111 };
const catalog = { status: 'complete', entries: [{ key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'SPLIT_EVENT' }, target: { providerId: 'akshare', upstreamSource: 'eastmoney' }, state: 'ready' }] };
function setup() {
  let current = structuredClone(baseline);const writes = [], phases = [];
  const api = { get: async () => structuredClone(current), put: async value => {
    assert.equal(value.expectedRevision, current.revision);writes.push(value);
    current = { ...value, syncState: 'applied', effectiveStale: false, dsaRevision: value.revision };return current;
  } };
  return { api, writes, phases, journal: async r => phases.push(r.phase), change: value => { current = value; } };
}

test('临时只追加拆分；一次读取后原CAS恢复主备', async () => {
  const s = setup(), plan = splitPlan(baseline, catalog);let reads = 0;
  const result = await executeSplitCase(s.api, plan, s.journal, async revision => { reads++;assert.equal(revision, 112);return { observed: true, coverage: false }; });
  assert.equal(reads, 1);assert.equal(result.restoredRevision, 113);
  assert.deepEqual(s.writes[0].routes.slice(0, -1), baseline.routes);
  assert.deepEqual(s.writes[1].routes, baseline.routes);
  assert.deepEqual(s.phases, ['prepared', 'temporary-confirmed', 'read', 'restored', 'verified']);
});

test('单次读取失败仍恢复，不重试数据', async () => {
  const s = setup();let reads = 0;
  await assert.rejects(executeSplitCase(s.api, splitPlan(baseline, catalog), s.journal, async () => { reads++;throw new Error('source failed'); }), /source failed/);
  assert.equal(reads, 1);assert.equal(s.writes.length, 2);assert.deepEqual(s.writes[1].routes, baseline.routes);
});

test('并行政策变化停止恢复覆盖', async () => {
  const s = setup();
  await assert.rejects(executeSplitCase(s.api, splitPlan(baseline, catalog), s.journal, async () => {
    s.change({ ...baseline, revision: 120, dsaRevision: 120 });return {};
  }), /并行修改/);
  assert.equal(s.writes.length, 1);
});

test('提交结果不明不冒称拥有政策，不读取或自动覆盖', async () => {
  const s = setup();let reads = 0;s.api.put = async () => { throw new Error('unconfirmed'); };
  await assert.rejects(executeSplitCase(s.api, splitPlan(baseline, catalog), s.journal, async () => { reads++; }), /unconfirmed/);
  assert.equal(reads, 0);assert.equal(s.writes.length, 0);
});

test('已有拆分路线、目录未准入或政策未同步均拒绝', () => {
  const plan = splitPlan(baseline, catalog);
  assert.throws(() => splitPlan({ ...baseline, routes: plan.temporary.routes }, catalog));
  assert.throws(() => splitPlan(baseline, { ...catalog, entries: [{ ...catalog.entries[0], state: 'not_admitted' }] }));
  assert.throws(() => splitPlan({ ...baseline, syncState: 'pending' }, catalog));
});
