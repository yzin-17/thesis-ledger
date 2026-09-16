import { getDesktopApiClient } from '../../shared/api/client.js';
import type {
  CatalogStatus,
  MarketPolicy,
  ProviderManifest,
  ProviderCredentialDraft,
} from './market-data.types.js';

const api = () => getDesktopApiClient();

export const fetchMarketPolicy = () => api().request<MarketPolicy>('/api/v2/market-data/policy');
export const fetchMarketProviders = async () =>
  (await api().request<{ providers?: ProviderManifest[] }>('/api/v2/market-data/providers')).providers ??
  [];
export const fetchCatalogStatus = () => api().request<CatalogStatus>('/api/v2/market-data/catalog/status');
export const fetchCatalogJob = (jobId: string) =>
  api().request<CatalogStatus>(`/api/v2/market-data/catalog/jobs/${encodeURIComponent(jobId)}`);

export const saveMarketPolicy = (policy: MarketPolicy) =>
  api().request<MarketPolicy>('/api/v2/market-data/policy', {
    method: 'PUT',
    body: JSON.stringify({
      contractVersion: 2,
      consumer: 'thesis-ledger',
      requestId: crypto.randomUUID(),
      revision: policy.revision + 1,
      enabled: policy.enabled,
      routes: policy.routes,
    }),
  });

export const saveMarketProviderCredentials = (
  providerId: string,
  credentials: ProviderCredentialDraft,
) =>
  api().request(`/api/v2/market-data/providers/${encodeURIComponent(providerId)}/config`, {
    method: 'POST',
    body: JSON.stringify({ credentials }),
  });

export const setMarketProviderEnabled = (providerId: string, enabled: boolean) =>
  api().request<{ providerId: string; enabled: boolean }>(
    `/api/v2/market-data/providers/${encodeURIComponent(providerId)}/config`,
    { method: 'POST', body: JSON.stringify({ enabled }) },
  );

export const clearMarketProviderCredential = (provider: ProviderManifest) =>
  api().request(`/api/v2/market-data/providers/${encodeURIComponent(provider.providerId)}/config`, {
    method: 'POST',
    body: JSON.stringify({ clearCredentials: true }),
  });

export const testMarketProvider = (
  provider: ProviderManifest,
  credentials?: ProviderCredentialDraft,
  signal?: AbortSignal,
) =>
  api().request<{
    status?: string;
    capabilityResults?: Record<
      string,
      { status?: string; errorCode?: string; attempted?: boolean; readOnly?: boolean }
    >;
  }>(`/api/v2/market-data/providers/${encodeURIComponent(provider.providerId)}/test`, {
    method: 'POST',
    body: JSON.stringify(credentials ? { credentials } : {}),
    signal: signal ?? null,
  });

export const removeMarketProvider = (providerId: string) =>
  api().request<{
    removed?: boolean;
    pending?: boolean;
    message?: string;
    policy?: MarketPolicy;
    routeDiff?: unknown[];
  }>(`/api/v2/market-data/providers/${encodeURIComponent(providerId)}/remove`, { method: 'POST' });

export const startCatalogSync = () =>
  api().request<CatalogStatus>('/api/v2/market-data/catalog/sync', { method: 'POST' });

export const searchMarketInstruments = (query: string) =>
  api().market.searchInstruments({ q: query, limit: 50 });

export const confirmMarketInstrument = (instrumentId: string) =>
  api().request(`/api/v2/market-data/instruments/${encodeURIComponent(instrumentId)}/confirm`, {
    method: 'POST',
  });
