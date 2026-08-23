import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAccounts,
  fetchManagedAccounts,
  fetchPortfolioValuation,
  searchPortfolioInstruments,
} from './portfolio.api.js';
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

export const usePortfolioShellQueries = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  const portfolioQuery = useQuery({
    queryKey: portfolioKeys.valuation(mode),
    queryFn: () => fetchPortfolioValuation(mode),
    staleTime: 15_000,
  });
  const accountsQuery = useQuery({
    queryKey: portfolioKeys.accounts(),
    queryFn: () => fetchAccounts(),
    staleTime: 30_000,
  });

  const portfolio = portfolioQuery.data ?? null;
  const accounts = accountsQuery.data ?? [];
  let state: LoadState = 'loading';
  if (portfolioQuery.isError || accountsQuery.isError) state = 'error';
  else if (portfolioQuery.isSuccess && accountsQuery.isSuccess && portfolio) {
    if (portfolio.positions.length === 0) state = 'empty';
    else if (portfolio.partial) state = 'stale';
    else state = 'ready';
  }

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: portfolioKeys.root }),
      portfolioQuery.refetch(),
      accountsQuery.refetch(),
    ]);
  };

  return {
    state,
    portfolio,
    accounts,
    accountsReady: !accountsQuery.isPending && !accountsQuery.isError,
    refresh,
  };
};

export const useAccountValuationQuery = (
  accountId: string,
  mode: PortfolioMode | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: portfolioKeys.valuation(mode ?? 'actual', accountId || 'all'),
    queryFn: () => fetchPortfolioValuation(mode ?? 'actual', accountId),
    enabled,
  });

export const useManagedAccountsQuery = (enabled: boolean) =>
  useQuery({
    queryKey: portfolioKeys.managedAccounts(),
    queryFn: () => fetchManagedAccounts(),
    enabled,
  });

export const usePortfolioInstrumentSearchQuery = (
  accountType: string | undefined,
  query: string,
  enabled: boolean,
) =>
  useQuery({
    queryKey: portfolioKeys.instrumentSearch(accountType ?? 'all', query),
    queryFn: ({ signal }) => searchPortfolioInstruments(query, undefined, signal),
    enabled,
    placeholderData: [],
    retry: false,
    staleTime: 30_000,
  });
