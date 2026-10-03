import {
  effectiveProviderPolicyV3Schema,
  marketRouteKeyIdV3,
  validateDesiredProviderPolicyV3,
  type DesiredProviderPolicyV3,
  type EffectiveProviderPolicyV3,
  type MarketRouteCatalogV3,
} from '@thesis-ledger/schemas';

type CatalogIssue = { path: (string | number)[]; reason: string };
type DesiredRoute = DesiredProviderPolicyV3['routes'][number];
type EffectiveRoute = EffectiveProviderPolicyV3['routes'][number];

const retainsRoute = (route: DesiredRoute, previous: EffectiveRoute | undefined) =>
  previous !== undefined &&
  previous.targets.length === route.targets.length &&
  route.targets.every(
    (target, index) =>
      target.providerId === previous.targets[index]?.providerId &&
      target.upstreamSource === previous.targets[index]?.upstreamSource,
  );

/** 保留已经应用的未改动配置；执行资格仍由 DSA 的最新 Effective 决定。 */
export const marketPolicyCatalogIssues = (
  policy: DesiredProviderPolicyV3,
  catalog: MarketRouteCatalogV3,
  previousEffective: unknown,
): CatalogIssue[] => {
  if (catalog.integrity === 'partial') {
    return policy.routes.flatMap((route, routeIndex) =>
      route.targets.map((_target, targetIndex) => ({
        path: ['routes', routeIndex, 'targets', targetIndex],
        reason: 'catalog_partial',
      })),
    );
  }

  const issues = validateDesiredProviderPolicyV3(policy, catalog.entries);
  const previous = effectiveProviderPolicyV3Schema.safeParse(previousEffective);
  if (
    !policy.enabled ||
    !previous.success ||
    !previous.data.enabled ||
    previous.data.sourceDesiredRevision > policy.revision
  ) {
    return issues;
  }

  const previousRoutes = new Map(
    previous.data.routes.map((route) => [marketRouteKeyIdV3(route.key), route]),
  );
  const retained = new Set(
    policy.routes
      .map((route, index) =>
        retainsRoute(route, previousRoutes.get(marketRouteKeyIdV3(route.key))) ? index : -1,
      )
      .filter((index) => index >= 0),
  );
  return issues.filter(
    (issue) =>
      !['credential_missing', 'quota_unavailable', 'not_admitted'].includes(issue.reason) ||
      !retained.has(Number(issue.path[1])),
  );
};
