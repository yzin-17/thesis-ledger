import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFailoverPlan, primary, backup, routeKey, policyFingerprint, restoreFailoverCase } from './market-route-failover-case.mjs';
import { createLocalApi, executeCase } from './market-route-failover-acceptance.mjs';

function fixture() {
  const policy = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'initial', revision: 74, enabled: true,
    routes: [{ key: routeKey, targets: [{ ...primary }] },
      { key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'HISTORICAL_TRADING_STATUS' },
        targets: [{ providerId: 'baostock', upstreamSource: 'baostock' }] }],
    syncState: 'applied', effectiveStale: false, dsaRevision: 74 };
  const providers = [{ ...primary, enabled: true, configured: true, configVersion: 3, privateSecret: 'never-copy' },
    { ...backup, enabled: true, configured: true, configVersion: 0 }];
  const barQuery = { contractVersion: 3, operation: 'query', adjustment: 'qfq', priceBasis: 'provider-native',
    readScope: 'single-target-whole-window', coverageValidation: 'per-request', transportProtocol: 'fixture-v1' };
  const catalog = { status: 'complete', entries: [primary, backup].map((target) => ({ key: routeKey, target, state: 'ready', barQuery })) };
  return { policy, providers, catalog };
}

function series(target, index, revision) {
  const dates = [15, 16, 17, 18, 19].map((day) => `2024-07-${day}T07:00:00Z`);
  return { contractVersion: 3, identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
    points: dates.map((timestamp) => ({ timestamp, open: 1, high: 1, low: 1, close: 1, volume: null, amount: null,
      completionStatus: 'complete', availableAt: timestamp })),
    coverage: { actualStart: dates[0], actualEnd: dates.at(-1), hasMoreBefore: false, latestCompleteTradingDate: '2024-07-19' },
    provenance: { ...target, routeIndex: index, effectivePolicyRevision: revision, providerRevision: 'fixture',
      fetchedAt: '2026-10-10T12:00:00Z', freshUntil: '2026-10-10T12:01:00Z', servedFromCache: false, cacheStatus: 'miss' },
    inputFingerprint: 'fixture' };
}

function fakeApi(value) {
  const writes = [];
  const api = {
    async get(path) {
      if (path === '/api/market-data/policy') return structuredClone(value.policy);
      if (path === '/api/market-data/providers') return { providers: structuredClone(value.providers) };
      if (path.includes('/bars?')) return series(value.providers[0].enabled ? primary : backup,
        value.providers[0].enabled ? 0 : 1, value.policy.revision);
      throw new Error('测试未定义该读取');
    },
    async put(path, body) {
      assert.equal(path, '/api/market-data/policy');
      assert.equal(body.expectedRevision, value.policy.revision);
      writes.push({ path, body: structuredClone(body) });
      const { expectedRevision, ...policy } = body;
      value.policy = { ...policy, syncState: 'applied', effectiveStale: false, dsaRevision: body.revision };
      return structuredClone(value.policy);
    },
    async post(path, body) {
      assert.equal(path, '/api/market-data/providers/hithink/config');
      assert.equal(body.expectedConfigVersion, value.providers[0].configVersion);
      writes.push({ path, body: structuredClone(body) });
      value.providers[0].enabled = body.enabled;
      value.providers[0].configVersion += 1;
      return { ...value.providers[0], requestId: body.requestId };
    },
  };
  return { api, writes };
}

test('预定案例只改一项合法路由并排除凭据', () => {
  const f = fixture();
  const plan = createFailoverPlan(f.policy, f.providers, f.catalog);
  assert.deepEqual(plan.temporary.routes[0].targets, [primary, backup]);
  assert.deepEqual(plan.temporary.routes[1], plan.baseline.routes[1]);
  assert.equal(f.policy.routes[0].targets.length, 1);
  assert(!JSON.stringify(plan).includes('never-copy'));
});

for (const change of ['partial', 'unsupported', 'wrong-adjustment', 'disabled', 'unsynced', 'different-primary']) {
  test(`预览拒绝不满足现行条件：${change}`, () => {
    const f = fixture();
    if (change === 'partial') f.catalog.status = 'partial';
    if (change === 'unsupported') f.catalog.entries.pop();
    if (change === 'wrong-adjustment') f.catalog.entries[1].barQuery = { ...f.catalog.entries[1].barQuery, adjustment: 'none' };
    if (change === 'disabled') f.providers[0].enabled = false;
    if (change === 'unsynced') f.policy.syncState = 'rejected';
    if (change === 'different-primary') f.policy.routes[0].targets = [backup];
    assert.throws(() => createFailoverPlan(f.policy, f.providers, f.catalog));
  });
}

test('成功故障验收沿版本条件恢复原选择，只改 enabled', async () => {
  const f = fixture();
  const plan = createFailoverPlan(f.policy, f.providers, f.catalog);
  const { api, writes } = fakeApi(f);
  const phases = [];
  const evidence = await executeCase(api, plan, (record) => phases.push(structuredClone(record)));
  assert.equal(evidence.backup.providerId, 'tencent');
  assert.equal(evidence.backup.routeIndex, 1);
  assert.equal(evidence.restored.providerId, 'hithink');
  assert.equal(policyFingerprint(f.policy), plan.baselineFingerprint);
  assert.equal(f.policy.revision, 76);
  assert.equal(f.providers[0].configVersion, 5);
  assert.equal(f.providers[0].privateSecret, 'never-copy');
  assert.deepEqual(writes.filter((row) => row.path.includes('/config')).map((row) => Object.keys(row.body).sort()),
    [['enabled', 'expectedConfigVersion', 'requestId'], ['enabled', 'expectedConfigVersion', 'requestId']]);
  assert.equal(phases.at(-1).phase, 'verified');
});

test('备用失败也先恢复，不把失败当作验收通过', async () => {
  const f = fixture();
  const plan = createFailoverPlan(f.policy, f.providers, f.catalog);
  const { api } = fakeApi(f);
  const original = api.get;
  api.get = async (path) => {
    if (path.includes('/bars?') && !f.providers[0].enabled) throw new Error('隔离备用失败');
    return original(path);
  };
  await assert.rejects(executeCase(api, plan), /隔离备用失败/);
  assert.equal(f.providers[0].enabled, true);
  assert.equal(policyFingerprint(f.policy), plan.baselineFingerprint);
});

test('来源并行变更不能被恢复覆盖', async () => {
  const f = fixture();
  const plan = createFailoverPlan(f.policy, f.providers, f.catalog);
  f.providers[0].enabled = false;
  f.providers[0].configVersion = 5;
  const { api, writes } = fakeApi(f);
  await assert.rejects(restoreFailoverCase(api, plan, { policy: true, provider: true }), /恢复未完成/);
  assert.equal(f.providers[0].enabled, false);
  assert.equal(writes.length, 0);
});

test('未知提交结果不能凭代次猜测来源所有权', async () => {
  const f = fixture();
  const plan = createFailoverPlan(f.policy, f.providers, f.catalog);
  f.providers[0].enabled = false;
  f.providers[0].configVersion = 4;
  const { api, writes } = fakeApi(f);
  await assert.rejects(restoreFailoverCase(api, plan, { policy: false, provider: false }), /恢复未完成/);
  assert.equal(writes.length, 0);
});

test('未知或并行政策不能被恢复覆盖', async () => {
  for (const owned of [false, true]) {
    const f = fixture();
    const plan = createFailoverPlan(f.policy, f.providers, f.catalog);
    f.policy = { ...plan.temporary, syncState: 'applied', effectiveStale: false, dsaRevision: 75 };
    if (owned) f.policy.revision += 1;
    const { api, writes } = fakeApi(f);
    await assert.rejects(restoreFailoverCase(api, plan, { policy: owned, provider: false }), /恢复未完成/);
    assert.equal(writes.length, 0);
  }
});

test('外部目标和 URL 凭据在任何 HTTP 请求前拒绝', () => {
  assert.throws(() => createLocalApi('https://example.com'));
  assert.throws(() => createLocalApi('http://user:secret@localhost:3000'));
});
