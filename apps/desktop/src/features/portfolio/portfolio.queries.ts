import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAccounts,
  fetchManagedAccounts,
  fetchPortfolioValuation,
  searchPortfolioInstruments,
} from './portfolio.api.js';
import type { DesktopRequestClient } from '../shared/request.js';
import type { LoadState, PortfolioMode } from './portfolio.types.js';

export const portfolioKeys = {
  root: ['desktop', 'portfolio'] as const,
  valuation: (mode: PortfolioMode, accountId = 'all') =>
    [...portfolioKeys.root, 'valuation', mode, accountId] as const,
  accounts: () => [...portfolioKeys.root, 'accounts'] as const,
  managedAccounts: () => [...portfolioKeys.root, 'accounts', 'managed'] as const,
  instrumentSearch: (accountType: string, query: string) =>
    [...portfolioKeys.root, 'instrument-search', accountType, query] as const,
};

export const isPortfolioSummaryConsumerRoute = (pathname: string) =>
  pathname === '/portfolio' || pathname === '/risk-center';

export const portfolioValuationQueryOptions = (
  mode: PortfolioMode,
  enabled: boolean,
  client?: DesktopRequestClient,
) => ({
  queryKey: portfolioKeys.valuation(mode),
  queryFn: () => fetchPortfolioValuation(mode, undefined, client),
  enabled,
  staleTime: 15_000,
});

export const accountValuationQueryOptions = (
  accountId: string,
  mode: PortfolioMode | undefined,
  enabled: boolean,
  client?: DesktopRequestClient,
) => ({
  queryKey: portfolioKeys.valuation(mode ?? 'actual', accountId || 'all'),
  queryFn: () => fetchPortfolioValuation(mode ?? 'actual', accountId, client),
  enabled,
});

export const usePortfolioShellQueries = (
  mode: PortfolioMode,
  options: { enableValuation?: boolean } = {},
) => {
  const enableValuation = options.enableValuation ?? false;
  const queryClient = useQueryClient();
  const portfolioQuery = useQuery(portfolioValuationQueryOptions(mode, enableValuation));
  const accountsQuery = useQuery({
    queryKey: portfolioKeys.accounts(),
    queryFn: () => fetchAccounts(),
    staleTime: 30_000,
  });

  const portfolio = portfolioQuery.data ?? null;
  const accounts = accountsQuery.data ?? [];
  let state: LoadState = enableValuation ? 'loading' : 'ready';
  if (accountsQuery.isError || (enableValuation && portfolioQuery.isError)) state = 'error';
  else if (enableValuation && portfolioQuery.isSuccess && accountsQuery.isSuccess && portfolio) {
    if (portfolio.positions.length === 0) state = 'empty';
    else if (portfolio.partial) state = 'stale';
    else state = 'ready';
  }

  const refresh = async () => {
    const refreshes: Array<Promise<unknown>> = [accountsQuery.refetch()];
    if (enableValuation) {
      await queryClient.invalidateQueries({
        queryKey: portfolioKeys.valuation(mode),
        exact: true,
        refetchType: 'none',
      });
      refreshes.push(portfolioQuery.refetch());
    }
    await Promise.all(refreshes);
  };

  return {
    state,
    portfolio,
    accounts,
    accountsReady: !accountsQuery.isPending && !accountsQuery.isError,
    accountsPending: accountsQuery.isPending,
    accountsError: accountsQuery.isError,
    refreshing: (enableValuation && portfolioQuery.isFetching) || accountsQuery.isFetching,
    refresh,
  };
};

export const usePortfolioValuationQuery = (mode: PortfolioMode, enabled: boolean) =>
  useQuery(portfolioValuationQueryOptions(mode, enabled));

export const useAccountValuationQuery = (
  accountId: string,
  mode: PortfolioMode | undefined,
  enabled: boolean,
) =>
  useQuery(accountValuationQueryOptions(accountId, mode, enabled));

export const useManagedAccountsQuery = (enabled: boolean) =>
  useQuery({
    queryKey: portfolioKeys.managedAccounts(),
    queryFn: () => fetchManagedAccounts(),
    enabled,
  });

export const portfolioInstrumentSearchQueryOptions = (
  accountType: string | undefined,
  query: string,
  enabled: boolean,
  client?: DesktopRequestClient,
) => ({
    queryKey: portfolioKeys.instrumentSearch(accountType ?? 'all', query),
    queryFn: ({ signal }: { signal: AbortSignal }) => searchPortfolioInstruments(query, client, signal),
    enabled,
    placeholderData: [],
    retry: false,
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

export const usePortfolioInstrumentSearchQuery = (
  accountType: string | undefined,
  query: string,
  enabled: boolean,
) => useQuery(portfolioInstrumentSearchQueryOptions(accountType, query, enabled));
