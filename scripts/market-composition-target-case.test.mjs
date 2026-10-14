import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compositionRoutes, createCompositionCase, executeCompositionCase } from './market-composition-target-case.mjs';

function harness() {
  let state = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'original', revision: 95,
    enabled: true, routes: [], dsaRevision: 95, syncState: 'applied', effectiveStale: false };
  const providers = ['baostock', 'official-states'].map((providerId) => ({ providerId, enabled: true, configVersion: 0 }));
  const catalog = { status: 'complete', entries: compositionRoutes.map((r) => ({ key: r.key,
    target: r.targets[0], state: 'ready', querySupport: { detailKinds: ['riskCategories'], riskCategories: ['delisting', 'other'] } })) };
  const writes = [], records = [];
  const api = { get: async (p) => structuredClone(p.endsWith('/providers') ? { providers } : state),
    put: async (p, body) => { assert.equal(body.expectedRevision, state.revision); writes.push(body);
      const { expectedRevision, ...next } = body;
      state = { ...next, dsaRevision: next.revision, syncState: 'applied', effectiveStale: false };
      return structuredClone(state); } };
  return { api, providers, catalog, writes, records, state: () => state,
    plan: createCompositionCase(state, providers, catalog), journal: async (r) => records.push(r) };
}
test('只增五单目标功能，原价格/研究政策不改，业务失败仍CAS恢复', async () => {
  const h = harness();
  await assert.rejects(executeCompositionCase(h.api, h.plan, h.journal, async () => { throw new Error('准备失败'); }), /准备失败/);
  assert.deepEqual(h.writes.map((r) => r.revision), [96, 97]);
  assert.deepEqual(h.state().routes, []);
  assert.equal(h.records.at(-1).owned, false);
});
test('提交结果不明不恢复覆盖；并行来源配置变化保留恢复所有权', async () => {
  const h = harness(), put = h.api.put;
  h.api.put = async (...args) => { await put(...args); throw new Error('响应丢失'); };
  await assert.rejects(executeCompositionCase(h.api, h.plan, h.journal, async () => assert.fail()), /响应丢失/);
  assert.equal(h.writes.length, 1); assert.equal(h.records.at(-1).owned, false);
  assert.equal(h.records.at(-1).phase, 'submission_unconfirmed');
  const c = harness();
  await assert.rejects(executeCompositionCase(c.api, c.plan, c.journal, async () => {
    c.providers[0].configVersion += 1; return { runId: 'case' };
  }), /来源配置并行变化/);
  assert.equal(c.writes.length, 1); assert.equal(c.records.at(-1).owned, true);
});
test('已有功能不覆盖，粗ST目标不能冒充细分风险，计划不能改价格', async () => {
  const h = harness(); h.state().routes.push(compositionRoutes[0]);
  assert.throws(() => createCompositionCase(h.state(), h.providers, h.catalog), /已有独立功能/);
  const c = harness(); c.catalog.entries[1].querySupport.detailKinds = ['coarseST'];
  assert.throws(() => createCompositionCase(c.state(), c.providers, c.catalog), /细分风险/);
  const t = harness(); t.plan.temporary.routes.push({ key: { kind: 'bar', market: 'CN', assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' }, targets: [{ providerId: 'tencent', upstreamSource: 'tencent' }] });
  await assert.rejects(executeCompositionCase(t.api, t.plan, t.journal, async () => assert.fail()), /计划越界/);
  assert.equal(t.writes.length, 0);
  const r = harness(); r.plan.temporary.revision += 10;
  await assert.rejects(executeCompositionCase(r.api, r.plan, r.journal, async () => assert.fail()), /计划越界/);
  assert.equal(r.writes.length, 0);
});
