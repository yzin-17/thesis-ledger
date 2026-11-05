import { marketCatalogJobSchema } from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
export function marketCatalogClient(request: ParsedRequest) {
  return {
    startCatalogSync: () =>
      request('/api/market-data/catalog/sync', marketCatalogJobSchema, { method: 'POST' }),
    catalogJob: (id: string, signal?: AbortSignal) =>
      request(
        `/api/market-data/catalog/jobs/${encodeURIComponent(id)}`,
        marketCatalogJobSchema.refine((row) => row.id === id),
        { signal: signal ?? null },
      ),
  };
}
