import {
  marketChartOptionsV3Schema, marketChartOptionsWindowV3Schema, marketChartPlanV3Schema,
  type MarketChartPlanV3, type MarketChartOptionsWindowV3,
} from '@thesis-ledger/schemas';
import { ThesisLedgerContractError } from './api-error.js';

type ParsedSchema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type RequestParsed = <T>(path: string, schema: ParsedSchema<T>, init?: RequestInit) => Promise<T>;
type QuerySuffix = (params: Record<string, string | number | undefined>) => string;

export function marketChartOptionsClient(requestParsed: RequestParsed, queryString: QuerySuffix) {
  return {
    getPlannedChartOptions: async (symbol: string, input: MarketChartPlanV3, signal?: AbortSignal) => {
      const plan = marketChartPlanV3Schema.parse(input);
      const path = `/api/market/${encodeURIComponent(symbol)}/chart-options${queryString({
        barsLimit: plan.barsLimit, indicatorParams: JSON.stringify(plan.indicatorParams),
        planEnd: plan.end, timeframe: plan.timeframe, assetType: plan.assetType,
      })}`;
      const response = await requestParsed(path, marketChartOptionsV3Schema, signal ? { signal } : undefined);
      const actual = response.plan;
      if (response.symbol !== symbol || !response.window || !actual ||
          (response.timeframe ?? '1d') !== (plan.timeframe ?? '1d') ||
          (actual.timeframe ?? '1d') !== (plan.timeframe ?? '1d') ||
          actual.assetType !== plan.assetType ||
          actual.barsLimit !== plan.barsLimit || actual.end !== plan.end ||
          Object.keys(actual.indicatorParams).length !== Object.keys(plan.indicatorParams).length ||
          Object.entries(plan.indicatorParams).some(([key, value]) => actual.indicatorParams[key] !== value)) {
        throw new ThesisLedgerContractError(path);
      }
      return response;
    },
    getChartOptions: async (symbol: string, signal?: AbortSignal,
      requestedWindow?: MarketChartOptionsWindowV3, timeframe: '1m' | '1d' = '1d') => {
      const window = requestedWindow ? marketChartOptionsWindowV3Schema.parse(requestedWindow) : undefined;
      const path = `/api/market/${encodeURIComponent(symbol)}/chart-options${queryString({
        ...window, ...(timeframe === '1m' ? { timeframe } : {}),
      })}`;
      const response = await requestParsed(path, marketChartOptionsV3Schema, signal ? { signal } : undefined);
      if (response.symbol !== symbol || (response.timeframe ?? '1d') !== timeframe ||
          response.window?.start !== window?.start || response.window?.end !== window?.end)
        throw new ThesisLedgerContractError(path);
      return response;
    },
  };
}
