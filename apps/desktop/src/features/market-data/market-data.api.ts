import {
  marketPolicyClientResponseSchema,
  marketRouteCatalogReadClientV3Schema,
  type MarketProviderProbeRoute,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { parseCatalogJobResponse } from './catalog-job-response.js';
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
export const fetchCatalogJob = async (jobId: string) =>
  parseCatalogJobResponse(
    await api().request<unknown>(`/api/market-data/catalog/jobs/${encodeURIComponent(jobId)}`),
    jobId,
  );

export const saveMarketPolicy = async (policy: MarketPolicyDraftV3) =>
  parseMarketPolicyResponse(
    await api().request<unknown>('/api/market-data/policy', {
      method: 'PUT',
      body: JSON.stringify({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: crypto.randomUUID(),
        revision: policy.revision + 1,
        expectedRevision: policy.revision,
        enabled: policy.enabled,
        routes: policy.routes,
      }),
    }),
  );

export const retryMarketPolicy = async () =>
  parseMarketPolicyResponse(
    await api().request<unknown>('/api/market-data/policy/retry', { method: 'POST' }),
  );

export const saveMarketProviderCredentials = (
  providerId: string,
  credentials: ProviderCredentialDraft,
) => api().market.configureProvider(providerId, { credentials });

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
) =>
  api().market.testProvider(
    provider.providerId,
    {
      ...(credentials ? { credentials } : {}),
      ...(route ? { route } : {}),
      ...(purpose ? { purpose } : {}),
    },
    signal,
  );

export const removeMarketProvider = (providerId: string) => api().market.removeProvider(providerId);

export const startCatalogSync = async () =>
  parseCatalogJobResponse(
    await api().request<unknown>('/api/market-data/catalog/sync', { method: 'POST' }),
  );

export const searchMarketInstruments = (query: string) =>
  api().market.searchInstruments({ q: query, limit: 50 });

export const confirmMarketInstrument = (instrumentId: string) =>
  api().request(`/api/market-data/instruments/${encodeURIComponent(instrumentId)}/confirm`, {
    method: 'POST',
  });
