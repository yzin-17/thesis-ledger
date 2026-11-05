import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  desiredProviderPolicyV3Schema,
  marketRouteKeyIdV3,
  fundNavSchema,
  fundNavHistorySchema,
} from '../packages/schemas/dist/index.js';

export const fundSymbol = '161725.OF';
export const fundTarget = Object.freeze({ providerId: 'efinance', upstreamSource: 'eastmoney' });
export const fundKeys = Object.freeze(
  ['FUND_NAV', 'FUND_NAV_HISTORY'].map((capability) => ({
    kind: 'data',
    market: 'CN',
    assetType: 'MUTUAL_FUND',
    capability,
  })),
);
const desired = (state) =>
  desiredProviderPolicyV3Schema.parse({
    contractVersion: state.contractVersion,
    consumer: state.consumer,
    requestId: state.requestId,
    revision: state.revision,
    enabled: state.enabled,
    routes: state.routes,
  });
export const fundPolicyFingerprint = (policy) =>
  createHash('sha256')
    .update(JSON.stringify({ enabled: policy.enabled, routes: policy.routes }))
    .digest('hex');

export function createFundNavPlan(state, providers, catalog) {
  const baseline = desired(state),
    provider = providers.find((row) => row.providerId === fundTarget.providerId);
  assert(
    baseline.enabled &&
      state.syncState === 'applied' &&
      state.effectiveStale === false &&
      state.dsaRevision === baseline.revision,
  );
  assert(provider?.configured && provider.enabled && Number.isSafeInteger(provider.configVersion));
  assert.equal(catalog.status, 'complete');
  for (const key of fundKeys) {
    const id = marketRouteKeyIdV3(key);
    assert(
      !baseline.routes.some((route) => marketRouteKeyIdV3(route.key) === id),
      '已有基金路由，禁止接管',
    );
    const entries = catalog.entries.filter(
      (row) =>
        marketRouteKeyIdV3(row.key) === id &&
        row.target.providerId === fundTarget.providerId &&
        row.target.upstreamSource === fundTarget.upstreamSource,
    );
    assert(entries.length === 1 && entries[0].state === 'ready', '基金精确来源必须唯一且就绪');
  }
  const temporary = desired({
    ...baseline,
    revision: baseline.revision + 1,
    requestId: randomUUID(),
    routes: [...baseline.routes, ...fundKeys.map((key) => ({ key, targets: [{ ...fundTarget }] }))],
  });
  return {
    format: 'fund-nav-route-acceptance-v1',
    caseId: randomUUID(),
    symbol: fundSymbol,
    target: fundTarget,
    baseline,
    temporary,
    providerConfigVersion: provider.configVersion,
    baselineFingerprint: fundPolicyFingerprint(baseline),
    temporaryFingerprint: fundPolicyFingerprint(temporary),
  };
}

export function assertFundNavPlan(plan) {
  assert.equal(plan.format, 'fund-nav-route-acceptance-v1');
  assert.equal(plan.symbol, fundSymbol);
  assert.deepEqual(plan.target, fundTarget);
  const baseline = desired(plan.baseline),
    temporary = desired(plan.temporary);
  assert(baseline.enabled && Number.isSafeInteger(plan.providerConfigVersion));
  for (const key of fundKeys)
    assert(!baseline.routes.some((row) => marketRouteKeyIdV3(row.key) === marketRouteKeyIdV3(key)));
  const expected = {
    ...baseline,
    routes: [...baseline.routes, ...fundKeys.map((key) => ({ key, targets: [{ ...fundTarget }] }))],
  };
  assert.equal(temporary.revision, baseline.revision + 1);
  assert.equal(
    fundPolicyFingerprint(temporary),
    fundPolicyFingerprint(expected),
    '仅允许追加指定两条路由',
  );
  assert.equal(plan.baselineFingerprint, fundPolicyFingerprint(baseline));
  assert.equal(plan.temporaryFingerprint, fundPolicyFingerprint(temporary));
}

export function assertCurrentFundNav(raw, history = false) {
  const rows = history ? fundNavHistorySchema.parse(raw) : [fundNavSchema.parse(raw)];
  assert(rows.length > 0, '真实净值结果不能为空');
  if (history) {
    assert(rows.length <= 5, '历史净值超过本次五点边界');
    for (const row of rows)
      assert(
        row.navDate.slice(0, 10) >= '2026-10-12' && row.navDate.slice(0, 10) <= '2026-10-16',
        '历史净值超出本次授权时间窗',
      );
  }
  for (const row of rows) {
    assert.equal(row.symbol, fundSymbol);
    assert.equal(row.provider, fundTarget.providerId);
    assert(row.unitNav > 0 && row.fallbackUsed !== true);
    if (history) {
      // 原来源合同 §13.46：历史日期年龄状态与缓存回退分别验证，不改写 stale。
      const age = Math.max(
        0,
        (Date.parse(row.fetchedAt.slice(0, 10)) -
          Date.parse(new Date(row.navDate).toISOString().slice(0, 10))) /
          86400000,
      );
      assert.equal(row.freshness, age > 7 ? 'stale' : 'delayed', '历史净值必须保留原日期年龄状态');
      assert.equal(row.servedFromCache, false, '本次实源验收不能由末次有效缓存回退替代');
    } else assert(row.freshness !== 'unavailable' && row.freshness !== 'stale');
  }
  return {
    points: rows.length,
    firstDate: rows[0].navDate,
    lastDate: rows.at(-1).navDate,
    provider: fundTarget.providerId,
    source: fundTarget.upstreamSource,
    cachedPoints: rows.filter((row) => row.servedFromCache).length,
    staleHistoricalPoints: history ? rows.filter((row) => row.freshness === 'stale').length : 0,
    values: rows.map((row) => ({
      navDate: row.navDate,
      unitNav: row.unitNav,
      ...(row.accumulatedNav === undefined ? {} : { accumulatedNav: row.accumulatedNav }),
      fetchedAt: row.fetchedAt,
      freshness: row.freshness,
      fallbackUsed: row.fallbackUsed ?? false,
      servedFromCache: row.servedFromCache,
    })),
    payloadSha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    disclosureQualified: false,
  };
}

export async function restoreFundNavPolicy(api, plan) {
  assertFundNavPlan(plan);
  const state = await api.get('/api/market-data/policy'),
    current = desired(state);
  if (fundPolicyFingerprint(current) !== plan.baselineFingerprint) {
    assert(
      current.revision === plan.temporary.revision &&
        current.requestId === plan.temporary.requestId &&
        fundPolicyFingerprint(current) === plan.temporaryFingerprint,
      '政策存在并行变化，禁止覆盖；保留恢复回执',
    );
    await api.put('/api/market-data/policy', {
      ...plan.baseline,
      revision: current.revision + 1,
      requestId: randomUUID(),
      expectedRevision: current.revision,
    });
  }
  const restored = await api.get('/api/market-data/policy');
  assert.equal(fundPolicyFingerprint(desired(restored)), plan.baselineFingerprint);
  assert(
    restored.syncState === 'applied' &&
      restored.effectiveStale === false &&
      restored.dsaRevision === restored.revision,
  );
  return { revision: restored.revision, originalRouteChoicesRestored: true };
}

export async function executeFundNavCase(api, plan, checkpoint) {
  assertFundNavPlan(plan);
  const state = await api.get('/api/market-data/policy');
  assert.equal(state.revision, plan.baseline.revision);
  assert.equal(fundPolicyFingerprint(desired(state)), plan.baselineFingerprint);
  const provider = (await api.get('/api/market-data/providers')).providers.find(
    (row) => row.providerId === fundTarget.providerId,
  );
  assert(
    provider?.enabled &&
      provider.configured &&
      provider.configVersion === plan.providerConfigVersion,
  );
  const evidence = {};
  checkpoint({ phase: 'prepared', plan, evidence });
  try {
    await api.put('/api/market-data/policy', {
      ...plan.temporary,
      expectedRevision: plan.baseline.revision,
    });
    const applied = await api.get('/api/market-data/policy');
    assert(
      applied.syncState === 'applied' &&
        applied.effectiveStale === false &&
        applied.revision === plan.temporary.revision,
    );
    assert.equal(fundPolicyFingerprint(desired(applied)), plan.temporaryFingerprint);
    checkpoint({ phase: 'applied', plan, evidence });
    evidence.currentRaw = await api.get(`/api/market/${fundSymbol}/fund-nav`);
    checkpoint({ phase: 'current-returned', plan, evidence });
    evidence.current = assertCurrentFundNav(evidence.currentRaw);
    const historyRaw = await api.get(
      `/api/market/${fundSymbol}/fund-nav/history?start=2026-10-12&end=2026-10-16&limit=5`,
    );
    // 先保存有限原返回；校验失败也可离线复核，不能为补证再次调用来源。
    evidence.historyRaw = historyRaw;
    checkpoint({ phase: 'history-returned', plan, evidence });
    evidence.history = assertCurrentFundNav(historyRaw, true);
  } finally {
    checkpoint({ phase: 'restoring', plan, evidence });
    evidence.restored = await restoreFundNavPolicy(api, plan);
    checkpoint({ phase: 'restored', plan, evidence });
  }
  return evidence;
}
