import {
  marketPolicyClientResponseSchema,
  marketProviderRegistrySchema,
  marketCatalogStatusSchema,
  marketProviderConfigResponseSchema,
  marketProviderTestResponseSchema,
  marketProviderRemovalProjectionSchema,
} from '@thesis-ledger/schemas';

type ParsedSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};
type Request = <T>(path: string, schema: ParsedSchema<T>, init?: RequestInit) => Promise<T>;

export function marketControlClient(request: Request) {
  const providerPath = (id: string, action: string) =>
    `/api/market-data/providers/${encodeURIComponent(id)}/${action}`;
  return {
    getPolicy: () => request('/api/market-data/policy', marketPolicyClientResponseSchema),
    getProviderRegistry: () => request('/api/market-data/providers', marketProviderRegistrySchema),
    getCatalogStatus: () => request('/api/market-data/catalog/status', marketCatalogStatusSchema),
    configureProvider: (id: string, input: unknown) =>
      request(
        providerPath(id, 'config'),
        marketProviderConfigResponseSchema.refine((response) => response.providerId === id),
        { method: 'POST', body: JSON.stringify(input) },
      ),
    testProvider: (id: string, input: unknown, signal?: AbortSignal) =>
      request(
        providerPath(id, 'test'),
        marketProviderTestResponseSchema.refine((response) => response.providerId === id),
        { method: 'POST', body: JSON.stringify(input), signal: signal ?? null },
      ),
    removeProvider: (id: string) =>
      request(
        providerPath(id, 'remove'),
        marketProviderRemovalProjectionSchema.refine((response) => response.providerId === id),
        { method: 'POST' },
      ),
  };
}
