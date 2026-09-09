import { useQuery } from '@tanstack/react-query';
import {
  fetchCatalogJob,
  fetchCatalogStatus,
  fetchMarketPolicy,
  fetchMarketProviders,
  searchMarketInstruments,
} from './market-data.api.js';
import type { CatalogStatus } from './market-data.types.js';

export const marketDataKeys = {
  root: ['desktop', 'market-data'] as const,
  policy: () => [...marketDataKeys.root, 'policy'] as const,
  providers: () => [...marketDataKeys.root, 'providers'] as const,
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
  const catalog = useQuery({ queryKey: marketDataKeys.catalog(), queryFn: fetchCatalogStatus });
  return { policy, providers, catalog };
};

const terminalCatalogState = (status: CatalogStatus | undefined) =>
  Boolean(status?.acknowledged) || status?.status === 'failed' || status?.status === 'timeout';

export const useCatalogJobQuery = (jobId: string | null) =>
  useQuery({
    queryKey: marketDataKeys.catalogJob(jobId ?? 'idle'),
    queryFn: () => {
      if (!jobId) throw new Error('catalog job id is required');
      return fetchCatalogJob(jobId);
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => (terminalCatalogState(query.state.data) ? false : 1_500),
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
