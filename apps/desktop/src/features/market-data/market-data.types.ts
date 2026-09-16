export interface RouteTarget {
  providerId: string;
  upstreamSource: string;
}
export type RouteMatrixV2 = Record<string, Record<string, RouteTarget[]>>;
export type SyncState = 'pending' | 'applied' | 'rejected' | 'unknown';

export interface MarketPolicy {
  contractVersion: 2;
  revision: number;
  enabled: boolean;
  routes: RouteMatrixV2;
  syncState?: SyncState;
  dsaRevision?: number | null;
  lastError?: { code?: string; message?: string } | null;
  effectiveProjection?: Record<string, unknown> | null;
}

export interface ProviderManifest {
  providerId: string;
  displayName: string;
  version: number;
  capabilities: Record<string, string[]>;
  configured: boolean;
  enabled: boolean;
  credentialConfigured: boolean;
  requiresCredential?: boolean;
  origin?: 'dsa';
  markets?: string[];
  configurationMode?: 'control' | 'built_in' | 'dsa_environment';
  credentialSource?: 'control' | 'environment' | 'none' | 'built_in';
  credentialMethod?: string | null;
  credentialFieldsConfigured?: Record<string, boolean>;
  credentialSchema?: { methods: Array<{ method: string; fields: CredentialField[] }> };
  configVersion?: number;
  upstreamSources?: Array<{ sourceId: string; displayName: string; capabilities: Record<string, string[]> }>;
  updatedAt?: string | null;
  health?: { scopes?: Array<{ state?: string; circuit?: string; errorCode?: string | null }> };
}

export interface CredentialField {
  name: string;
  secret: boolean;
  required: boolean;
}

export interface ProviderCredentialDraft {
  method: string;
  values: Record<string, string>;
}

export interface CatalogStatus {
  generation: number;
  checksum?: string;
  instrumentCount?: number;
  status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'timeout';
  id?: string;
  acknowledged?: boolean;
}

export interface InstrumentResult {
  id: string;
  symbol: string;
  canonicalCode: string;
  instrumentType: string;
  market: string;
  displayName: string;
  confirmable: boolean;
  disabledReason?: string | null;
}

export const routeDefinitions = [
  ['REALTIME_QUOTE', 'STOCK', '实时行情'],
  ['REALTIME_QUOTE', 'ETF', 'ETF 实时行情'],
  ['DAILY_BAR', 'STOCK', '日线 Bar'],
  ['DAILY_BAR', 'ETF', 'ETF 日线 Bar'],
  ['FUND_NAV', 'MUTUAL_FUND', '基金单位净值'],
  ['FUND_NAV_HISTORY', 'MUTUAL_FUND', '基金净值历史'],
  ['CHIP_SUMMARY', 'STOCK', '筹码摘要'],
] as const;

export const routeCandidates = (policy: MarketPolicy, capability: string, instrumentType: string) =>
  policy.routes[capability]?.[instrumentType] ?? [];

export const routeTargets = routeCandidates;

export const routeLabel = (capability: string, instrumentType: string) =>
  routeDefinitions.find(
    ([itemCapability, itemType]) => itemCapability === capability && itemType === instrumentType,
  )?.[2] ?? `${capability} / ${instrumentType}`;

export const providerDisplay = (provider: ProviderManifest) =>
  `${provider.displayName} (${provider.providerId})`;

export const compatibleProviders = (
  providers: readonly ProviderManifest[],
  capability: string,
  instrumentType: string,
) => providers.filter((provider) => provider.capabilities[capability]?.includes(instrumentType));

export const sameRouteTarget = (
  left: RouteTarget | null | undefined,
  right: RouteTarget | null | undefined,
) =>
  left?.providerId === right?.providerId && left?.upstreamSource === right?.upstreamSource;

export const routeTargetKey = (target: RouteTarget) =>
  `${encodeURIComponent(target.providerId)}:${encodeURIComponent(target.upstreamSource)}`;

export type RouteTargetOption = {
  key: string;
  label: string;
  sourceDisplayName: string;
  target: RouteTarget;
  provider: ProviderManifest;
};

export const compatibleRouteTargets = (
  providers: readonly ProviderManifest[],
  capability: string,
  instrumentType: string,
): RouteTargetOption[] =>
  compatibleProviders(providers, capability, instrumentType).flatMap((provider) =>
    (provider.upstreamSources ?? [])
      .filter((source) => source.capabilities[capability]?.includes(instrumentType) ?? false)
      .map((source) => {
      const target = { providerId: provider.providerId, upstreamSource: source.sourceId };
      return {
        key: routeTargetKey(target),
        label: `${provider.displayName} · ${source.displayName}`,
        sourceDisplayName: source.displayName,
        target,
        provider,
      };
    }),
  );

export const updateRouteRole = (
  policy: MarketPolicy,
  capability: string,
  instrumentType: string,
  role: 'primary' | 'fallback',
  target: RouteTarget | null,
): MarketPolicy => {
  const [currentPrimary, currentFallback] = routeCandidates(policy, capability, instrumentType);
  let next: RouteTarget[] = [];
  if (role === 'primary' && target) {
    next = [target];
    if (currentFallback && !sameRouteTarget(currentFallback, target)) next.push(currentFallback);
  } else if (role === 'fallback' && currentPrimary) {
    next = [currentPrimary];
    if (target && !sameRouteTarget(target, currentPrimary)) next.push(target);
  }
  return {
    ...policy,
    routes: {
      ...policy.routes,
      [capability]: { ...policy.routes[capability], [instrumentType]: next },
    },
  };
};

export const upstreamSourceDisplay = (source: string | null | undefined) => {
  if (source === 'eastmoney') return '东方财富';
  if (source === 'sina') return '新浪财经';
  if (source === 'tencent') return '腾讯财经';
  return source ?? null;
};

export const dataSourceDisplay = (
  providerId: string,
  upstreamSource?: string | null,
  providers: readonly ProviderManifest[] = [],
) => {
  const provider = providers.find((item) => item.providerId === providerId);
  let providerName = provider?.displayName ?? providerId;
  if (!provider && providerId === 'akshare') providerName = 'AKShare';
  else if (!provider && providerId === 'tencent') providerName = '腾讯财经';
  const upstreamName = upstreamSourceDisplay(upstreamSource);
  return upstreamName && upstreamName !== providerName
    ? `${providerName} · ${upstreamName}`
    : providerName;
};

export const providerHealthLabel = (provider: ProviderManifest) => {
  const scopes = provider.health?.scopes ?? [];
  if (scopes.some((scope) => scope.circuit === 'open')) return '熔断';
  if (scopes.some((scope) => scope.state === 'degraded')) return '降级';
  if (scopes.some((scope) => scope.state === 'healthy')) return '健康';
  return provider.configured ? '待检查' : '未配置';
};
