import {
  marketPolicyClientResponseSchema,
  marketRouteCatalogReadClientV3Schema,
  type MarketProviderProbeRoute,
  type MarketProviderAccountLevel,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import type {
  MarketPolicyDraftV3,
  MarketPolicyResponse,
  MarketRouteCatalogReadV3,
  ProviderManifest,
  ProviderCredentialDraft,
} from './market-data.types.js';

const api = () => getDesktopApiClient();

export const parseMarketPolicyResponse = (value: unknown): MarketPolicyResponse => {
  const parsed = marketPolicyClientResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error('路由策略响应无效：需要 V3 策略。');
  return parsed.data;
};

export const fetchMarketPolicy = () => api().market.getPolicy();

export const fetchMarketRouteCapabilitiesV3 = async (): Promise<MarketRouteCatalogReadV3> => {
  const response = await api().request<unknown>(
    '/api/market-data/routes/capabilities?contractVersion=3',
  );
  const parsed = marketRouteCatalogReadClientV3Schema.safeParse(response);
  if (parsed.success) return parsed.data;
  return {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    status: 'unavailable',
    catalogRevision: null,
    generatedAt: null,
    entries: [],
    reason: 'invalid_response',
  };
};

export const fetchMarketProviders = async () =>
  (await api().market.getProviderRegistry()).providers;
export const fetchCatalogStatus = () => api().market.getCatalogStatus();
export const fetchCatalogJob = async (jobId: string) => api().market.catalogJob(jobId);

export const saveMarketPolicy = async (policy: MarketPolicyDraftV3) =>
  api().market.savePolicy({
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: crypto.randomUUID(),
    revision: policy.revision + 1,
    expectedRevision: policy.revision,
    enabled: policy.enabled,
    routes: policy.routes,
  });

export const retryMarketPolicy = async () => api().market.retryPolicy();

export const saveMarketProviderCredentials = (
  providerId: string,
  credentials: ProviderCredentialDraft | undefined,
  settings?: Record<string, unknown>,
  expectedConfigVersion?: number,
) =>
  api().market.configureProvider(providerId, {
    ...(credentials ? { credentials } : {}),
    ...(settings ? { settings } : {}),
    ...(expectedConfigVersion !== undefined ? { expectedConfigVersion } : {}),
  });

export const setMarketProviderEnabled = (providerId: string, enabled: boolean) =>
  api().market.configureProvider(providerId, { enabled });

export const clearMarketProviderCredential = (provider: ProviderManifest) =>
  api().market.configureProvider(provider.providerId, { clearCredentials: true });

export const testMarketProvider = (
  provider: ProviderManifest,
  credentials?: ProviderCredentialDraft,
  signal?: AbortSignal,
  route?: MarketProviderProbeRoute,
  purpose?: 'capability_read' | 'account_access',
  accountLevel?: MarketProviderAccountLevel,
) =>
  api().market.testProvider(
    provider.providerId,
    {
      ...(credentials ? { credentials } : {}),
      ...(route ? { route } : {}),
      ...(purpose ? { purpose } : {}),
      ...(accountLevel ? { accountLevel } : {}),
    },
    signal,
  );

export const removeMarketProvider = (providerId: string) => api().market.removeProvider(providerId);

export const startCatalogSync = async () => api().market.startCatalogSync();

export const searchMarketInstruments = (query: string) =>
  api().market.searchInstruments({ q: query, limit: 50 });

export const confirmMarketInstrument = (instrumentId: string) =>
  api().market.confirmInstrument(instrumentId);
