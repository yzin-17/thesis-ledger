import {
  marketPolicyCategories,
  marketPolicyCategoryV3,
  type RoutingAuthoring,
  type RoutingConfigPreview,
  type RoutingConfigView,
} from '@thesis-ledger/schemas';

export function projectRoutingCoverage(
  draft: RoutingAuthoring,
  baseline: RoutingConfigView,
  preview: RoutingConfigPreview | null,
) {
  const pendingCategories = new Set(
    marketPolicyCategories
      .filter(({ id }) => {
        if (preview) return false;
        const scope = (config: RoutingAuthoring) => ({
          rules: config.rules.filter((rule) => rule.scope.category === id),
          keys: config.keys.filter((key) => marketPolicyCategoryV3(key) === id),
        });
        return JSON.stringify(scope(draft)) !== JSON.stringify(scope(baseline.config));
      })
      .map(({ id }) => id),
  );
  const diagnostics =
    preview?.diagnostics ??
    baseline.diagnostics.filter(
      (entry) => !pendingCategories.has(marketPolicyCategoryV3(entry.key)),
    );
  let label = '已保存覆盖诊断';
  if (preview) label = '草稿覆盖诊断';
  else if (pendingCategories.size) label = '已修改的大类待保存，其余保留已保存覆盖诊断';
  return { diagnostics, pendingCategories, label };
}
