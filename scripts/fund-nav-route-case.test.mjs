import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFundNavPlan,
  assertFundNavPlan,
  executeFundNavCase,
  fundKeys,
  fundTarget,
  restoreFundNavPolicy,
  fundPolicyFingerprint,
  assertCurrentFundNav,
} from './fund-nav-route-case.mjs';

const provider = { ...fundTarget, configured: true, enabled: true, configVersion: 0 };
const initial = () => ({
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'controlled-fund-plan',
  revision: 154,
  enabled: true,
  routes: [
    {
      key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'KLINE' },
      targets: [{ providerId: 'hithink', upstreamSource: 'thesis-ledger' }],
    },
  ],
  syncState: 'applied',
  effectiveStale: false,
  dsaRevision: 154,
});
const catalog = {
  status: 'complete',
  entries: fundKeys.map((key) => ({ key, target: fundTarget, state: 'ready' })),
};
const plan = () => createFundNavPlan(initial(), [provider], catalog);
const nav = {
  version: 3,
  symbol: '161725.OF',
  unitNav: 1.25,
  navDate: '2026-10-16T00:00:00Z',
  provider: 'efinance',
  fetchedAt: '2026-10-20T00:00:00Z',
  freshness: 'delayed',
  servedFromCache: false,
};

test('预案只追加两个精确单源路由，保留所有已有绑定；来源关闭或目录不全即拒绝', () => {
  const p = plan();
  assertFundNavPlan(p);
  assert.equal(p.temporary.routes.length, 3);
  assert.deepEqual(p.temporary.routes[0], p.baseline.routes[0]);
  assert.throws(() => createFundNavPlan(initial(), [{ ...provider, enabled: false }], catalog));
  assert.throws(() => createFundNavPlan(initial(), [provider], { ...catalog, status: 'partial' }));
  p.temporary.routes[1].targets.push({ providerId: 'akshare', upstreamSource: 'eastmoney' });
  assert.throws(() => assertFundNavPlan(p));
});

test('没有合格净值时拒绝成功；真实空、错来源、错证券或陈旧不算正向', () => {
  assert.equal(assertCurrentFundNav(nav).points, 1);
  for (const value of [
    { ...nav, symbol: '000001.OF' },
    { ...nav, provider: 'akshare' },
    { ...nav, freshness: 'stale' },
    { ...nav, unitNav: 0 },
  ])
    assert.throws(() => assertCurrentFundNav(value));
  assert.throws(() => assertCurrentFundNav([], true));
  assert.throws(() => assertCurrentFundNav([{ ...nav, navDate: '2026-10-19T00:00:00Z' }], true));
  assert.throws(() => assertCurrentFundNav(Array(6).fill(nav), true));
});

test('历史日期年龄陈旧独立核对；不改成 delayed，也不接受缓存回退冒充实源', () => {
  const old = { ...nav, navDate: '2026-10-12T00:00:00Z', freshness: 'stale' };
  const historical = assertCurrentFundNav([old, nav], true);
  assert.equal(historical.points, 2);
  assert.equal(historical.staleHistoricalPoints, 1);
  assert.equal(historical.cachedPoints, 0);
  assert.equal(historical.values[0].freshness, 'stale');
  assert.throws(() => assertCurrentFundNav(old));
  assert.throws(() => assertCurrentFundNav([{ ...old, freshness: 'delayed' }], true));
  assert.throws(() => assertCurrentFundNav([{ ...nav, freshness: 'stale' }], true));
  assert.throws(() => assertCurrentFundNav([{ ...old, servedFromCache: true }], true));
  assert.throws(() => assertCurrentFundNav([{ ...old, fallbackUsed: true }], true));
});

test('来源请求失败或政策提交回执丢失时仍恢复本案例政策，不改 Provider', async () => {
  for (const loseAcknowledgement of [false, true]) {
    const p = plan();
    let state = initial();
    const puts = [],
      paths = [];
    const api = {
      async get(path) {
        paths.push(path);
        if (path.endsWith('/policy')) return state;
        if (path.endsWith('/providers')) return { providers: [provider] };
        throw new Error('source unavailable');
      },
      async put(path, body) {
        puts.push(path);
        state = {
          ...body,
          syncState: 'applied',
          effectiveStale: false,
          dsaRevision: body.revision,
        };
        if (loseAcknowledgement && puts.length === 1) throw new Error('response lost');
        return state;
      },
    };
    await assert.rejects(() => executeFundNavCase(api, p, () => {}));
    assert.equal(puts.length, 2);
    assert(puts.every((path) => path === '/api/market-data/policy'));
    assert.equal(fundPolicyFingerprint(state), p.baselineFingerprint);
  }
});

test('返回值校验失败时保留本次有限原数据，恢复后不为补证重试来源', async () => {
  const p = plan();
  let state = initial();
  const records = [],
    dataPaths = [];
  const raw = [{ ...nav, provider: 'akshare' }];
  const api = {
    async get(path) {
      if (path.endsWith('/policy')) return state;
      if (path.endsWith('/providers')) return { providers: [provider] };
      dataPaths.push(path);
      return path.includes('/history?') ? raw : nav;
    },
    async put(path, body) {
      assert.equal(path, '/api/market-data/policy');
      state = { ...body, syncState: 'applied', effectiveStale: false, dsaRevision: body.revision };
    },
  };
  await assert.rejects(() => executeFundNavCase(api, p, (r) => records.push(structuredClone(r))));
  assert.equal(dataPaths.length, 2);
  assert.equal(records.at(-1).phase, 'restored');
  assert.deepEqual(records.at(-1).evidence.historyRaw, raw);
  assert.equal(fundPolicyFingerprint(state), p.baselineFingerprint);
});

test('恢复遇到并行修订时停止，不覆盖用户政策', async () => {
  const p = plan();
  let writes = 0;
  const api = {
    get: async () => ({ ...p.temporary, revision: p.temporary.revision + 1 }),
    put: async () => {
      writes += 1;
    },
  };
  await assert.rejects(() => restoreFundNavPolicy(api, p));
  assert.equal(writes, 0);
});
