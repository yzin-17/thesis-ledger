import {
  routingConfigViewSchema,
  routingConfigPreviewSchema,
  marketPolicyClientResponseSchema,
  type RoutingConfigInput,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';

export function marketRoutingClient(request: ParsedRequest) {
  return {
    routingConfig: (signal?: AbortSignal) =>
      request('/api/market-data/routing-config', routingConfigViewSchema, {
        signal: signal ?? null,
      }),
    previewRoutingConfig: (input: RoutingConfigInput) =>
      request('/api/market-data/routing-config/preview', routingConfigPreviewSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    saveRoutingConfig: (input: RoutingConfigInput) =>
      request('/api/market-data/routing-config', marketPolicyClientResponseSchema, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
  };
}
