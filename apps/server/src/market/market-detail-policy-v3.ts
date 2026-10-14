import { effectiveProviderPolicyV3Schema } from '@thesis-ledger/schemas';

export type DetailPolicySnapshot = {
  enabled: boolean;
  routes: Record<string, Record<string, Array<{ providerId: string; upstreamSource: string }>>>;
};

export { marketRouteMarket as detailPolicyMarket } from './market-symbol-identity.js';

export function readDetailPolicySnapshot(
  raw: Record<string, unknown>,
): DetailPolicySnapshot | null {
  const parsed = effectiveProviderPolicyV3Schema.safeParse(raw.effectiveProjection);
  if (!parsed.success || raw.syncState !== 'applied') return null;
  const policy = parsed.data;
  if (
    policy.revision !== raw.revision ||
    policy.sourceDesiredRevision !== raw.revision ||
    raw.dsaRevision !== raw.revision ||
    policy.enabled !== raw.enabled
  )
    return null;

  const routes: DetailPolicySnapshot['routes'] = {};
  for (const route of policy.routes) {
    if (route.key.kind !== 'data' || route.reason !== null) continue;
    const types = (routes[`${route.key.market}:${route.key.capability}`] ??= {});
    types[route.key.assetType] = route.targets
      .filter((target) => target.eligible)
      .map(({ providerId, upstreamSource }) => ({ providerId, upstreamSource }));
  }
  return { enabled: policy.enabled, routes };
}
