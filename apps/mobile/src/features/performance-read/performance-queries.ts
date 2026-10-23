import { useQuery } from '@tanstack/react-query';
import type {
  PerformanceReadQuery,
  PerformanceSeriesInterval,
  PerformanceSeriesRange,
} from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { performanceAllocationInput } from './performance-projection';
export type PerformanceFilters = {
  accountId: string;
  start: string;
  end: string;
  fxMerge: boolean;
  baseCurrency: 'CNY' | 'HKD' | 'USD';
  range: PerformanceSeriesRange;
  interval: PerformanceSeriesInterval;
};
export function usePerformanceQueries(filters: PerformanceFilters, enabled: boolean) {
  const { api, scope, mode } = useMobileRuntime();
  const params: PerformanceReadQuery = {
    mode,
    fxMerge: filters.fxMerge,
    baseCurrency: filters.baseCurrency,
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.start ? { start: filters.start } : {}),
    ...(filters.end ? { end: filters.end } : {}),
  };
  const key = [...scope, 'performance', params];
  const summary = useQuery({
    queryKey: [...key, 'summary'],
    enabled,
    queryFn: ({ signal }) => api.performance.getSummary(params, signal),
  });
  const history = useQuery({
    queryKey: [...key, 'history'],
    enabled,
    queryFn: ({ signal }) => api.performance.getHistory(params, signal),
  });
  const layers = useQuery({
    queryKey: [...key, 'layers'],
    enabled,
    queryFn: ({ signal }) => api.performance.getLayers(params, signal),
  });
  const targets = useQuery({
    queryKey: [...key, 'targets'],
    enabled,
    queryFn: ({ signal }) => api.performance.getTargets(params, signal),
  });
  const series = useQuery({
    queryKey: [...key, 'series', filters.range, filters.interval],
    enabled,
    queryFn: ({ signal }) =>
      api.performance.getSeries(
        {
          mode,
          scope: filters.accountId ? 'account' : 'portfolio',
          ...(filters.accountId ? { accountId: filters.accountId } : {}),
          baseCurrency: filters.baseCurrency,
          range: filters.range,
          interval: filters.interval,
        },
        signal,
      ),
  });
  const allocationInput =
    layers.data && targets.data
      ? performanceAllocationInput(layers.data, targets.data, filters.accountId || undefined)
      : null;
  const allocation = useQuery({
    queryKey: [...key, 'allocation', allocationInput],
    enabled: enabled && Boolean(allocationInput) && !layers.isError && !targets.isError,
    queryFn: ({ signal }) => api.performance.allocate(allocationInput!, signal),
  });
  return {
    summary,
    history,
    layers,
    targets,
    series,
    allocation,
    allocationUnavailable: Boolean(layers.data && targets.isSuccess && !allocationInput),
  };
}
