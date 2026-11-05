import { fundValuationSchema, fundValuationSymbolSchema, fundValuationTodaySchema } from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';

export function fundValuationClient(request: ParsedRequest) {
  return {
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
