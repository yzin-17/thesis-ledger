import { marketRouteKeyIdV3 } from '@thesis-ledger/schemas';
import type { MarketPolicyDraftV3 } from './market-data.types.js';

/** 将旧启停状态投影为来源配置；读取时不写回，也不恢复已停用来源。 */
export function configuredPolicyDraftV3(policy: MarketPolicyDraftV3): MarketPolicyDraftV3 {
  const routes = policy.enabled ? policy.routes.filter((route) => route.enabled !== false) : [];
  return {
    contractVersion: 1,
    revision: policy.revision,
    enabled: true,
    routes: routes
      .filter((route) => route.targets.length > 0)
      .map((route) => ({
        key: route.key,
        targets: route.targets,
        enabled: true,
      })),
  };
}

export function changedPolicyRouteIdsV3(
  policy: MarketPolicyDraftV3,
  baseline: MarketPolicyDraftV3 | null,
): Set<string> {
  const before = new Map(
    configuredPolicyDraftV3(baseline ?? { ...policy, routes: [] }).routes.map((route) => [
      marketRouteKeyIdV3(route.key),
      route.targets,
    ]),
  );
  const after = new Map(
    configuredPolicyDraftV3(policy).routes.map((route) => [
      marketRouteKeyIdV3(route.key),
      route.targets,
    ]),
  );
  const changed = new Set<string>();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) changed.add(id);
  }
  return changed;
}
