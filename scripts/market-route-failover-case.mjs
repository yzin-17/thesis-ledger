import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { desiredProviderPolicyV3Schema, marketRouteKeyIdV3, marketBarQuerySemanticsV3Schema, barSeriesSchema } from '../packages/schemas/dist/index.js';

export const routeKey = Object.freeze({ kind: 'bar', market: 'CN', assetType: 'ETF', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' });
export const primary = Object.freeze({ providerId: 'hithink', upstreamSource: 'fund-market-historical' });
export const backup = Object.freeze({ providerId: 'tencent', upstreamSource: 'tencent' });
export const window = Object.freeze({ start: '2024-07-15', end: '2024-07-19' });
export const symbol = '510300.SH';
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const desiredFromState = (state) => desiredProviderPolicyV3Schema.parse({
  contractVersion: state.contractVersion, consumer: state.consumer, requestId: state.requestId,
  revision: state.revision, enabled: state.enabled, routes: state.routes,
});
export const policyFingerprint = (policy) => createHash('sha256').update(JSON.stringify({ enabled: policy.enabled, routes: policy.routes })).digest('hex');

export function createFailoverPlan(state, providers, catalog) {
  const baseline = desiredFromState(state);
  assert(state.syncState === 'applied' && state.effectiveStale === false && state.dsaRevision === baseline.revision, '当前政策必须已同步且没有过期投影');
  assert(baseline.enabled && catalog.status === 'complete', '需要完整目录及启用的现行政策');
  const id = marketRouteKeyIdV3(routeKey);
  const matches = baseline.routes.map((route, index) => ({ route, index })).filter(({ route }) => marketRouteKeyIdV3(route.key) === id);
  assert(matches.length === 1 && equal(matches[0].route.targets, [primary]), '仅接受现有 HiThink 单源 ETF qfq 路由');
  const source = providers.find((provider) => provider.providerId === primary.providerId);
  const alternate = providers.find((provider) => provider.providerId === backup.providerId);
  assert(source?.enabled && source.configured && alternate?.enabled && alternate.configured, '两个来源必须已经由用户配置并启用');
  assert(Number.isSafeInteger(source.configVersion) && source.configVersion >= 0, '缺少来源配置代次');
  for (const target of [primary, backup]) {
    const entries = catalog.entries.filter((entry) => marketRouteKeyIdV3(entry.key) === id && equal(entry.target, target));
    assert(entries.length === 1 && entries[0].state === 'ready', '目标必须存在唯一、就绪的精确能力');
    assert(marketBarQuerySemanticsV3Schema.parse(entries[0].barQuery).adjustment === 'qfq', '整窗口径合同必须匹配');
  }
  const temporary = structuredClone(baseline);
  temporary.revision += 1;
  temporary.requestId = randomUUID();
  temporary.routes[matches[0].index].targets.push({ ...backup });
  return { caseVersion: 1, caseId: randomUUID(), baseline, temporary, baselineConfigVersion: source.configVersion,
    baselineFingerprint: policyFingerprint(baseline), temporaryFingerprint: policyFingerprint(temporary),
    source: { providerId: source.providerId, enabled: source.enabled }, symbol, routeKey, window, primary, backup };
}

export function assertCase(plan) {
  assert(plan.caseVersion === 1 && plan.source.providerId === primary.providerId && plan.source.enabled === true, '恢复记录不属于本验收案例');
  const baseline = desiredFromState(plan.baseline);
  const temporary = desiredFromState(plan.temporary);
  const expected = structuredClone(baseline);
  const route = expected.routes.find((entry) => marketRouteKeyIdV3(entry.key) === marketRouteKeyIdV3(routeKey));
  assert(route && equal(route.targets, [primary]), '恢复基线不是预定单源路由');
  route.targets.push({ ...backup });
  assert(temporary.revision === baseline.revision + 1 && policyFingerprint(temporary) === policyFingerprint(expected), '恢复记录含越界政策修改');
  assert(plan.baselineFingerprint === policyFingerprint(baseline) && plan.temporaryFingerprint === policyFingerprint(temporary), '恢复摘要不匹配');
  assert(Number.isSafeInteger(plan.baselineConfigVersion) && plan.baselineConfigVersion >= 0, '恢复配置代次非法');
}

export function assertCaseSeries(raw, target, routeIndex, revision) {
  const series = barSeriesSchema.parse(raw);
  assert(equal(series.identity, { symbol, assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' }), '证券或价格口径不匹配');
  assert(series.provenance.providerId === target.providerId && series.provenance.upstreamSource === target.upstreamSource &&
    series.provenance.routeIndex === routeIndex && series.provenance.effectivePolicyRevision === revision, '实际来源或政策修订不匹配');
  assert(series.provenance.servedFromCache === false, '真实来源验收不能使用已有缓存结果');
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' });
  const dates = series.points.map((point) => day.format(new Date(point.timestamp)));
  assert(equal(dates, ['2024-07-15', '2024-07-16', '2024-07-17', '2024-07-18', '2024-07-19']), '需要同口径完整整窗，不能混价或拼补');
  return { providerId: series.provenance.providerId, upstreamSource: series.provenance.upstreamSource,
    routeIndex, revision, points: series.points.length, dates, acquisitionFingerprint: series.provenance.providerRevision };
}

/** 恢复只提交启用标记，原子条件失败时保留并行配置；不读取/复制凭据。 */
export async function restoreFailoverCase(api, plan, ownership) {
  assertCase(plan);
  const errors = [];
  try {
    const rows = (await api.get('/api/market-data/providers')).providers;
    const source = rows.find((row) => row.providerId === primary.providerId);
    assert(source, '恢复时来源已不存在');
    if (source.enabled !== plan.source.enabled) {
      assert(ownership.provider === true, '停用提交未获得确认，不能覆盖可能的并行操作；需要人工核对');
      assert(source.configVersion === plan.baselineConfigVersion + 1, '来源配置已有并行变化，停止自动恢复');
      await api.post(`/api/market-data/providers/${primary.providerId}/config`, {
        requestId: randomUUID(), enabled: plan.source.enabled, expectedConfigVersion: source.configVersion,
      });
    }
    const restored = (await api.get('/api/market-data/providers')).providers.find((row) => row.providerId === primary.providerId);
    assert(restored?.enabled === plan.source.enabled, '来源启用标记恢复未确认');
  } catch (error) { errors.push(error); }
  try {
    const current = desiredFromState(await api.get('/api/market-data/policy'));
    if (policyFingerprint(current) !== plan.baselineFingerprint) {
      assert(ownership.policy === true, '政策提交未获得确认，不能覆盖可能的并行操作；需要人工核对');
      assert(current.revision === plan.temporary.revision && policyFingerprint(current) === plan.temporaryFingerprint,
        '政策已有并行变化，停止自动恢复');
      await api.put('/api/market-data/policy', { ...plan.baseline, revision: current.revision + 1,
        requestId: randomUUID(), expectedRevision: current.revision });
    }
    const restored = await api.get('/api/market-data/policy');
    assert(policyFingerprint(desiredFromState(restored)) === plan.baselineFingerprint, '政策选择恢复未确认');
    assert(restored.syncState === 'applied' && restored.effectiveStale === false, '恢复政策尚未完成同步');
  } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, '恢复未完成；保留记录并停止，不能覆盖并行修改');
}
