import type { Account } from '../portfolio/portfolio.types.js';

export const resolveAccountSelection = ({
  accounts,
  accountId,
  requestedAccountId,
}: {
  accounts: Account[];
  accountId: string;
  requestedAccountId: string;
}) => {
  if (requestedAccountId === 'all') return 'all';
  if (requestedAccountId && accounts.some((account) => account.id === requestedAccountId))
    return requestedAccountId;
  if (accountId === 'all') return 'all';
  if (accountId && accounts.some((account) => account.id === accountId)) return accountId;
  return accounts[0]?.id ?? '';
};

export const accountSelectionTransition = (
  nextAccountId: string,
  extraLocationUpdates: Record<string, string | null> = {},
) => ({
  locationUpdates: {
    ...extraLocationUpdates,
    accountId: nextAccountId,
    entry: null,
  },
});

export const shouldDeferAccountSelection = ({
  accountsReady,
  accountsPending,
  accountsError,
}: {
  accountsReady: boolean;
  accountsPending: boolean;
  accountsError: boolean;
}) => !accountsReady || accountsPending || accountsError;
