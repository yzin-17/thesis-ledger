import assert from 'node:assert/strict';
import { test } from 'node:test';
import { additionalCacheDefinitions, createAdditionalCacheCase, assertAdditionalCacheCase,
  executeAdditionalCacheCase } from './market-additional-cache-case.mjs';

function fixture() {
  let state = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'original', revision: 86,
    enabled: true, routes: [{ key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'REALTIME_QUOTE' },
      targets: [{ providerId: 'hithink', upstreamSource: 'original' }] }],
    syncState: 'applied', effectiveStale: false, dsaRevision: 86 };
  const providers = [{ providerId: 'akshare', enabled: true, configVersion: 0 }];
  const catalog = { status: 'complete', entries: additionalCacheDefinitions.map(({ capability, assetType }) => ({
    key: { kind: 'data', market: 'CN', assetType, capability }, target: { providerId: 'akshare', upstreamSource: 'eastmoney' }, state: 'ready',
  })) };
  const writes = [], records = [];
  const api = { get: async (endpoint) => endpoint.endsWith('/providers') ? { providers: structuredClone(providers) } : structuredClone(state),
    put: async (endpoint, body) => {
      assert.equal(endpoint, '/api/market-data/policy');
      assert.equal(body.expectedRevision, state.revision);
      writes.push(structuredClone(body));
      const { expectedRevision, ...policy } = body;
      state = { ...policy, syncState: 'applied', effectiveStale: false, dsaRevision: policy.revision };
      return structuredClone(state);
    } };
  const probe = async (phase) => additionalCacheDefinitions.map(({ capability }) => phase === 'disabled'
    ? { capability, rejected: true, dataAttempts: 0 }
    : { capability, firstCached: false, secondCached: true, dataAttempts: 1 });
  return { api, providers, catalog, writes, records, probe, state: () => state,
    journal: async (record) => records.push(structuredClone(record)),
    plan: createAdditionalCacheCase(state, providers, catalog) };
}

test('四条新增功能仅选择、关闭、开启并CAS恢复原政策，其他目标/顺序不改', async () => {
  const h = fixture();
  await executeAdditionalCacheCase(h.api, h.plan, h.journal, h.probe);
  assert.deepEqual(h.writes.map((row) => row.revision), [87, 88, 89, 90]);
  assert.deepEqual(h.state().routes, h.plan.baseline.routes);
  assert.deepEqual(h.writes[1].routes[0], h.plan.baseline.routes[0]);
  assert(h.writes[1].routes.slice(1).every((row) => row.enabled === false && row.targets.length === 1));
  assert.deepEqual(h.providers, [{ providerId: 'akshare', enabled: true, configVersion: 0 }]);
  assert.equal(h.records.at(-1).phase, 'verified');
});

test('原功能已有手动政策时拒绝创建，不覆盖即使关闭的路线', () => {
  const h = fixture();
  h.state().routes.push({ ...h.plan.selected.routes[1], enabled: false });
  assert.throws(() => createAdditionalCacheCase(h.state(), h.providers, h.catalog), /已有功能/);
});

test('选源基线读取失败立即恢复，不执行后续关闭/重启阶段', async () => {
  const h = fixture();
  const error = new Error('来源基线不可用');
  await assert.rejects(executeAdditionalCacheCase(h.api, h.plan, h.journal, async () => { throw error; }), (value) => value === error);
  assert.deepEqual(h.writes.map((row) => row.revision), [87, 88]);
  assert.deepEqual(h.state().routes, h.plan.baseline.routes);
  assert.equal(h.records.at(-1).phase, 'restored');
});

test('阶段失败前保留逐能力进度，恢复记录不丢弃已完成证据', async () => {
  const h = fixture();
  await assert.rejects(executeAdditionalCacheCase(h.api, h.plan, h.journal, async (phase, checkpoint) => {
    await checkpoint({ currentCapability: 'FUND_NAV', partialResults: [(await h.probe(phase))[0]] });
    await checkpoint({ currentCapability: 'FUND_NAV_HISTORY', partialResults: [(await h.probe(phase))[0]] });
    throw new Error('历史校验失败');
  }), /历史校验失败/);
  const progress = h.records.filter((record) => record.phase === 'probing').at(-1);
  assert.equal(progress.currentCapability, 'FUND_NAV_HISTORY');
  assert.equal(progress.partialResults[0].capability, 'FUND_NAV');
  assert.equal(h.records.at(-1).phase, 'restored');
  assert.deepEqual(h.writes.map((row) => row.revision), [87, 88]);
});

test('关闭后仍有对应数据调用时失败并恢复，不能勾选代次门禁', async () => {
  const h = fixture();
  await assert.rejects(executeAdditionalCacheCase(h.api, h.plan, h.journal, async (phase) => {
    const rows = await h.probe(phase);
    if (phase === 'disabled') rows[0].dataAttempts = 1;
    return rows;
  }), /零对应数据尝试/);
  assert.deepEqual(h.state().routes, h.plan.baseline.routes);
  assert.equal(h.state().revision, 89);
});

test('第二次提交响应丢失时停止恢复覆盖，保留未知提交及上个确认阶段', async () => {
  const h = fixture(); const put = h.api.put;
  h.api.put = async (...args) => { const result = await put(...args); if (h.writes.length === 2) throw new Error('响应丢失'); return result; };
  await assert.rejects(executeAdditionalCacheCase(h.api, h.plan, h.journal, h.probe), /响应丢失/);
  assert.equal(h.writes.length, 2);
  assert.equal(h.state().revision, 88);
  assert.equal(h.records.at(-1).owned, false);
  assert.equal(h.records.at(-1).confirmedPhase, 'selected');
  assert.equal(h.records.at(-1).phase, 'submission_unconfirmed');
});

test('并行政策变化阻止下一提交及恢复，保留人工恢复证据', async () => {
  const h = fixture();
  await assert.rejects(executeAdditionalCacheCase(h.api, h.plan, h.journal, async (phase) => {
    h.state().revision += 1;
    return h.probe(phase);
  }), /并行变化/);
  assert.equal(h.writes.length, 1);
  assert.equal(h.records.at(-1).owned, true);
});

test('来源配置并行变化同样停止恢复，不写Provider配置', async () => {
  const h = fixture();
  await assert.rejects(executeAdditionalCacheCase(h.api, h.plan, h.journal, async (phase) => {
    h.providers[0].configVersion += 1;
    return h.probe(phase);
  }), /来源配置存在并行变化/);
  assert.equal(h.writes.length, 1);
});

test('恢复记录越界改其他路由、添加备用或改变能力都拒绝', () => {
  for (const mutate of [
    (plan) => { plan.disabled.routes[0].targets = []; },
    (plan) => { plan.selected.routes[1].targets.push({ providerId: 'efinance', upstreamSource: 'eastmoney' }); },
    (plan) => { plan.reenabled.routes[1].key.capability = 'CASH_DISTRIBUTION'; },
  ]) {
    const h = fixture(); mutate(h.plan); assert.throws(() => assertAdditionalCacheCase(h.plan));
  }
});
