import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { desiredProviderPolicyV3Schema, marketRouteKeyIdV3 } from '../packages/schemas/dist/index.js';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';

export const additionalCacheDefinitions = Object.freeze([
  { capability: 'FUND_NAV', assetType: 'MUTUAL_FUND', symbol: '000001.OF',
    consumerPath: '/api/market/000001.OF/fund-nav', dataPath: '/api/v3/thesis-ledger/market/fund-nav' },
  { capability: 'FUND_NAV_HISTORY', assetType: 'MUTUAL_FUND', symbol: '000001.OF',
    consumerPath: '/api/market/000001.OF/fund-nav/history', dataPath: '/api/v3/thesis-ledger/market/fund-nav/history',
    range: { start: '2024-07-15', end: '2024-07-19', limit: 5 } },
  { capability: 'FUND_HOLDINGS', assetType: 'MUTUAL_FUND', symbol: '000001.OF',
    consumer: 'target-original-reader', dataPath: '/api/v3/thesis-ledger/market/fund-holdings' },
  { capability: 'CHIP_SUMMARY', assetType: 'STOCK', symbol: '600519.SH',
    consumerPath: '/api/market/600519.SH/chip', dataPath: '/api/v3/thesis-ledger/market/chip' },
]);
const additions = () => additionalCacheDefinitions.map(({ capability, assetType }) => ({
  key: { kind: 'data', market: 'CN', assetType, capability }, enabled: true,
  targets: [{ providerId: 'akshare', upstreamSource: 'eastmoney' }],
}));

function policyAt(plan, phase) {
  const step = ['selected', 'disabled', 'reenabled'].indexOf(phase);
  assert(step >= 0, '未知缓存政策阶段');
  const routes = additions().map((route) => ({ ...route, enabled: phase !== 'disabled' }));
  return desiredProviderPolicyV3Schema.parse({ ...plan.baseline, revision: plan.baseline.revision + step + 1,
    requestId: `${plan.caseId}:${phase}`, routes: [...plan.baseline.routes, ...routes] });
}

export function createAdditionalCacheCase(state, providers, catalog) {
  const baseline = desiredFromState(state);
  assert(baseline.enabled && state.syncState === 'applied' && !state.effectiveStale &&
    state.dsaRevision === baseline.revision, '需要已同步的现行政策');
  assert(catalog.status === 'complete', '需要完整精确目录');
  const provider = providers.find((item) => item.providerId === 'akshare');
  assert(provider?.enabled && Number.isSafeInteger(provider.configVersion), '仅使用当前启用且配置代次明确的AKshare');
  for (const route of additions()) {
    const id = marketRouteKeyIdV3(route.key);
    assert(!baseline.routes.some((item) => marketRouteKeyIdV3(item.key) === id), '已有功能政策不能覆盖');
    const matches = catalog.entries.filter((item) => marketRouteKeyIdV3(item.key) === id &&
      item.target.providerId === 'akshare' && item.target.upstreamSource === 'eastmoney');
    assert(matches.length === 1 && matches[0].state === 'ready', '需要每项唯一就绪绑定');
  }
  const plan = { caseVersion: 2, caseId: randomUUID(), baseline,
    baselineFingerprint: policyFingerprint(baseline), providerConfigVersion: provider.configVersion };
  for (const phase of ['selected', 'disabled', 'reenabled']) {
    plan[phase] = policyAt(plan, phase);
    plan[`${phase}Fingerprint`] = policyFingerprint(plan[phase]);
  }
  return plan;
}

export function assertAdditionalCacheCase(plan) {
  assert(plan.caseVersion === 2 && typeof plan.caseId === 'string' && plan.caseId.length > 0 &&
    Number.isSafeInteger(plan.providerConfigVersion) && plan.providerConfigVersion >= 0, '恢复记录版本或配置代次非法');
  desiredFromState(plan.baseline);
  assert(plan.baselineFingerprint === policyFingerprint(plan.baseline), '恢复基线指纹不一致');
  assert(additions().every((route) => !plan.baseline.routes.some((item) =>
    marketRouteKeyIdV3(item.key) === marketRouteKeyIdV3(route.key))), '恢复基线已有受保护功能');
  for (const phase of ['selected', 'disabled', 'reenabled']) {
    const expected = policyAt(plan, phase);
    assert(plan[phase].revision === expected.revision && plan[phase].requestId === expected.requestId &&
      policyFingerprint(plan[phase]) === policyFingerprint(expected) &&
      plan[`${phase}Fingerprint`] === policyFingerprint(expected), '恢复记录超出四功能写集');
  }
}

async function currentConfirmed(api, plan, phase) {
  const state = await api.get('/api/market-data/policy');
  const expected = phase === 'baseline' ? plan.baseline : plan[phase];
  const fingerprint = phase === 'baseline' ? plan.baselineFingerprint : plan[`${phase}Fingerprint`];
  assert(state.revision === expected.revision && state.syncState === 'applied' && !state.effectiveStale &&
    state.dsaRevision === expected.revision && policyFingerprint(desiredFromState(state)) === fingerprint,
  '政策版本、同步或指纹存在并行变化，停止覆盖');
  const rows = (await api.get('/api/market-data/providers')).providers;
  const provider = rows.find((item) => item.providerId === 'akshare');
  assert(provider?.enabled && provider.configVersion === plan.providerConfigVersion, '来源配置存在并行变化，停止覆盖');
  return state;
}

export async function restoreAdditionalCacheCase(api, plan, phase, journal) {
  assertAdditionalCacheCase(plan);
  assert(['selected', 'disabled', 'reenabled'].includes(phase), '没有已确认的临时政策阶段');
  const state = await currentConfirmed(api, plan, phase);
  await journal({ phase: 'restore_prepared', confirmedPhase: phase, plan, owned: true });
  const restored = await api.put('/api/market-data/policy', { ...plan.baseline,
    revision: state.revision + 1, requestId: `${plan.caseId}:restore`, expectedRevision: state.revision });
  assert(restored.revision === state.revision + 1 && policyFingerprint(desiredFromState(restored)) === plan.baselineFingerprint,
    '恢复提交结果不明');
  const final = await api.get('/api/market-data/policy');
  assert(final.syncState === 'applied' && !final.effectiveStale && final.dsaRevision === restored.revision &&
    final.revision === restored.revision && policyFingerprint(desiredFromState(final)) === plan.baselineFingerprint,
  '恢复结果尚未确认');
  await journal({ phase: 'restored', confirmedPhase: phase, plan, owned: false, restoredRevision: final.revision });
  return final;
}

export async function executeAdditionalCacheCase(api, plan, journal, probe) {
  assertAdditionalCacheCase(plan);
  await currentConfirmed(api, plan, 'baseline');
  let owned = false;
  let confirmedPhase;
  const results = {};
  try {
    for (const phase of ['selected', 'disabled', 'reenabled']) {
      await currentConfirmed(api, plan, confirmedPhase ?? 'baseline');
      owned = false;
      await journal({ phase: 'submission_prepared', nextPhase: phase, confirmedPhase, plan, owned });
      const acknowledged = await api.put('/api/market-data/policy', {
        ...plan[phase], expectedRevision: plan[phase].revision - 1 });
      assert(acknowledged.revision === plan[phase].revision &&
        policyFingerprint(desiredFromState(acknowledged)) === plan[`${phase}Fingerprint`], '提交结果不明');
      owned = true;
      confirmedPhase = phase;
      await journal({ phase: 'temporary_confirmed', confirmedPhase, plan, owned });
      await currentConfirmed(api, plan, phase);
      results[phase] = await probe(phase, async ({ currentCapability, partialResults, traces }) => {
        assert(additionalCacheDefinitions.some((row) => row.capability === currentCapability), '观察能力越界');
        await journal({ phase: 'probing', confirmedPhase, plan, owned, results,
          currentCapability, partialResults, ...(traces ? { traces } : {}) });
      });
      assert(results[phase].length === additionalCacheDefinitions.length, '缺少缓存消费结果');
      for (const [index, result] of results[phase].entries()) {
        assert(result.capability === additionalCacheDefinitions[index].capability, '消费能力顺序不匹配');
        if (phase === 'disabled') assert(result.rejected && result.dataAttempts === 0, '关闭后需要拒绝且零对应数据尝试');
        else assert(result.firstCached === false && result.secondCached === true && result.dataAttempts === 1,
          '新代次必须首次单次数据获取、再次命中缓存');
      }
      await journal({ phase: 'phase_verified', confirmedPhase, plan, owned, results });
    }
  } catch (error) {
    await journal({ phase: owned ? 'query_failed' : 'submission_unconfirmed', confirmedPhase, plan, owned, results,
      failureKind: error?.name === 'CacheObservationPending' ? 'observation-incomplete' : 'case-failed' });
    throw error;
  } finally {
    if (owned) await restoreAdditionalCacheCase(api.recovery ?? api, plan, confirmedPhase, journal);
  }
  await journal({ phase: 'verified', plan, owned: false, results });
  return results;
}
