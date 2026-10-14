import { marketRouteKeyIdV3 } from '@thesis-ledger/schemas';
import type {
  MarketPolicyDraftV3,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from './market-data.types.js';

export function withDefaultHithinkRoutes(
  policy: MarketPolicyDraftV3,
  catalog: MarketRouteCatalogReadV3 | undefined,
  providers: readonly ProviderManifest[],
): MarketPolicyDraftV3 {
  const provider = providers.find((item) => item.providerId === 'hithink');
  if (catalog?.status !== 'complete') return policy;
  if (!provider) return policy;
  const grouped = new Map<string, typeof catalog.entries>();
  for (const entry of catalog.entries) {
    if (entry.target.providerId !== 'hithink') continue;
    const id = marketRouteKeyIdV3(entry.key);
    grouped.set(id, [...(grouped.get(id) ?? []), entry]);
  }
  const changes = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([id, entries]) => {
      if (
        policy.routes.some(
          (route) => marketRouteKeyIdV3(route.key) === id && route.targets.length > 0,
        )
      )
        return [];
      const targets = new Set(
        entries.map((entry) => `${entry.target.providerId}:${entry.target.upstreamSource}`),
      );
      if (targets.size !== 1) return [];
      const entry = entries[0]!;
      return [{ key: entry.key, targets: [entry.target] }];
    });
  if (!changes.length) return policy;
  const changedIds = new Set(changes.map((change) => marketRouteKeyIdV3(change.key)));
  return {
    ...policy,
    routes: [
      ...policy.routes.filter((route) => !changedIds.has(marketRouteKeyIdV3(route.key))),
      ...changes,
    ],
  };
}
