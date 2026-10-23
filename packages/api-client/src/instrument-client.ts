import { instrumentSearchResponseSchema } from '@thesis-ledger/schemas';
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type Request = <T>(path: string, schema: Schema<T>, init?: RequestInit) => Promise<T>;
type ResponseRequest = (path: string, init?: RequestInit) => Promise<Response>;

export function instrumentClient(request: Request, response: ResponseRequest) {
  return {
    searchInstruments(params: { q: string; limit?: number }, signal?: AbortSignal) {
      const query = new URLSearchParams({ q: params.q });
      if (params.limit !== undefined) query.set('limit', String(params.limit));
      return request(
        `/api/market-data/instruments/search?${query}`,
        instrumentSearchResponseSchema,
        signal ? { signal } : undefined,
      );
    },
    async confirmInstrument(id: string) {
      await response(`/api/market-data/instruments/${encodeURIComponent(id)}/confirm`, {
        method: 'POST',
      });
    },
  };
}
