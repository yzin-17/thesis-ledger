import {
  marketPolicyCategoryV3,
  routingScopeId,
  type MarketRouteKeyV3,
  type RoutingAuthoring,
  type RoutingScope,
} from '@thesis-ledger/schemas';

export const routingScopeMatchesKey = (scope: RoutingScope, key: MarketRouteKeyV3) =>
  scope.category === marketPolicyCategoryV3(key) &&
  Object.entries(scope).every(
    ([field, value]) =>
      field === 'category' || (field in key && key[field as keyof typeof key] === value),
  );

export function routingInheritedRule(config: RoutingAuthoring, scope: RoutingScope) {
  return config.rules
    .filter((rule) =>
      Object.entries(rule.scope).every(
        ([key, value]) => scope[key as keyof RoutingScope] === value,
      ),
    )
    .sort((a, b) => Object.keys(b.scope).length - Object.keys(a.scope).length)[0];
}

export function updateRoutingScope(
  config: RoutingAuthoring,
  scope: RoutingScope,
  providers: string[] | null,
) {
  const own = config.rules.find((rule) => routingScopeId(rule.scope) === routingScopeId(scope));
  if (
    own &&
    providers !== null &&
    !own.upstreamSources &&
    JSON.stringify(own.providers) === JSON.stringify(providers)
  )
    return config;
  const rules = config.rules.filter((rule) => routingScopeId(rule.scope) !== routingScopeId(scope));
  if (providers !== null) rules.push({ scope, providers });
  return { ...config, rules };
}

export function updateRoutingScopeSelection(
  config: RoutingAuthoring,
  scope: RoutingScope,
  providers: string[],
) {
  const selected = routingInheritedRule(config, scope);
  const pins = Object.fromEntries(
    Object.entries(selected?.upstreamSources ?? {}).filter(([id]) => providers.includes(id)),
  );
  const next = updateRoutingScope(config, scope, providers);
  if (!Object.keys(pins).length) return next;
  return {
    ...next,
    rules: next.rules.map((rule) =>
      routingScopeId(rule.scope) === routingScopeId(scope)
        ? { ...rule, upstreamSources: pins }
        : rule,
    ),
  };
}

export function updateRoutingScopeBinding(
  config: RoutingAuthoring,
  scope: RoutingScope,
  providerId: string,
  upstreamSource: string | null,
) {
  if (!scope.capability) return config;
  const selected = routingInheritedRule(config, scope);
  if (!selected?.providers.includes(providerId)) return config;
  const upstreamSources = { ...selected.upstreamSources };
  if (upstreamSource === null) delete upstreamSources[providerId];
  else upstreamSources[providerId] = upstreamSource;
  const next = updateRoutingScope(config, scope, selected.providers);
  return {
    ...next,
    rules: next.rules.map((rule) =>
      routingScopeId(rule.scope) === routingScopeId(scope) ? { ...rule, upstreamSources } : rule,
    ),
  };
}

export const routingStateLabels = {
  covered: '主备覆盖',
  single_source: '仅单源',
  uncovered: '未覆盖',
  unavailable: '来源不可用',
  ambiguous: '需选择精确来源',
} as const;

export function routingConfigStatusLabel(dirty: boolean, syncState: string) {
  if (dirty) return '有未保存修改';
  if (syncState === 'applied') return '已应用';
  return '尚未应用';
}
export const routingCanPreview = (dirty: boolean, pendingChanges = 0, legacyRuleCount = 0) =>
  dirty || pendingChanges > 0 || legacyRuleCount > 0;
