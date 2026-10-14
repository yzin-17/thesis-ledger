import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { desiredProviderPolicyV3Schema, marketRouteKeyIdV3, statusCapabilityRequestV1Schema, correlateStatusCapabilityV1 } from '../packages/schemas/dist/index.js';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';

const definitions = [
  ['DAILY_TRADING_STATUS', 'official-states', 'cn-stock-daily-suspension', '000995.SZ', '2023-08-17', {}],
  ['RISK_WARNING', 'official-states', 'cn-stock-risk-price-limits', '000995.SZ', '2023-08-17', { detail: { kind: 'riskCategories', categories: ['delisting'] } }],
  ['DAILY_PRICE_RULE', 'official-states', 'cn-stock-risk-price-limits', '000995.SZ', '2023-08-17', { representation: 'rule' }],
  ['SECURITY_BASIC_DATES', 'baostock', 'baostock', '000995.SZ', null, {}],
  ['LISTING_PHASE', 'official-states', 'cn-stock-delisting-period', '600462.SH', '2025-07-10', {}],
];
export function createFunctionalCase(state, providers, catalog) {
  const baseline = desiredFromState(state);
  assert(baseline.enabled && state.syncState === 'applied' && !state.effectiveStale && state.dsaRevision === baseline.revision, '需要已同步的当前政策');
  assert(catalog.status === 'complete', '需要完整精确目录');
  const additions = definitions.map(([capability, providerId, upstreamSource]) => ({
    key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability }, targets: [{ providerId, upstreamSource }], enabled: true,
  }));
  for (const route of additions) {
    const id = marketRouteKeyIdV3(route.key);
    assert(!baseline.routes.some((item) => marketRouteKeyIdV3(item.key) === id), '已有功能政策不得被验收覆盖');
    assert(providers.find((item) => item.providerId === route.targets[0].providerId)?.enabled, '仅使用当前已启用来源');
    const entries = catalog.entries.filter((item) => marketRouteKeyIdV3(item.key) === id &&
      item.target.providerId === route.targets[0].providerId && item.target.upstreamSource === route.targets[0].upstreamSource);
    assert(entries.length === 1 && entries[0].state === 'ready', '每个功能需要唯一就绪的精确绑定');
  }
  const temporary = desiredProviderPolicyV3Schema.parse({ ...baseline, revision: baseline.revision + 1,
    requestId: randomUUID(), routes: [...baseline.routes, ...additions] });
  return { caseVersion: 1, caseId: randomUUID(), baseline, temporary,
    baselineFingerprint: policyFingerprint(baseline), temporaryFingerprint: policyFingerprint(temporary) };
}

export function functionalRequests(plan) {
  return definitions.map(([capability, providerId, upstreamSource, symbol, day, parameters]) => statusCapabilityRequestV1Schema.parse({
    contractVersion: 3, capabilityVersion: 1, consumer: 'thesis-ledger', requestId: `${plan.caseId}:${capability}`,
    symbol, routeKey: { kind: 'data', market: 'CN', assetType: 'STOCK', capability },
    routeTarget: { providerId, upstreamSource, routeIndex: 0 }, policyRevision: plan.temporary.revision,
    ...(day ? { range: { start: day, end: day } } : {}), ...parameters,
  }));
}
export function verifyFunctionalResults(plan, results) {
  const requests = functionalRequests(plan);
  assert(results.length === requests.length, '缺少功能结果');
  const parsed = results.map((result, index) => correlateStatusCapabilityV1(requests[index], result));
  assert(parsed[0].days[0]?.state === 'suspended', '公告状态事实不匹配');
  assert(parsed[1].days[0]?.delisting === 'active', '风险事实不匹配');
  assert(parsed[2].days[0]?.rule.kind === 'ratio', '必须保留比例规则');
  assert(parsed[3].dates.ipoDateStatus === 'known', '基础日期未取得，不能算真实验收通过');
  assert(parsed[4].days[0]?.phase === 'delistingPeriod', '上市阶段事实不匹配');
  return parsed;
}
