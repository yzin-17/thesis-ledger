import type { MarketDisplayDetailResponse } from '@thesis-ledger/api-client';
import type { MarketTimeframe } from '@thesis-ledger/schemas';

export function matchesDetailChartScope(response: MarketDisplayDetailResponse, symbol: string, timeframe: MarketTimeframe, adjustment?: string) {
  if (response.symbol !== symbol) return false;
  const identity = response.barSeries?.identity;
  if (!identity) return true;
  return identity.timeframe === timeframe && (adjustment === undefined || identity.adjustment === adjustment);
}

export function hasDifferentDetailChartScope(response: MarketDisplayDetailResponse | null, symbol: string, timeframe: MarketTimeframe, adjustment?: string) {
  return Boolean(response?.barSeries && !matchesDetailChartScope(response, symbol, timeframe, adjustment));
}
