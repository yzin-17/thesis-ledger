import { useQuery } from '@tanstack/react-query';
import {
  fetchCatalogJob,
  fetchCatalogStatus,
  fetchMarketPolicy,
  fetchMarketProviders,
  fetchMarketRouteCapabilitiesV3,
  searchMarketInstruments,
} from './market-data.api.js';
import { catalogJobPollingInterval } from './catalog-job-response.js';

export const marketDataKeys = {
  root: ['desktop', 'market-data'] as const,
  policy: () => [...marketDataKeys.root, 'policy'] as const,
  providers: () => [...marketDataKeys.root, 'providers'] as const,
  routeCapabilities: () => [...marketDataKeys.root, 'route-capabilities-v3'] as const,
  catalog: () => [...marketDataKeys.root, 'catalog'] as const,
  catalogJob: (jobId: string) => [...marketDataKeys.catalog(), 'job', jobId] as const,
  search: (query: string) => [...marketDataKeys.root, 'instruments', query] as const,
};

export const useMarketDataQueries = () => {
  const policy = useQuery({ queryKey: marketDataKeys.policy(), queryFn: fetchMarketPolicy });
  const providers = useQuery({
    queryKey: marketDataKeys.providers(),
    queryFn: fetchMarketProviders,
  });
  const routeCapabilities = useQuery({
    queryKey: marketDataKeys.routeCapabilities(),
    queryFn: fetchMarketRouteCapabilitiesV3,
    retry: false,
    staleTime: 0,
  });
  const catalog = useQuery({ queryKey: marketDataKeys.catalog(), queryFn: fetchCatalogStatus });
  return { policy, providers, routeCapabilities, catalog };
};

export const useCatalogJobQuery = (jobId: string | null) =>
  useQuery({
    queryKey: marketDataKeys.catalogJob(jobId ?? 'idle'),
    queryFn: () => {
      if (!jobId) throw new Error('catalog job id is required');
      return fetchCatalogJob(jobId);
    },
    enabled: Boolean(jobId),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) =>
      catalogJobPollingInterval(query.state.data, query.state.status === 'error'),
    refetchIntervalInBackground: true,
  });

export const useInstrumentSearchQuery = (query: string) =>
  useQuery({
    queryKey: marketDataKeys.search(query),
    queryFn: () => searchMarketInstruments(query),
    enabled: Boolean(query),
    staleTime: 30_000,
    retry: false,
  });
