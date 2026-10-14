import {
  validateDesiredProviderPolicyV3,
  type DesiredProviderPolicyV3,
  type MarketRouteCatalogV3,
} from '@thesis-ledger/schemas';

type CatalogIssue = { path: (string | number)[]; reason: string };

/** 保存用户选择只检查精确能力存在；当前执行资格由 DSA Effective 判断。 */
export const marketPolicyCatalogIssues = (
  policy: DesiredProviderPolicyV3,
  catalog: MarketRouteCatalogV3,
  _previousEffective: unknown,
): CatalogIssue[] => {
  void _previousEffective;
  if (catalog.integrity === 'partial') {
    return policy.routes.flatMap((route, routeIndex) =>
      route.targets.map((_target, targetIndex) => ({
        path: ['routes', routeIndex, 'targets', targetIndex],
        reason: 'catalog_partial',
      })),
    );
  }
  return validateDesiredProviderPolicyV3(policy, catalog.entries);
};
