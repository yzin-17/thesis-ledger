import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { marketRouteKeyIdV3 } from '../packages/schemas/dist/index.js';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';
import { cacheRouteKey } from './market-cache-generation-case.mjs';

export function createSourceCacheCase(state, providers) {
  const baseline = desiredFromState(state);
  assert(state.syncState === 'applied' && !state.effectiveStale && state.dsaRevision === baseline.revision && baseline.enabled,
    '需当前已同步政策');
  const routes = baseline.routes.filter((r) => marketRouteKeyIdV3(r.key) === marketRouteKeyIdV3(cacheRouteKey));
  assert(routes.length === 1 && routes[0].enabled !== false && routes[0].targets.length === 1 &&
    routes[0].targets[0].providerId === 'hithink' && routes[0].targets[0].upstreamSource === 'a-share-prices-snapshot',
    '只验证原HiThink股票单源报价，不改变目标');
  const source = providers.find((p) => p.providerId === 'hithink');
  assert(source?.enabled && source.credentialConfigured && Number.isSafeInteger(source.configVersion), '仅原启用/已配置来源');
  return { caseVersion: 1, caseId: randomUUID(), baseline,
    baselineFingerprint: policyFingerprint(baseline), configVersion: source.configVersion };
}

async function confirmed(api, plan, disabled) {
  const state = await api.get('/api/market-data/policy');
  assert(state.revision === plan.baseline.revision && state.dsaRevision === plan.baseline.revision &&
    state.syncState === 'applied' && !state.effectiveStale &&
    policyFingerprint(desiredFromState(state)) === plan.baselineFingerprint, '政策并行变化，停止覆盖');
  const source = (await api.get('/api/market-data/providers')).providers.find((p) => p.providerId === 'hithink');
  assert(source && source.enabled === !disabled &&
    source.configVersion === plan.configVersion + (disabled ? 1 : 0) && source.credentialConfigured,
    '来源配置并行变化，停止覆盖');
}

/** 仅原配置入口enabled的CAS；没有政策写入或故障注入。 */
export async function executeSourceCacheCase(api, plan, journal, probe) {
  assert(plan.caseVersion === 1 && plan.baselineFingerprint === policyFingerprint(plan.baseline) &&
    Number.isSafeInteger(plan.configVersion), '来源配置计划无效');
  await confirmed(api, plan, false);
  const baseline = await probe('baseline');
  assert(baseline.provider === 'hithink' && baseline.secondCached, '原报价缓存基线未成立');
  let owned = false;
  let disabled;
  await journal({ phase: 'submission_prepared', plan, owned, baseline });
  try {
    const ack = await api.post('/api/market-data/providers/hithink/config', {
      requestId: `${plan.caseId}:disable`, expectedConfigVersion: plan.configVersion, enabled: false });
    assert(ack.requestId === `${plan.caseId}:disable` && ack.enabled === false &&
      ack.configVersion === plan.configVersion + 1, '来源配置提交未确认');
    owned = true;
    await journal({ phase: 'source_disabled', plan, owned, baseline });
    await confirmed(api, plan, true);
    disabled = await probe('disabled');
    assert(disabled.rejected && disabled.dataCalls === 0, '来源关闭需拒绝且零数据请求');
    await journal({ phase: 'disabled_verified', plan, owned, baseline, disabled });
  } catch (error) {
    await journal({ phase: owned ? 'probe_failed' : 'submission_unconfirmed', plan, owned });
    throw error;
  } finally {
    if (owned) {
      const recovery = api.recovery ?? api;
      await confirmed(recovery, plan, true);
      await journal({ phase: 'restore_prepared', plan, owned });
      const restored = await recovery.post('/api/market-data/providers/hithink/config', {
        requestId: `${plan.caseId}:restore`, expectedConfigVersion: plan.configVersion + 1, enabled: true });
      assert(restored.requestId === `${plan.caseId}:restore` && restored.enabled === true &&
        restored.configVersion === plan.configVersion + 2, '恢复配置提交未确认');
      await confirmed(recovery, { ...plan, configVersion: plan.configVersion + 2 }, false);
      owned = false;
      await journal({ phase: 'restored', plan, owned, restoredConfigVersion: restored.configVersion });
    }
  }
  const restored = await probe('restored');
  assert(restored.provider === 'hithink' && !restored.firstCached && restored.secondCached && restored.dataCalls === 1,
    '新配置代次需要单次真实获取再命中缓存');
  await journal({ phase: 'verified', plan, owned, baseline, disabled, restored });
  return { baseline, disabled, restored };
}
