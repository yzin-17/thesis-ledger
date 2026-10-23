import {
  performanceReadQuerySchema,
  performanceSummaryManagementSchema,
  performanceHistoryResponseSchema,
  performanceLayersResponseSchema,
  performanceTargetsResponseSchema,
  performanceAllocationInputSchema,
  performanceAllocationResponseSchema,
  performanceTargetsInputSchema,
  performanceSeriesQuerySchema,
  performanceSeriesResponseSchema,
  type PerformanceReadQuery,
  type PerformanceTargetsWireInput,
  type PerformanceSeriesWireInput,
  type PerformanceAllocationWireInput,
} from '@thesis-ledger/schemas';
import { ThesisLedgerContractError } from './api-error.js';
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type Request = <T>(path: string, schema: Schema<T>, init?: RequestInit) => Promise<T>;
export function performanceClient(request: Request) {
  const suffix = (params: object) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    );
    return query.size ? `?${query}` : '';
  };
  const read = <T>(
    path: string,
    schema: Schema<T>,
    params: PerformanceReadQuery,
    signal?: AbortSignal,
  ) =>
    request(`${path}${suffix(performanceReadQuerySchema.parse(params))}`, schema, {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
  return {
    getSummary: (params: PerformanceReadQuery = {}, signal?: AbortSignal) =>
      read('/performance/summary', performanceSummaryManagementSchema, params, signal),
    getHistory: (params: PerformanceReadQuery = {}, signal?: AbortSignal) =>
      read('/performance/history', performanceHistoryResponseSchema, params, signal),
    getLayers: (params: PerformanceReadQuery = {}, signal?: AbortSignal) =>
      read('/performance/layers', performanceLayersResponseSchema, params, signal),
    getSeries(input: PerformanceSeriesWireInput, signal?: AbortSignal) {
      const params = performanceSeriesQuerySchema.parse(input);
      return request(`/performance/series${suffix(params)}`, performanceSeriesResponseSchema, {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      }).then((result) => {
        if (
          result.range !== params.range ||
          result.interval !== params.interval ||
          result.currency !== params.baseCurrency
        )
          throw new ThesisLedgerContractError('/performance/series');
        return result;
      });
    },
    getTargets(params: PerformanceReadQuery = {}, signal?: AbortSignal) {
      const parsed = performanceReadQuerySchema.parse(params);
      const query = {
        accountId: parsed.accountId,
        mode: parsed.mode,
        fxMerge: parsed.fxMerge,
        baseCurrency: parsed.baseCurrency,
      };
      const scope = query.accountId ? 'account' : 'portfolio';
      return request(
        `/performance/targets${suffix({ scope, ...query })}`,
        performanceTargetsResponseSchema,
        { cache: 'no-store', ...(signal ? { signal } : {}) },
      ).then((result) => {
        if (result.scope !== scope || result.accountId !== (query.accountId ?? null))
          throw new ThesisLedgerContractError('/performance/targets');
        return result;
      });
    },
    allocate(input: PerformanceAllocationWireInput, signal?: AbortSignal) {
      return request('/performance/allocation', performanceAllocationResponseSchema, {
        method: 'POST',
        body: JSON.stringify(performanceAllocationInputSchema.parse(input)),
        ...(signal ? { signal } : {}),
      });
    },
    saveTargets(input: PerformanceTargetsWireInput) {
      const body = performanceTargetsInputSchema.parse(input);
      return request('/performance/targets', performanceTargetsResponseSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  };
}
