import {
  marketPolicyClientResponseSchema,
  marketPolicySaveInputSchema,
  marketRouteCatalogReadClientV3Schema,
  type MarketPolicySaveInput,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
export function marketPolicyClient(request: ParsedRequest) {
  return {
    routeCapabilities: (signal?: AbortSignal) =>
      request(
        '/api/market-data/routes/capabilities?contractVersion=3',
        marketRouteCatalogReadClientV3Schema,
        { signal: signal ?? null },
      ),
    savePolicy: (input: MarketPolicySaveInput) => {
      marketPolicySaveInputSchema.parse(input);
      return request(
        '/api/market-data/policy',
        marketPolicyClientResponseSchema.refine((row) => row.revision === input.revision),
        { method: 'PUT', body: JSON.stringify(input) },
      );
    },
    retryPolicy: () =>
      request('/api/market-data/policy/retry', marketPolicyClientResponseSchema, {
        method: 'POST',
      }),
  };
}
