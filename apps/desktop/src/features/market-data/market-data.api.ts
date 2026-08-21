import { getDesktopApiClient } from '../../shared/api/client.js';
import type { CatalogStatus, MarketPolicy, ProviderManifest } from './market-data.types.js';

const api = () => getDesktopApiClient();

export const fetchMarketPolicy = () => api().request<MarketPolicy>('/market-data/policy');
export const fetchMarketProviders = async () =>
  (await api().request<{ providers?: ProviderManifest[] }>('/market-data/providers')).providers ?? [];
export const fetchCatalogStatus = () => api().request<CatalogStatus>('/market-data/catalog/status');
export const fetchCatalogJob = (jobId: string) =>
  api().request<CatalogStatus>(`/market-data/catalog/jobs/${encodeURIComponent(jobId)}`);

export const saveMarketPolicy = (policy: MarketPolicy) =>
  api().request<MarketPolicy>('/market-data/policy', {
    method: 'PUT',
    body: JSON.stringify({
      contractVersion: 1,
      consumer: 'thesis-ledger',
      requestId: crypto.randomUUID(),
      revision: policy.revision + 1,
      enabled: policy.enabled,
      routes: policy.routes,
    }),
  });

export const saveMarketProvider = (provider: ProviderManifest, credential?: string) =>
  api().request(`/market-data/providers/${encodeURIComponent(provider.providerId)}/config`, {
    method: 'POST',
    body: JSON.stringify({ enabled: provider.enabled, ...(credential ? { credential } : {}) }),
  });

export const clearMarketProviderCredential = (provider: ProviderManifest) =>
  api().request(`/market-data/providers/${encodeURIComponent(provider.providerId)}/config`, {
    method: 'POST',
    body: JSON.stringify({ enabled: provider.enabled, clearCredentials: true }),
  });

export const testMarketProvider = (
  provider: ProviderManifest,
  credential?: string,
) =>
  api().request<{
    status?: string;
    capabilityResults?: Record<string, { status?: string; errorCode?: string }>;
  }>(`/market-data/providers/${encodeURIComponent(provider.providerId)}/test`, {
    method: 'POST',
    body: JSON.stringify(credential ? { credential } : {}),
  });

export const removeMarketProvider = (providerId: string) =>
  api().request<{
    removed?: boolean;
    pending?: boolean;
    message?: string;
    policy?: MarketPolicy;
    routeDiff?: unknown[];
  }>(`/market-data/providers/${encodeURIComponent(providerId)}/remove`, { method: 'POST' });

export const startCatalogSync = () =>
  api().request<CatalogStatus>('/market-data/catalog/sync', { method: 'POST' });

export const searchMarketInstruments = (query: string) =>
  api().market.searchInstruments({ q: query, limit: 50 });

export const confirmMarketInstrument = (instrumentId: string) =>
  api().request(`/market-data/instruments/${encodeURIComponent(instrumentId)}/confirm`, {
    method: 'POST',
  });
