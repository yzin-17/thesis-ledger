import {
  desiredProviderPolicyV3Schema,
  marketRouteKeyIdV3,
  statusCapabilityNamesV1,
  validateDesiredProviderPolicyV3,
} from '@thesis-ledger/schemas';

export const retiredStatus = 'HISTORICAL_TRADING_STATUS';

const sourceId = (key, target) =>
  JSON.stringify([key.market, key.assetType, target.providerId, target.upstreamSource]);

const isRetired = (route) => route.key.capability === retiredStatus;

function splitBindings(entries) {
  const bindings = new Map();
  for (const entry of entries) {
    if (entry.key.kind !== 'data' || !statusCapabilityNamesV1.includes(entry.key.capability)) continue;
    const id = sourceId(entry.key, entry.target);
    const keys = bindings.get(id) ?? new Map();
    keys.set(marketRouteKeyIdV3(entry.key), entry.key);
    bindings.set(id, keys);
  }
  return bindings;
}

function mapTickFlowDaily(route) {
  const { key } = route;
  if (key.kind !== 'bar' || key.capability !== 'DAILY_BAR' || key.market !== 'CN' ||
      key.assetType !== 'STOCK' || key.timeframe !== '1d') return route;
  const targets = route.targets.map((target) => {
    if (target.providerId !== 'tickflow-free' || target.upstreamSource !== 'tickflow-free-history') return target;
    // 统一后的 TickFlow 日线仍委托同一个免费历史读取器。
    return { providerId: 'tickflow', upstreamSource: 'tickflow' };
  });
  return { ...route, targets };
}

function convert(row, bindings, entries) {
  const { storageVersion, routes } = row.routes;
  if (storageVersion !== 'market-routing-policy-v1') throw new Error('历史路由存储合同不符');
  const original = desiredProviderPolicyV3Schema.parse({
    contractVersion: 1, consumer: row.consumer, requestId: 'market-policy-history-cutover',
    revision: row.revision, enabled: row.enabled, routes,
  });
  const explicit = new Set(original.routes.filter((route) => !isRetired(route))
    .map((route) => marketRouteKeyIdV3(route.key)));
  const converted = [];
  const blockers = [];
  for (const route of original.routes) {
    if (!isRetired(route)) {
      converted.push(mapTickFlowDaily(route));
      continue;
    }
    const additions = new Map();
    for (const target of route.targets) {
      const keys = bindings.get(sourceId(route.key, target));
      if (!keys) {
        blockers.push({ key: route.key, target, reason: 'missing_status_binding' });
        continue;
      }
      for (const [id, key] of keys) {
        if (explicit.has(id)) continue;
        const addition = additions.get(id) ?? { key, enabled: route.enabled !== false, targets: [] };
        addition.targets.push(target);
        additions.set(id, addition);
      }
    }
    converted.push(...additions.values());
  }

  for (const route of converted) {
    const ids = new Set(route.targets.map((target) => sourceId(route.key, target)));
    if (ids.size < route.targets.length)
      blockers.push({ key: route.key, reason: 'merged_target_conflict' });
  }
  if (blockers.length) return { before: row, nextRoutes: null, blockers };

  const candidate = desiredProviderPolicyV3Schema.parse({ ...original, routes: converted });
  for (const { path, reason } of validateDesiredProviderPolicyV3(candidate, entries)) {
    const route = candidate.routes[path[1]];
    blockers.push({ key: route.key, target: route.targets[path[3]], reason });
  }
  return { before: row, nextRoutes: blockers.length ? null : candidate.routes, blockers };
}

export function planMarketPolicyHistory(rows, catalog) {
  if (catalog.integrity !== 'complete') throw new Error('精确能力目录不完整');
  const bindings = splitBindings(catalog.entries);
  return rows.map((row) => convert(row, bindings, catalog.entries));
}
