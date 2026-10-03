import { marketRouteKeyIdV3 } from '@thesis-ledger/schemas';
import type {
  MarketPolicyDraftV3,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from './market-data.types.js';
import { routeKeyLabelV3 } from './market-data-routes-v3.js';

export function hithinkPolicyPreset(
  policy: MarketPolicyDraftV3,
  catalog: MarketRouteCatalogReadV3 | undefined,
  providers: readonly ProviderManifest[],
) {
  const provider = providers.find((item) => item.providerId === 'hithink');
  if (catalog?.status !== 'complete') return { changes: [], reason: '精确能力目录尚未完整就绪。' };
  if (!provider?.configured || !provider.enabled || !provider.credentialConfigured)
    return { changes: [], reason: 'HiThink 尚未启用或完成凭据配置。' };
  const grouped = new Map<string, typeof catalog.entries>();
  for (const entry of catalog.entries) {
    if (entry.state !== 'ready' || entry.target.providerId !== 'hithink') continue;
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
      return [{ key: entry.key, targets: [entry.target], label: routeKeyLabelV3(entry.key) }];
    });
  return {
    changes,
    reason: changes.length ? null : '没有可补充的路由；已有选择保持不变，未就绪能力不会纳入。',
  };
}

export function applyHithinkPolicyPreset(
  policy: MarketPolicyDraftV3,
  catalog: MarketRouteCatalogReadV3 | undefined,
  providers: readonly ProviderManifest[],
): MarketPolicyDraftV3 {
  const { changes } = hithinkPolicyPreset(policy, catalog, providers);
  const changedIds = new Set(changes.map((change) => marketRouteKeyIdV3(change.key)));
  return {
    ...policy,
    routes: [
      ...policy.routes.filter((route) => !changedIds.has(marketRouteKeyIdV3(route.key))),
      ...changes.map(({ key, targets }) => ({ key, targets })),
    ],
  };
}
