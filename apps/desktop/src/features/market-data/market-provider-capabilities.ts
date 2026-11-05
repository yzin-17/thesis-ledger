import type { MarketRouteCatalogReadV3, ProviderManifest } from './market-data.types.js';
import {
  routeKeyIdV3,
  routeKeyLabelV3,
  routeAvailabilityLabelV3,
} from './market-data-routes-v3.js';
import { isLocalHistoryProvider } from './market-local-history.js';
import { accountAccessLabel, accountAccessSelectable } from './provider-account-access.js';

/** 数据源说明与用户选择消费同一精确库存。 */
export const providerExactCapabilities = (
  provider: ProviderManifest,
  catalog: MarketRouteCatalogReadV3 | undefined,
) => {
  if (catalog?.status !== 'complete') return null;
  return catalog.entries
    .filter((entry) => entry.target.providerId === provider.providerId)
    .filter((entry) => !provider.accountAccessSupported || !!entry.accountAccess &&
      accountAccessSelectable(entry.accountAccess, Date.now(), provider.configVersion))
    .map((entry) => {
      const local = isLocalHistoryProvider(provider);
      let state = local ? '读取入口就绪' : '配置就绪';
      if (entry.accountAccess && !accountAccessSelectable(entry.accountAccess, Date.now(), provider.configVersion))
        state = accountAccessLabel(entry.accountAccess, Date.now(), provider.configVersion);
      else if (!provider.enabled) state = '已停用';
      else if (entry.state !== 'ready') state = routeAvailabilityLabelV3(entry.state) ?? '待检查';
      return {
        id: `${routeKeyIdV3(entry.key)}:${entry.target.upstreamSource}`,
        label: `${routeKeyLabelV3(entry.key)} · ${provider.upstreamSources?.find((source) => source.sourceId === entry.target.upstreamSource)?.displayName ?? provider.displayName}`,
        source: entry.target.upstreamSource,
        state,
      };
    });
};
