import type {
  DesiredProviderPolicyV3,
  EffectiveProviderPolicyV3,
  MarketRouteCapabilityV3,
} from '@thesis-ledger/schemas';

export interface RouteTarget {
  providerId: string;
  upstreamSource: string;
}
export type SyncState = 'pending' | 'applied' | 'rejected' | 'unknown';

export type MarketPolicyV3 = DesiredProviderPolicyV3 & {
  syncState?: SyncState;
  dsaRevision?: number | null;
  lastError?: MarketPolicyError | null;
  effectiveProjection?: EffectiveProviderPolicyV3 | null;
  effectiveStale?: boolean;
  catalogAudit?: {
    catalogRevision?: number | null;
    generatedAt?: string | null;
    integrity?: 'complete' | 'partial' | 'unavailable';
    checkedAt?: string;
  } | null;
};

export type MarketPolicy = MarketPolicyV3;
export type MarketPolicyResponse = MarketPolicyV3;

export type MarketPolicyDraftV3 = Pick<
  DesiredProviderPolicyV3,
  'contractVersion' | 'revision' | 'enabled' | 'routes'
>;

export type MarketPolicyError = {
  code?: string;
  message?: string;
  issues?: Array<{ path: Array<string | number>; reason: string }>;
};

export type RouteCatalogReadReasonV3 =
  | 'catalog_partial'
  | 'control_timeout'
  | 'control_unauthorized'
  | 'unsupported_capability'
  | 'invalid_response'
  | 'control_unavailable';

export interface MarketRouteCatalogReadV3 {
  contractVersion: 3;
  consumer: 'thesis-ledger';
  status: 'complete' | 'partial' | 'unavailable';
  catalogRevision: number | null;
  generatedAt: string | null;
  entries: MarketRouteCapabilityV3[];
  reason: RouteCatalogReadReasonV3 | null;
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
  upstreamSources?: Array<{
    sourceId: string;
    displayName: string;
    capabilities: Record<string, string[]>;
  }>;
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
  checksum?: string | null;
  instrumentCount?: number;
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
) => left?.providerId === right?.providerId && left?.upstreamSource === right?.upstreamSource;

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

export const upstreamSourceDisplay = (source: string | null | undefined) => {
  if (source === 'eastmoney') return '东方财富';
  if (source === 'sina') return '新浪财经';
  if (source === 'tencent') return '腾讯财经';
  if (source === 'a-share-prices-snapshot') return '同花顺 A 股快照';
  if (source === 'fund-market-snapshot') return '同花顺场内基金快照';
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
  const upstreamName =
    provider?.upstreamSources?.find((source) => source.sourceId === upstreamSource)?.displayName ??
    upstreamSourceDisplay(upstreamSource);
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
