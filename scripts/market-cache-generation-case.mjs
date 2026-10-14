import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { desiredProviderPolicyV3Schema, marketRouteKeyIdV3 } from '../packages/schemas/dist/index.js';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';

export const cacheRouteKey = { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'REALTIME_QUOTE' };
export const quotePath = '/api/market/600519.SH/quote';

export function createCacheGenerationCase(state) {
  const baseline = desiredFromState(state);
  assert(baseline.enabled && state.syncState === 'applied' && !state.effectiveStale &&
    state.dsaRevision === baseline.revision, '需要已同步的现行政策');
  const matches = baseline.routes.filter((route) => marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(cacheRouteKey));
  assert(matches.length === 1 && matches[0].enabled !== false && matches[0].targets.length > 0,
    '需要当前已启用且唯一的股票报价路由');
  const caseId = randomUUID();
  const temporary = desiredProviderPolicyV3Schema.parse({ ...baseline, requestId: caseId,
    revision: baseline.revision + 1, routes: baseline.routes.map((route) =>
      marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(cacheRouteKey) ? { ...route, enabled: false } : route) });
  return { caseVersion: 1, caseId, baseline, temporary,
    baselineFingerprint: policyFingerprint(baseline), temporaryFingerprint: policyFingerprint(temporary) };
}

function assertPolicy(state, revision, fingerprint) {
  assert(state.revision === revision && state.syncState === 'applied' && !state.effectiveStale &&
    state.dsaRevision === revision && policyFingerprint(desiredFromState(state)) === fingerprint,
  '政策版本、同步状态或指纹不一致');
}

export function assertCacheGenerationCase(plan) {
  assert(plan.caseVersion === 1 && typeof plan.caseId === 'string', '恢复记录版本无效');
  const baseline = desiredProviderPolicyV3Schema.parse(plan.baseline);
  const temporary = desiredProviderPolicyV3Schema.parse(plan.temporary);
  const expected = { ...baseline, revision: baseline.revision + 1, requestId: plan.caseId,
    routes: baseline.routes.map((route) => marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(cacheRouteKey)
      ? { ...route, enabled: false } : route) };
  assert(temporary.revision === expected.revision && temporary.requestId === expected.requestId &&
    policyFingerprint(temporary) === policyFingerprint(expected) &&
    plan.baselineFingerprint === policyFingerprint(baseline) &&
    plan.temporaryFingerprint === policyFingerprint(temporary), '验收写集超出单一报价功能');
}

export async function restoreCacheGenerationCase(api, plan, journal) {
  assertCacheGenerationCase(plan);
  const current = await api.get('/api/market-data/policy');
  assertPolicy(current, plan.temporary.revision, plan.temporaryFingerprint);
  await journal({ phase: 'restore_prepared', plan, owned: true });
  const restored = await api.put('/api/market-data/policy', { ...plan.baseline,
    revision: current.revision + 1, requestId: `${plan.caseId}:restore`, expectedRevision: current.revision });
  assert(restored.revision === current.revision + 1 &&
    policyFingerprint(desiredFromState(restored)) === plan.baselineFingerprint, '恢复提交结果不明');
  const final = await api.get('/api/market-data/policy');
  assertPolicy(final, current.revision + 1, plan.baselineFingerprint);
  await journal({ phase: 'restored', plan, owned: false, restoredRevision: final.revision });
  return final;
}

export async function executeCacheGenerationCase(api, plan, journal, probe) {
  assertCacheGenerationCase(plan);
  assertPolicy(await api.get('/api/market-data/policy'), plan.baseline.revision, plan.baselineFingerprint);
  const baseline = await probe('baseline');
  assert(baseline.secondCached === true, '当前报价缓存基线未成立');
  await journal({ phase: 'prepared', plan, owned: false, baseline });
  let owned = false;
  let failure;
  let disabled;
  try {
    const acknowledged = await api.put('/api/market-data/policy', {
      ...plan.temporary, expectedRevision: plan.baseline.revision });
    assert(acknowledged.revision === plan.temporary.revision &&
      policyFingerprint(desiredFromState(acknowledged)) === plan.temporaryFingerprint, '临时提交结果不明');
    owned = true;
    await journal({ phase: 'temporary_confirmed', plan, owned, baseline });
    assertPolicy(await api.get('/api/market-data/policy'), plan.temporary.revision, plan.temporaryFingerprint);
    disabled = await probe('disabled');
    assert(disabled.rejected === true && disabled.dataCalls === 0, '关闭报价后必须拒绝且零数据请求');
    await journal({ phase: 'disabled_verified', plan, owned, baseline, disabled });
  } catch (error) {
    failure = error;
    await journal({ phase: owned ? 'query_failed' : 'submission_unconfirmed', plan, owned, baseline });
  } finally {
    if (owned) await restoreCacheGenerationCase(api.recovery ?? api, plan, journal);
  }
  if (failure) throw failure;
  const restored = await probe('restored');
  assert(restored.firstCached === false && restored.secondCached === true && restored.dataCalls === 1,
    '恢复后需新代次单次读取，再命中新鲜缓存');
  await journal({ phase: 'verified', plan, owned: false, baseline, disabled, restored });
  return { baseline, disabled, restored };
}
