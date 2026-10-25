import {
  marketPolicyClientResponseSchema,
  marketProviderRegistrySchema,
  marketCatalogStatusSchema,
} from '@thesis-ledger/schemas';
import { marketProviderControlClient } from './market-provider-control-client.js';
import type { ParsedRequest } from './parsed-request.js';
export function marketControlClient(request: ParsedRequest) {
  return {
    ...marketProviderControlClient(request),
    getPolicy: (signal?: AbortSignal) =>
      request('/api/market-data/policy', marketPolicyClientResponseSchema, {
        signal: signal ?? null,
      }),
    getProviderRegistry: (signal?: AbortSignal) =>
      request('/api/market-data/providers', marketProviderRegistrySchema, {
        signal: signal ?? null,
      }),
    getCatalogStatus: (signal?: AbortSignal) =>
      request('/api/market-data/catalog/status', marketCatalogStatusSchema, {
        signal: signal ?? null,
      }),
  };
}
