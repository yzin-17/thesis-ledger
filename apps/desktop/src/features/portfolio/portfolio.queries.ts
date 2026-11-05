import { portfolioValuationNotice } from '@thesis-ledger/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import {
  fetchAccounts,
  fetchManagedAccounts,
  fetchPortfolioValuation,
  searchPortfolioInstruments,
} from './portfolio.api.js';
import type { DesktopRequestClient } from '../shared/request.js';
import type { LoadState, PortfolioMode } from './portfolio.types.js';
import { portfolioTradeKeys } from './portfolio-trade.queries.js';

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
  pathname === '/performance' || pathname === '/risk-center';

export const portfolioValuationQueryOptions = (
  mode: PortfolioMode,
  enabled: boolean,
  client?: DesktopRequestClient,
  accountId = '',
) => ({
  queryKey: portfolioKeys.valuation(mode, accountId || 'all'),
  queryFn: () => fetchPortfolioValuation(mode, accountId || undefined, client),
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
  options: { enableValuation?: boolean; accountId?: string } = {},
) => {
  const enableValuation = options.enableValuation ?? false;
  const queryClient = useQueryClient();
  const [refreshPending, setRefreshPending] = useState(false);
  const accountsQuery = useQuery({
    queryKey: portfolioKeys.accounts(),
    queryFn: () => fetchAccounts(),
    staleTime: 30_000,
  });

  const accounts = accountsQuery.data ?? [];
  const requestedAccountId = options.accountId ?? '';
  const accountId =
    accounts.find(
      (account) =>
        account.id === requestedAccountId && account.mode === mode && account.active !== false,
    )?.id ?? '';
  const scopeReady = !requestedAccountId || accountsQuery.isSuccess;
  const portfolioQuery = useQuery(
    portfolioValuationQueryOptions(mode, enableValuation && scopeReady, undefined, accountId),
  );
  const portfolio = portfolioQuery.data ?? null;
  let state: LoadState = enableValuation ? 'loading' : 'ready';
  if (accountsQuery.isError || (enableValuation && portfolioQuery.isError)) state = 'error';
  else if (enableValuation && portfolioQuery.isSuccess && accountsQuery.isSuccess && portfolio) {
    if (
      portfolio.positions.length === 0 &&
      !accounts.some((account) => account.mode === mode && account.active !== false)
    )
      state = 'empty';
    else if (portfolioValuationNotice(portfolio)) state = 'stale';
    else state = 'ready';
  }

  const refresh = async () => {
    setRefreshPending(true);
    try {
      const refreshes: Array<Promise<unknown>> = [
        accountsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: portfolioKeys.managedAccounts() }),
        queryClient.invalidateQueries({ queryKey: portfolioTradeKeys.root }),
      ];
      if (enableValuation && scopeReady) {
        await queryClient.invalidateQueries({
          queryKey: portfolioKeys.valuation(mode, accountId || 'all'),
          exact: true,
          refetchType: 'none',
        });
        refreshes.push(portfolioQuery.refetch());
      }
      await Promise.all(refreshes);
    } finally {
      setRefreshPending(false);
    }
  };

  return {
    state,
    portfolio,
    accounts,
    accountId,
    accountsReady: !accountsQuery.isPending && !accountsQuery.isError,
    accountsAvailable: accountsQuery.data !== undefined,
    accountsPending: accountsQuery.isPending,
    accountsError: accountsQuery.isError,
    refreshing:
      refreshPending || (enableValuation && portfolioQuery.isFetching) || accountsQuery.isFetching,
    refresh,
  };
};

export const usePortfolioValuationQuery = (mode: PortfolioMode, enabled: boolean) =>
  useQuery(portfolioValuationQueryOptions(mode, enabled));

export const useAccountValuationQuery = (
  accountId: string,
  mode: PortfolioMode | undefined,
  enabled: boolean,
) => useQuery(accountValuationQueryOptions(accountId, mode, enabled));

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
  client?: Pick<ThesisLedgerApiClient, 'market'>,
) => ({
  queryKey: portfolioKeys.instrumentSearch(accountType ?? 'all', query),
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    searchPortfolioInstruments(query, client, signal),
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
