import { fundDailyErrorSchema, fundValuationSchema, fundValuationSymbolSchema, fundValuationTodaySchema } from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';

export function fundValuationClient(request: ParsedRequest) {
  return {
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
