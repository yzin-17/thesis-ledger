import {
  watchlistPricesSchema,
  watchlistPricesInputSchema,
  watchlistPageQuerySchema,
  watchlistPageSchema,
  watchlistAddSchema,
  watchlistChangeSchema,
  watchlistMutationSchema,
  type WatchlistChange,
  type WatchlistQuery,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';

export function watchlistClient(request: ParsedRequest) {
  return {
    list(input: WatchlistQuery = {}, signal?: AbortSignal) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(watchlistPageQuerySchema.parse(input)))
        params.set(key, String(value));
      return request('/watchlist?' + params.toString(), watchlistPageSchema, {
        signal: signal ?? null,
      });
    },
    prices(itemIds: string[], mode: 'actual' | 'shadow', signal?: AbortSignal) {
      return request('/watchlist/prices', watchlistPricesSchema, {
        method: 'POST',
        signal: signal ?? null,
        body: JSON.stringify(watchlistPricesInputSchema.parse({ itemIds, mode })),
      });
    },
    add(instrumentId: string, groupId?: string) {
      return request('/watchlist/items', watchlistMutationSchema, {
        method: 'POST',
        body: JSON.stringify(watchlistAddSchema.parse({ instrumentId, groupId })),
      });
    },
    change(command: WatchlistChange) {
      return request('/watchlist/changes', watchlistMutationSchema, {
        method: 'POST',
        body: JSON.stringify(watchlistChangeSchema.parse(command)),
      });
    },
  };
}
