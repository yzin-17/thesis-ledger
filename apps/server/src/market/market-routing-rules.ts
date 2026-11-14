import {
  marketPolicyCategoryV3,
  marketRouteKeyIdV3,
  type DesiredProviderPolicyV3,
  type MarketRouteKeyV3,
  type RoutingAuthoring,
  type RoutingRule,
  type RoutingScope,
} from '@thesis-ledger/schemas';

export const localMaterialProviders = new Set([
  'official-states',
  'official-rules',
  'official-hk-rules',
  'official-us-rules',
  'official-dividends',
]);
export const routingProviderId = (id: string) =>
  localMaterialProviders.has(id) ? 'local-materials' : id;
export const routeProviders = (route?: DesiredProviderPolicyV3['routes'][number]) => [
  ...new Set(route?.targets.map((target) => routingProviderId(target.providerId)) ?? []),
];

export const routingScopeMatches = (scope: RoutingScope, key: MarketRouteKeyV3) =>
  scope.category === marketPolicyCategoryV3(key) &&
  (!scope.market || scope.market === key.market) &&
  (!scope.assetType || scope.assetType === key.assetType) &&
  (!scope.capability || scope.capability === key.capability) &&
  (!scope.timeframe || (key.kind === 'bar' && scope.timeframe === key.timeframe)) &&
  (!scope.adjustment || (key.kind === 'bar' && scope.adjustment === key.adjustment));

export function winningRoutingRule(rules: RoutingRule[], key: MarketRouteKeyV3) {
  return rules
    .filter((rule) => routingScopeMatches(rule.scope, key))
    .sort(
      (a, b) =>
        Object.values(b.scope).filter(Boolean).length -
        Object.values(a.scope).filter(Boolean).length,
    )[0];
}

export const exactRoutingScope = (key: MarketRouteKeyV3): RoutingScope => ({
  category: marketPolicyCategoryV3(key),
  market: key.market,
  assetType: key.assetType,
  capability: key.capability,
  ...(key.kind === 'bar' ? { timeframe: key.timeframe, adjustment: key.adjustment } : {}),
});

/** 只归纳实际配置，不采用建议默认值；未配置的精确项保留为空例外。 */
export function inferRoutingConfig(
  policy: Pick<DesiredProviderPolicyV3, 'enabled' | 'routes'>,
  keys: MarketRouteKeyV3[],
): RoutingAuthoring {
  const routes = policy.enabled ? policy.routes.filter((route) => route.enabled !== false) : [];
  const byId = new Map(routes.map((route) => [marketRouteKeyIdV3(route.key), route]));
  const allKeys = [
    ...new Map(
      [...policy.routes.map((route) => route.key), ...keys].map((key) => [
        marketRouteKeyIdV3(key),
        key,
      ]),
    ).values(),
  ];
  const rules: RoutingRule[] = [];
  const lift = (scope: RoutingScope, items: MarketRouteKeyV3[], parent: string[]) => {
    const counts = new Map<string, number>();
    for (const key of items) {
      const value = JSON.stringify(routeProviders(byId.get(marketRouteKeyIdV3(key))));
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '[]';
    const providers = JSON.parse(common) as string[];
    if (!scope.market || common !== JSON.stringify(parent)) rules.push({ scope, providers });
    const fields = ['market', 'assetType', 'capability', 'timeframe', 'adjustment'] as const;
    const next = fields.find((field) => !(field in scope));
    if (!next) return;
    const values = new Set(
      items.map((key) => (next in key ? String(key[next as keyof typeof key]) : '')),
    );
    for (const value of values) {
      if (!value) continue;
      const children = items.filter(
        (key) => next in key && String(key[next as keyof typeof key]) === value,
      );
      if (
        children.every(
          (key) => JSON.stringify(routeProviders(byId.get(marketRouteKeyIdV3(key)))) === common,
        )
      )
        continue;
      lift({ ...scope, [next]: value }, children, providers);
    }
  };
  for (const category of new Set(allKeys.map(marketPolicyCategoryV3)))
    lift(
      { category },
      allKeys.filter((key) => marketPolicyCategoryV3(key) === category),
      [],
    );
  return {
    version: 1,
    keys: allKeys,
    rules,
    preserved: routes.map((route) => ({ route, rule: winningRoutingRule(rules, route.key)! })),
  };
}

export const sameRoutingRule = (a: RoutingRule, b: RoutingRule) =>
  JSON.stringify(a.providers) === JSON.stringify(b.providers) &&
  JSON.stringify(a.upstreamSources ?? {}) === JSON.stringify(b.upstreamSources ?? {});
