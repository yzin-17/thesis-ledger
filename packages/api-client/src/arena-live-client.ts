import { arenaLiveDetailSchema, arenaLiveSummarySchema, arenaLiveProtocolSchema, arenaReceiptSchema, arenaLiveRetryReceiptSchema, arenaLiveManualTriggerReceiptSchema, type ArenaLiveProtocol } from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
import { arenaLivePointSchema, arenaPointQuerySchema, type ArenaPointQuery } from '@thesis-ledger/schemas';
import { arenaCatalogQuerySchema, arenaCatalogResultSchema, type ArenaCatalogQueryInput } from '@thesis-ledger/schemas';
export function arenaLiveClient(request: ParsedRequest) {
  const path = (id: string) => '/arena-matches/' + encodeURIComponent(id);
  return {
    list: (signal?: AbortSignal) => request('/arena-matches', arenaLiveSummarySchema.array(), { signal: signal ?? null, cache: 'no-store' }),
    catalog: (input: ArenaCatalogQueryInput, signal?: AbortSignal) => {
      const query = arenaCatalogQuerySchema.parse(input);
      const parameters = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
      return request('/arena-matches/catalog?' + parameters.toString(), arenaCatalogResultSchema,
        { signal: signal ?? null, cache: 'no-store' });
    },
    get: (id: string, signal?: AbortSignal) => request(path(id), arenaLiveDetailSchema, { signal: signal ?? null, cache: 'no-store' }),
    create: (input: ArenaLiveProtocol) => request('/arena-matches', arenaReceiptSchema, { method: 'POST', body: JSON.stringify(arenaLiveProtocolSchema.parse(input)) }),
    transition: (id: string, action: 'start' | 'pause' | 'end') => request(path(id) + '/' + action, arenaReceiptSchema, { method: 'POST' }),
    retryReplay: (id: string) => request(path(id) + '/replay/retry', arenaReceiptSchema, { method: 'POST' }),
    trigger: (id: string, agentId: string) => request(path(id) + '/agents/' + encodeURIComponent(agentId) + '/trigger',
      arenaLiveManualTriggerReceiptSchema, { method: 'POST' }),
    retry: (id: string, agentId: string) => request(path(id) + '/agents/' + encodeURIComponent(agentId) + '/retry',
      arenaLiveRetryReceiptSchema, { method: 'POST' }),
    points: (id: string, input: ArenaPointQuery, signal?: AbortSignal) => {
      const parsed = arenaPointQuerySchema.parse(input);
      const query = new URLSearchParams({ symbol: parsed.symbol, start: parsed.start, end: parsed.end });
      if (parsed.entrantId) query.set('entrantId', parsed.entrantId);
      return request(path(id) + '/points?' + query.toString(), arenaLivePointSchema.array(), { signal: signal ?? null, cache: 'no-store' });
    },
  };
}
