import { desiredProviderPolicyV3Schema, marketRouteKeyIdV3, marketRouteKeyV3Schema, type DesiredProviderPolicyV3, type MarketRouteKeyV3 } from './market-route-v3.js';
import { marketRouteTargetSchema, type MarketRouteTarget } from './market-route-target.js';
import { isStatusCapabilityNameV1 } from './market-status-capability-id.js';

/** 来源绑定派生的迁移提示；不另建供应商到能力的人工登记表。 */
export type StatusRouteMigrationBindingV1 = {
  from: MarketRouteKeyV3; key: MarketRouteKeyV3; target: MarketRouteTarget;
};
export function previewStatusRouteMigrationV1(input: DesiredProviderPolicyV3, bindings: readonly StatusRouteMigrationBindingV1[]) {
  const original = desiredProviderPolicyV3Schema.parse(input);
  const draft = structuredClone(original);
  const facts = bindings.map((binding) => {
    const from = marketRouteKeyV3Schema.parse(binding.from);
    const key = marketRouteKeyV3Schema.parse(binding.key);
    const target = marketRouteTargetSchema.parse(binding.target);
    if (from.kind !== 'data' || from.capability !== 'HISTORICAL_TRADING_STATUS' || key.kind !== 'data' ||
      !isStatusCapabilityNameV1(key.capability) || key.market !== from.market || key.assetType !== from.assetType)
      throw new Error('迁移提示必须保留旧状态路由的市场与资产身份');
    return { from, key, target };
  });
  const changes: Array<{ key: MarketRouteKeyV3; state: 'created_disabled' | 'preserved'; requiresChoice: boolean }> = [];
  const unmapped: Array<{ key: MarketRouteKeyV3; target: MarketRouteTarget }> = [];
  for (const route of original.routes) {
    if (route.key.capability !== 'HISTORICAL_TRADING_STATUS') continue;
    const groups = new Map<string, { key: MarketRouteKeyV3; targets: MarketRouteTarget[]; indexes: number[] }>();
    route.targets.forEach((target, index) => {
      const matching = facts.filter((fact) => marketRouteKeyIdV3(fact.from) === marketRouteKeyIdV3(route.key) &&
        fact.target.providerId === target.providerId && fact.target.upstreamSource === target.upstreamSource);
      if (!matching.length) unmapped.push({ key: route.key, target });
      for (const fact of matching) {
        const id = marketRouteKeyIdV3(fact.key);
        const group = groups.get(id) ?? { key: fact.key, targets: [], indexes: [] };
        if (group.indexes.includes(index)) throw new Error('同一迁移目标重复登记');
        group.targets.push(target);
        group.indexes.push(index);
        groups.set(id, group);
      }
    });
    for (const [id, group] of groups) {
      const existing = draft.routes.some((entry) => marketRouteKeyIdV3(entry.key) === id);
      changes.push({ key: group.key, state: existing ? 'preserved' : 'created_disabled',
        requiresChoice: group.indexes[0] !== 0 });
      if (!existing) draft.routes.push({ key: group.key, targets: group.targets, enabled: false });
    }
  }
  return { draft: desiredProviderPolicyV3Schema.parse(draft), changes, unmapped };
}
