import {
  isExactRoutingScope,
  routingScopeId,
  type RoutingAuthoring,
  type RoutingScope,
} from '@thesis-ledger/schemas';
import {
  routingScopeChildren,
  routingScopeName,
  routingScopePath,
  type RoutingScopeNode,
} from './routing-scope-tree.js';

export const routingFilterFields = [
  'market',
  'assetType',
  'capability',
  'timeframe',
  'adjustment',
] as const;
export type RoutingScopeFilter = Record<(typeof routingFilterFields)[number], string>;
export const emptyRoutingFilter: RoutingScopeFilter = {
  market: 'all',
  assetType: 'all',
  capability: 'all',
  timeframe: 'all',
  adjustment: 'all',
};

export function routingFlatScopes(
  config: RoutingAuthoring,
  category: RoutingScope['category'],
): RoutingScopeNode[] {
  const scopes = new Map<string, RoutingScope>();
  const visit = (scope: RoutingScope) => {
    scopes.set(routingScopeId(scope), scope);
    for (const child of routingScopeChildren(config, scope)) visit(child.scope);
  };
  visit({ category });
  for (const rule of config.rules) {
    if (rule.scope.category === category) scopes.set(routingScopeId(rule.scope), rule.scope);
  }
  return [...scopes.values()].filter(isExactRoutingScope).map((scope) => ({
    scope,
    label: routingScopePath(scope).split(' · ').slice(1).join(' · '),
  }));
}

export function filterRoutingScopes(rows: RoutingScopeNode[], filter: RoutingScopeFilter) {
  return rows.filter(({ scope }) =>
    routingFilterFields.every((field) => filter[field] === 'all' || scope[field] === filter[field]),
  );
}

export function routingScopeFilterItems(rows: RoutingScopeNode[], field: keyof RoutingScopeFilter) {
  const values = new Map<string, string>();
  for (const { scope } of rows) {
    const value = scope[field];
    if (value) values.set(value, routingScopeName({ category: scope.category, [field]: value }));
  }
  return [...values].map(([value, label]) => ({ value, label }));
}
