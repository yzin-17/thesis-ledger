export type RouteMatrix = Record<string, Record<string, string[]>>;
export type SyncState = 'pending' | 'applied' | 'rejected' | 'unknown';

export interface MarketPolicy {
  revision: number;
  enabled: boolean;
  routes: RouteMatrix;
  syncState: SyncState;
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
  updatedAt?: string | null;
  health?: { scopes?: Array<{ state?: string; circuit?: string; errorCode?: string | null }> };
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

export const routeLabel = (capability: string, instrumentType: string) =>
  routeDefinitions.find(
    ([itemCapability, itemType]) => itemCapability === capability && itemType === instrumentType,
  )?.[2] ?? `${capability} / ${instrumentType}`;

export const providerDisplay = (provider: ProviderManifest) =>
  `${provider.displayName} (${provider.providerId})`;

export const providerHealthLabel = (provider: ProviderManifest) => {
  const scopes = provider.health?.scopes ?? [];
  if (scopes.some((scope) => scope.circuit === 'open')) return '熔断';
  if (scopes.some((scope) => scope.state === 'degraded')) return '降级';
  if (scopes.some((scope) => scope.state === 'healthy')) return '健康';
  return provider.credentialConfigured ? '待检查' : '未配置';
};
