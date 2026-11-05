import {
  marketProviderSaveInputSchema,
  marketProviderTestInputSchema,
  marketProviderConfigResponseSchema,
  marketProviderTestResponseSchema,
  marketProviderRemovalProjectionSchema,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
export function marketProviderControlClient(request: ParsedRequest) {
  const path = (id: string, action: string) =>
    `/api/market-data/providers/${encodeURIComponent(id)}/${action}`;
  return {
    configureProvider: (id: string, input: unknown, signal?: AbortSignal) => {
      marketProviderSaveInputSchema.parse(input);
      return request(
        path(id, 'config'),
        marketProviderConfigResponseSchema.refine((row) => row.providerId === id),
        { method: 'POST', body: JSON.stringify(input), signal: signal ?? null },
      );
    },
    testProvider: (id: string, input: unknown, signal?: AbortSignal) => {
      const parsed = marketProviderTestInputSchema.parse(input);
      return request(
        path(id, 'test'),
        marketProviderTestResponseSchema.refine(
          (row) =>
            row.providerId === id &&
            (row.purpose ?? 'capability_read') === (parsed.purpose ?? 'capability_read'),
        ),
        { method: 'POST', body: JSON.stringify(input), signal: signal ?? null },
      );
    },
    removeProvider: (id: string, signal?: AbortSignal) =>
      request(
        path(id, 'remove'),
        marketProviderRemovalProjectionSchema.refine((row) => row.providerId === id),
        { method: 'POST', signal: signal ?? null },
      ),
  };
}
