import {
  marketPolicyClientResponseSchema,
  marketRouteCapabilityV3Schema,
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

const catalogReadReasons = new Set([
  'catalog_partial',
  'control_timeout',
  'control_unauthorized',
  'unsupported_capability',
  'invalid_response',
  'control_unavailable',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const parseMarketPolicyResponse = (value: unknown): MarketPolicyResponse => {
  const parsed = marketPolicyClientResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error('路由策略响应无效：需要 V3 策略。');
  return parsed.data;
};

export const fetchMarketPolicy = () => api().market.getPolicy();

const parseRouteCatalogReadV3 = (value: unknown): MarketRouteCatalogReadV3 | null => {
  if (!isRecord(value) || value.contractVersion !== 3 || value.consumer !== 'thesis-ledger') {
    return null;
  }
  if (value.status !== 'complete' && value.status !== 'partial' && value.status !== 'unavailable') {
    return null;
  }
  const catalogRevision = value.catalogRevision;
  if (
    catalogRevision !== null &&
    (!Number.isInteger(catalogRevision) || (catalogRevision as number) <= 0)
  ) {
    return null;
  }
  const generatedAt = value.generatedAt;
  if (generatedAt !== null && typeof generatedAt !== 'string') return null;
  const reason = value.reason;
  if (reason !== null && (typeof reason !== 'string' || !catalogReadReasons.has(reason))) {
    return null;
  }
  if (!Array.isArray(value.entries)) return null;
  const entries: MarketRouteCatalogReadV3['entries'] = [];
  for (const entry of value.entries) {
    const parsed = marketRouteCapabilityV3Schema.safeParse(entry);
    if (!parsed.success) return null;
    entries.push(parsed.data);
  }
  if (value.status === 'complete' && reason !== null) return null;
  if (value.status !== 'complete' && entries.length > 0) return null;
  if (value.status === 'partial' && reason !== 'catalog_partial') return null;
  if (value.status === 'unavailable' && reason === null) return null;

  return {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    status: value.status,
    catalogRevision: catalogRevision as number | null,
    generatedAt,
    entries,
    reason: reason as MarketRouteCatalogReadV3['reason'],
  };
};

export const fetchMarketRouteCapabilitiesV3 = async (): Promise<MarketRouteCatalogReadV3> => {
  const response = await api().request<unknown>(
    '/api/market-data/routes/capabilities?contractVersion=3',
  );
  const parsed = parseRouteCatalogReadV3(response);
  if (parsed) return parsed;
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
) => api().market.testProvider(provider.providerId, credentials ? { credentials } : {}, signal);

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
