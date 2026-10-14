import type {
  MarketPolicyDraftV3,
  MarketRouteCatalogReadV3,
  MarketPolicyResponse,
  ProviderManifest,
} from '../src/features/market-data/market-data.types.js';

export const key = {
  kind: 'bar',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
} as const;
export const target = { providerId: 'hithink', upstreamSource: 'fund-market-historical' };
export const provider: ProviderManifest = {
  providerId: 'hithink',
  displayName: 'HiThink',
  version: 1,
  capabilities: {},
  configured: true,
  enabled: true,
  requiresCredential: true,
  credentialConfigured: true,
};
export const draft: MarketPolicyDraftV3 = {
  contractVersion: 3,
  revision: 4,
  enabled: false,
  routes: [],
};
export const catalog: MarketRouteCatalogReadV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  status: 'complete',
  catalogRevision: 9,
  generatedAt: '2026-10-07T00:00:00Z',
  reason: null,
  entries: [{ key, target, state: 'ready' }],
};
export const policy: MarketPolicyResponse = {
  ...draft,
  consumer: 'thesis-ledger',
  requestId: 'fixture',
  syncState: 'applied',
  lastError: null,
  dsaRevision: 4,
  effectiveProjection: null,
  effectiveStale: false,
};
