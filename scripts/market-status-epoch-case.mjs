import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { desiredProviderPolicyV3Schema, marketRouteKeyIdV3 } from '../packages/schemas/dist/index.js';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';

const key = (capability) => ({ kind: 'data', market: 'CN', assetType: 'STOCK', capability });
const primary = { providerId: 'baostock', upstreamSource: 'baostock' };
const backup = { providerId: 'official-states', upstreamSource: 'cn-stock-daily-suspension' };

export function createEpochCase(state, providers, catalog) {
  const baseline = desiredFromState(state);
  assert(baseline.enabled && state.syncState === 'applied' && !state.effectiveStale && state.dsaRevision === baseline.revision, '需要已同步的当前政策');
  const routes = [
    { key: key('DAILY_TRADING_STATUS'), targets: [primary, backup], enabled: true },
    { key: key('RISK_WARNING'), targets: [primary], enabled: true },
  ];
  assert(catalog.status === 'complete', '需要完整目录');
  for (const route of routes) {
    assert(!baseline.routes.some((item) => marketRouteKeyIdV3(item.key) === marketRouteKeyIdV3(route.key)), '已有功能选择不得覆盖');
    for (const target of route.targets) {
      assert(providers.find((item) => item.providerId === target.providerId)?.enabled, '仅使用原已启用来源');
      const entries = catalog.entries.filter((item) => marketRouteKeyIdV3(item.key) === marketRouteKeyIdV3(route.key) &&
        item.target.providerId === target.providerId && item.target.upstreamSource === target.upstreamSource);
      assert(entries.length === 1 && entries[0].state === 'ready' && entries[0].querySupport, '目标必须唯一就绪且有参数资格');
      if (route.key.capability === 'RISK_WARNING') assert(entries[0].querySupport.detailKinds.includes('coarseST'), '只查询粗 ST');
    }
  }
  const policies = [true, false, true].map((enabled, i) => desiredProviderPolicyV3Schema.parse({
    ...baseline, revision: baseline.revision + i + 1, requestId: randomUUID(),
    routes: [...baseline.routes, { ...routes[0], enabled }, routes[1]],
  }));
  return { caseVersion: 1, caseId: randomUUID(), baseline, policies, baselineFingerprint: policyFingerprint(baseline),
    fingerprints: policies.map(policyFingerprint), symbol: '000995.SZ', range: { start: '2023-08-17', end: '2023-08-17' } };
}

export function epochRequests(plan) {
  const base = { contractVersion: 3, capabilityVersion: 1, consumer: 'thesis-ledger', symbol: plan.symbol, range: plan.range };
  return [
    { ...base, requestId: `${plan.caseId}:status`, routeKey: key('DAILY_TRADING_STATUS') },
    { ...base, requestId: `${plan.caseId}:risk`, routeKey: key('RISK_WARNING'), detail: { kind: 'coarseST' } },
  ];
}

export function resumeEpochCase(plan, record) {
  assert(record.phase === 'restored' && record.restoredRevision === plan.baseline.revision &&
    record.plan.caseVersion === 1 && record.plan.baselineFingerprint === plan.baselineFingerprint,
    '只有本案例已确认恢复且原选择相同才允许继续');
  assert(record.plan.symbol === plan.symbol && JSON.stringify(record.plan.range) === JSON.stringify(plan.range) &&
    JSON.stringify(record.plan.fingerprints) === JSON.stringify(plan.fingerprints), '继续案例的证券/窗口/操作范围变化');
  assert((record.attempt ?? 1) === 1, '不自动反复执行目标验收');
  return { ...plan, caseId: record.plan.caseId };
}

export function verifyEpochStage(plan, stage, proof, previous) {
  const revision = plan.policies[stage].revision;
  const actual = (value, capability, target) => {
    assert(value.result.policyRevision === revision && value.result.symbol === plan.symbol &&
      value.result.routeKey.capability === capability && value.result.routeTarget.providerId === target.providerId &&
      value.result.routeTarget.upstreamSource === target.upstreamSource, '实际来源/政策/能力不匹配');
  };
  actual(proof.risk, 'RISK_WARNING', primary);
  if (stage === 1) {
    assert(proof.statusError === 'control-rejected' && proof.statusDataCalls === 0, '关闭状态功能仍产生数据请求');
    assert(proof.riskDataCalls === 1, '关闭状态不能关闭独立风险功能');
    return;
  }
  actual(proof.status, 'DAILY_TRADING_STATUS', primary);
  actual(proof.repeated, 'DAILY_TRADING_STATUS', primary);
  assert(proof.status.result.coverage.complete && proof.risk.result.coverage.complete, '缓存案例需真实完整状态和粗 ST');
  const observed = proof.status.result.clock.observedAt;
  assert(observed === proof.risk.result.clock.observedAt && observed === proof.repeated.result.clock.observedAt,
    '同源状态/粗 ST/重复读取未复用规范化获取');
  assert(proof.status.result.requestId !== proof.repeated.result.requestId, '缓存不能复用请求身份');
  if (stage === 2) assert(observed !== previous.status.result.clock.observedAt, '新政策代次复用了旧获取时钟');
  if (stage === 0) {
    actual(proof.fallback, 'DAILY_TRADING_STATUS', backup);
    assert(proof.fallback.result.routeTarget.routeIndex === 1 && proof.injected === 1 && proof.fallbackDataCalls === 2, '故障必须仅一次且最多两个目标');
    assert(proof.fallback.attempts.length === 2 && proof.fallback.attempts[0].error === 'unavailable' && proof.fallback.attempts[1].error === null,
      '原 Reader 未按现行主备切源');
    assert(proof.fallback.result.days[0]?.state === 'suspended', '公告备用事实不匹配');
  }
}

/** 每次写入和恢复都核对已确认版本/指纹；提交不明或并行变化时停止覆盖。 */
export async function executeEpochCase(api, plan, journal, read) {
  let owned = null;
  const proofs = [];
  await journal({ phase: 'prepared', plan, owned, proofs });
  try {
    for (let stage = 0; stage < plan.policies.length; stage++) {
      const current = desiredFromState(await api.get('/api/market-data/policy'));
      const expected = stage === 0 ? plan.baseline : plan.policies[stage - 1];
      assert(current.revision === expected.revision && policyFingerprint(current) === policyFingerprint(expected), '写入前政策已变化');
      await journal({ phase: 'submitting', stage, plan, owned, proofs });
      const saved = await api.put('/api/market-data/policy', { ...plan.policies[stage], expectedRevision: current.revision });
      assert(saved.revision === plan.policies[stage].revision && policyFingerprint(desiredFromState(saved)) === plan.fingerprints[stage], '提交结果未确认');
      owned = stage;
      await journal({ phase: 'confirmed', stage, plan, owned, proofs });
      const applied = await api.get('/api/market-data/policy');
      assert(applied.syncState === 'applied' && !applied.effectiveStale && applied.dsaRevision === saved.revision, '功能政策尚未生效');
      const proof = await read(stage, epochRequests(plan));
      verifyEpochStage(plan, stage, proof, proofs[0]);
      proofs.push(proof);
      await journal({ phase: 'queried', stage, plan, owned, proofs });
    }
  } finally {
    if (owned !== null) {
      const current = desiredFromState(await api.get('/api/market-data/policy'));
      assert(current.revision === plan.policies[owned].revision && policyFingerprint(current) === plan.fingerprints[owned], '并行或提交不明，停止覆盖恢复');
      const restored = await api.put('/api/market-data/policy', { ...plan.baseline, revision: current.revision + 1,
        requestId: `${plan.caseId}:restore`, expectedRevision: current.revision });
      assert(policyFingerprint(desiredFromState(restored)) === plan.baselineFingerprint, '恢复结果未确认');
      await journal({ phase: 'restored', plan, owned, proofs, restoredRevision: restored.revision });
    }
  }
  const final = await api.get('/api/market-data/policy');
  assert(final.syncState === 'applied' && !final.effectiveStale && final.dsaRevision === final.revision &&
    policyFingerprint(desiredFromState(final)) === plan.baselineFingerprint, '最终政策尚未恢复生效');
  await journal({ phase: 'verified', plan, owned, proofs, restoredRevision: final.revision });
  return { caseId: plan.caseId, restoredRevision: final.revision, stages: proofs.length };
}
