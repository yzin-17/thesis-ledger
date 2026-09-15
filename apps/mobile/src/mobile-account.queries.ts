import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AccountMode, AccountResponse, ThesisLedgerApiClient } from '@thesis-ledger/api-client';

import type { MobileReadOnlyStore } from './index';

export type MobileAccountsClient = Pick<ThesisLedgerApiClient['accounts'], 'list' | 'permanentDelete'>;

export const mobileAccountKeys = {
  root: ['mobile', 'accounts'] as const,
  list: (mode: AccountMode) => [...mobileAccountKeys.root, mode] as const,
};

export const fetchMobileAccounts = (mode: AccountMode, client: MobileAccountsClient) =>
  client.list({ includeInactive: true, mode });

export const refreshMobileAccountData = async (
  queryClient: Pick<QueryClient, 'invalidateQueries' | 'refetchQueries'>,
  store: Pick<MobileReadOnlyStore, 'refresh'>,
) => {
  await queryClient.invalidateQueries({ queryKey: mobileAccountKeys.root });
  await queryClient.refetchQueries({ queryKey: mobileAccountKeys.root });
  await store.refresh();
};

export const refreshMobileAccountDataBestEffort = (
  queryClient: Pick<QueryClient, 'invalidateQueries' | 'refetchQueries'>,
  store: Pick<MobileReadOnlyStore, 'refresh'>,
) =>
  Promise.resolve()
    .then(() => queryClient.invalidateQueries({ queryKey: mobileAccountKeys.root }))
    .catch(() => undefined)
    .then(() => queryClient.refetchQueries({ queryKey: mobileAccountKeys.root }))
    .catch(() => undefined)
    .then(() => store.refresh())
    .catch(() => undefined);

export const useMobileAccountsQuery = (mode: AccountMode, client: MobileAccountsClient) =>
  useQuery({
    queryKey: mobileAccountKeys.list(mode),
    queryFn: () => fetchMobileAccounts(mode, client),
  });

export const useMobilePermanentDeleteAccountMutation = (
  client: MobileAccountsClient,
  store: Pick<MobileReadOnlyStore, 'refresh'>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => client.permanentDelete(accountId),
    onSuccess: () => refreshMobileAccountDataBestEffort(queryClient, store),
  });
};

export const resolveMobileAccountSelection = (
  accounts: AccountResponse[],
  selectedAccountId: string | null,
) => {
  if (selectedAccountId && accounts.some((account) => account.id === selectedAccountId))
    return selectedAccountId;
  return accounts[0]?.id ?? null;
};
