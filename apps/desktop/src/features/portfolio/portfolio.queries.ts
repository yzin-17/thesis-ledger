import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAccounts, fetchPortfolioValuation } from './portfolio.api.js';
import type { LoadState, PortfolioMode } from './portfolio.types.js';

export const portfolioKeys = {
  root: ['desktop', 'portfolio'] as const,
  valuation: (mode: PortfolioMode) => [...portfolioKeys.root, 'valuation', mode] as const,
  accounts: () => [...portfolioKeys.root, 'accounts'] as const,
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
    queryFn: fetchAccounts,
    staleTime: 30_000,
  });

  const portfolio = portfolioQuery.data ?? null;
  const accounts = accountsQuery.data ?? [];
  let state: LoadState = 'loading';
  if (portfolioQuery.isError || accountsQuery.isError) state = 'error';
  else if (portfolioQuery.isSuccess && accountsQuery.isSuccess && portfolio) {
    state = portfolio.positions.length === 0 ? 'empty' : portfolio.partial ? 'stale' : 'ready';
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
