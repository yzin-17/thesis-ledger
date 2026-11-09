import { fundDailyErrorSchema, fundValuationSchema, fundValuationSymbolSchema, fundValuationTodaySchema } from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
import { fundNavHistorySchema } from '@thesis-ledger/schemas';

export function fundValuationClient(request: ParsedRequest) {
  return {
    getFundNavHistory: (symbol: string, range: { start: string; end: string; limit?: number }, signal?: AbortSignal) => {
      fundValuationSymbolSchema.parse(symbol);
      const query = new URLSearchParams({ start: range.start, end: range.end, limit: String(range.limit ?? 3650) });
      return request(`/api/market/${encodeURIComponent(symbol)}/fund-nav/history?${query}`,
        fundNavHistorySchema.refine((points) => points.every((point) => point.symbol === symbol)),
        { ...(signal ? { signal } : {}) });
    },
    getFundDailyError: (symbol: string, signal?: AbortSignal) => {
      fundValuationSymbolSchema.parse(symbol);
      return request(`/api/market/${encodeURIComponent(symbol)}/fund-valuation/daily-error`,
        fundDailyErrorSchema.refine(r=>r===null || r.symbol===symbol), {cache:'no-store', signal:signal??null});
    },
    getFundValuationToday: (symbol: string, signal?: AbortSignal) => {
      fundValuationSymbolSchema.parse(symbol);
      return request(`/api/market/${encodeURIComponent(symbol)}/fund-valuation/today`,
        fundValuationTodaySchema.refine((result) => result.symbol === symbol),
        { cache: 'no-store', ...(signal ? { signal } : {}) });
    },
    getFundValuation: (symbol: string, signal?: AbortSignal) => {
      fundValuationSymbolSchema.parse(symbol);
      return request(`/api/market/${encodeURIComponent(symbol)}/fund-valuation`,
        fundValuationSchema.refine((result) => result.symbol === symbol),
        { cache: 'no-store', ...(signal ? { signal } : {}) });
    },
  };
}
