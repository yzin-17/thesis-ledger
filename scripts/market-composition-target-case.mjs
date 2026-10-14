import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { desiredProviderPolicyV3Schema, marketRouteKeyIdV3 } from '../packages/schemas/dist/index.js';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';

export const compositionRoutes = Object.freeze([
  ['DAILY_TRADING_STATUS', 'baostock', 'baostock'],
  ['RISK_WARNING', 'official-states', 'cn-stock-risk-price-limits'],
  ['DAILY_PRICE_RULE', 'official-states', 'cn-stock-risk-price-limits'],
  ['LISTING_PHASE', 'official-states', 'cn-stock-delisting-period'],
  ['SECURITY_BASIC_DATES', 'baostock', 'baostock'],
].map(([capability, providerId, upstreamSource]) => ({
  key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability }, enabled: true,
  targets: [{ providerId, upstreamSource }],
})));

export function createCompositionCase(state, providers, catalog) {
  const baseline = desiredFromState(state);
  assert(baseline.enabled && state.syncState === 'applied' && !state.effectiveStale &&
    state.dsaRevision === baseline.revision, '组合验收需要已同步原政策');
  assert(catalog.status === 'complete', '组合验收需要完整目录');
  const configVersions = {};
  for (const route of compositionRoutes) {
    const id = marketRouteKeyIdV3(route.key), target = route.targets[0];
    assert(!baseline.routes.some((r) => marketRouteKeyIdV3(r.key) === id), '已有独立功能政策不得覆盖');
    const provider = providers.find((p) => p.providerId === target.providerId);
    assert(provider?.enabled && Number.isSafeInteger(provider.configVersion), '仅选择原启用且配置代次明确来源');
    configVersions[target.providerId] = provider.configVersion;
    const entries = catalog.entries.filter((r) => marketRouteKeyIdV3(r.key) === id &&
      r.target.providerId === target.providerId && r.target.upstreamSource === target.upstreamSource);
    assert(entries.length === 1 && entries[0].state === 'ready' && entries[0].querySupport, '需唯一就绪绑定和能力参数');
    if (route.key.capability === 'RISK_WARNING')
      assert(entries[0].querySupport.detailKinds.includes('riskCategories') &&
        ['delisting', 'other'].every((c) => entries[0].querySupport.riskCategories.includes(c)), '只查询已支持细分风险');
  }
  const caseId = randomUUID();
  const temporary = desiredProviderPolicyV3Schema.parse({ ...baseline, revision: baseline.revision + 1,
    requestId: `${caseId}:select`, routes: [...baseline.routes, ...compositionRoutes] });
  return { caseVersion: 1, caseId, baseline, temporary, configVersions,
    baselineFingerprint: policyFingerprint(baseline), temporaryFingerprint: policyFingerprint(temporary) };
}

async function confirmed(api, plan, temporary) {
  const state = await api.get('/api/market-data/policy');
  const expected = temporary ? plan.temporary : plan.baseline;
  assert(state.revision === expected.revision && state.dsaRevision === expected.revision &&
    state.syncState === 'applied' && !state.effectiveStale &&
    policyFingerprint(desiredFromState(state)) === policyFingerprint(expected), '并行政策变化或同步未确认，停止覆盖');
  const providers = (await api.get('/api/market-data/providers')).providers;
  for (const [id, version] of Object.entries(plan.configVersions)) {
    const source = providers.find((p) => p.providerId === id);
    assert(source?.enabled && source.configVersion === version, '来源配置并行变化，停止覆盖');
  }
  return state;
}

/** 写入仅五功能临时政策；业务构建通过原Server API，恢复独立CAS核对。 */
export async function executeCompositionCase(api, plan, journal, build) {
  const expected = desiredProviderPolicyV3Schema.parse({ ...plan.baseline,
    revision: plan.baseline.revision + 1, requestId: `${plan.caseId}:select`,
    routes: [...plan.baseline.routes, ...compositionRoutes] });
  assert(plan.caseVersion === 1 && plan.temporary.revision === expected.revision &&
    plan.temporary.requestId === expected.requestId && policyFingerprint(expected) === plan.temporaryFingerprint &&
    policyFingerprint(plan.temporary) === plan.temporaryFingerprint &&
    policyFingerprint(plan.baseline) === plan.baselineFingerprint, '精确组合计划越界');
  await confirmed(api, plan, false);
  let owned = false;
  let result;
  await journal({ phase: 'submission_prepared', plan, owned });
  try {
    const ack = await api.put('/api/market-data/policy', { ...plan.temporary,
      expectedRevision: plan.baseline.revision });
    assert(ack.revision === plan.temporary.revision &&
      policyFingerprint(desiredFromState(ack)) === plan.temporaryFingerprint, '组合提交结果未确认');
    owned = true;
    await journal({ phase: 'temporary_confirmed', plan, owned });
    await confirmed(api, plan, true);
    result = await build(async (record) => journal({ ...record, plan, owned }));
    await journal({ phase: 'built', plan, owned, result });
  } catch (error) {
    await journal({ phase: owned ? 'build_failed' : 'submission_unconfirmed', plan, owned });
    throw error;
  } finally {
    if (owned) {
      const state = await confirmed(api.recovery ?? api, plan, true);
      await journal({ phase: 'restore_prepared', plan, owned });
      const restored = await (api.recovery ?? api).put('/api/market-data/policy', { ...plan.baseline,
        revision: state.revision + 1, requestId: `${plan.caseId}:restore`, expectedRevision: state.revision });
      assert(restored.revision === state.revision + 1 &&
        policyFingerprint(desiredFromState(restored)) === plan.baselineFingerprint, '恢复提交未确认');
      await confirmed(api.recovery ?? api, { ...plan, baseline: { ...plan.baseline, revision: restored.revision } }, false);
      owned = false;
      await journal({ phase: 'restored', plan, owned, restoredRevision: restored.revision });
    }
  }
  await journal({ phase: 'verified', plan, owned, result });
  return result;
}
