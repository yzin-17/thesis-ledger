import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { readLastAccount } from './account-data.helpers.js';
import {
  accountSelectionTransition,
  resolveAccountSelection,
  shouldDeferAccountSelection,
} from './account-data.selection.js';
import type { Account } from '../portfolio/portfolio.types.js';
import type { AccountDataTab } from './account-data.types.js';

type AccountDataNavigationOptions = {
  accounts: Account[];
  accountsReady: boolean;
  accountsPending: boolean;
  accountsError: boolean;
  confirmDiscard: () => Promise<boolean>;
  clearDraft: () => void;
  resetAccountContext: () => void;
  resetEmptyState: () => void;
  resetTabContext: () => void;
};

export function useAccountDataNavigation({
  accounts,
  accountsReady,
  accountsPending,
  accountsError,
  confirmDiscard,
  clearDraft,
  resetAccountContext,
  resetEmptyState,
  resetTabContext,
}: AccountDataNavigationOptions) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const requestedAccountId = params.get('accountId') ?? '';
  const entryRequested = params.get('entry');
  const requestedTab = params.get('tab');
  const initialTab: AccountDataTab =
    requestedTab === 'positions' || requestedTab === 'cash' || requestedTab === 'transactions'
      ? requestedTab
      : 'transactions';
  const [accountId, setAccountId] = useState(
    () => requestedAccountId || readLastAccount() || accounts[0]?.id || '',
  );
  const [tab, setTab] = useState<AccountDataTab>(initialTab);
  const [accountManagerOpen, setAccountManagerOpen] = useState(params.get('setup') === '1');
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const allAccountsSelected = accountId === 'all';
  const isCashAccount = selectedAccount?.type === 'cash';

  const updateLocation = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(location.search);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      void navigate({ pathname: '/accounts', ...(search ? { search: `?${search}` } : {}) });
    },
    [location.search, navigate],
  );

  useEffect(() => {
    // An empty query result is ambiguous while the account directory is still
    // loading (or failed). Preserve deep links and the last selection until a
    // successful, settled response proves that the directory is truly empty.
    if (shouldDeferAccountSelection({ accountsReady, accountsPending, accountsError })) return;
    const nextAccountId = resolveAccountSelection({ accounts, accountId, requestedAccountId });
    if (nextAccountId === accountId && requestedAccountId === accountId && accounts.length > 0)
      return;
    if (accounts.length === 0) {
      setAccountId('');
      clearDraft();
      resetEmptyState();
      setAccountManagerOpen(false);
      try {
        window.sessionStorage.removeItem('thesis-ledger-last-account');
      } catch {
        /* sessionStorage is optional */
      }
      updateLocation({ accountId: null, entry: null, tab: null, setup: null });
      return;
    }
    setAccountId(nextAccountId);
    try {
      window.sessionStorage.setItem('thesis-ledger-last-account', nextAccountId);
    } catch {
      /* sessionStorage is optional */
    }
    if (requestedAccountId !== nextAccountId) {
      updateLocation({ accountId: nextAccountId, entry: null });
    }
  }, [
    accountId,
    accounts,
    accountsError,
    accountsPending,
    accountsReady,
    clearDraft,
    requestedAccountId,
    resetEmptyState,
    updateLocation,
  ]);

  const transitionToAccount = useCallback(
    async (
      nextAccountId: string,
      extraLocationUpdates: Record<string, string | null> = {},
      closeAccountManager = false,
    ) => {
      if (!nextAccountId) return true;
      const sameAccount = nextAccountId === accountId && requestedAccountId === nextAccountId;
      if (sameAccount && !closeAccountManager)
        return true;
      if (!(await confirmDiscard())) return false;
      clearDraft();
      if (!sameAccount) resetAccountContext();
      if (closeAccountManager) setAccountManagerOpen(false);
      const transition = accountSelectionTransition(nextAccountId, extraLocationUpdates);
      updateLocation(transition.locationUpdates);
      return true;
    },
    [
      accountId,
      clearDraft,
      confirmDiscard,
      requestedAccountId,
      resetAccountContext,
      updateLocation,
    ],
  );

  const selectAccount = useCallback(
    (
      nextAccountId: string,
      extraLocationUpdates: Record<string, string | null> = {},
    ) => transitionToAccount(nextAccountId, extraLocationUpdates),
    [transitionToAccount],
  );

  const selectManagedAccount = useCallback(
    (nextAccountId: string) =>
      transitionToAccount(nextAccountId, { setup: null }, true),
    [transitionToAccount],
  );

  const selectTab = useCallback(
    async (nextTab: AccountDataTab) => {
      if (isCashAccount && nextTab !== 'cash') return;
      if (nextTab === tab) return;
      if (!(await confirmDiscard())) return;
      clearDraft();
      resetTabContext();
      setTab(nextTab);
      updateLocation({ tab: nextTab, entry: null });
    },
    [
      clearDraft,
      confirmDiscard,
      isCashAccount,
      resetTabContext,
      tab,
      updateLocation,
    ],
  );

  const handleAccountManagerOpenChange = useCallback(
    async (open: boolean) => {
      if (open) {
        setAccountManagerOpen(true);
        return;
      }
      if (!(await confirmDiscard())) return;
      clearDraft();
      setAccountManagerOpen(false);
      updateLocation({ setup: null });
    },
    [clearDraft, confirmDiscard, updateLocation],
  );

  const openAccountManager = useCallback(() => {
    setAccountManagerOpen(true);
  }, []);

  const navigateToTab = useCallback(
    (nextTab: AccountDataTab, entry: string | null = null) => {
      setTab(nextTab);
      updateLocation({ tab: nextTab, entry });
    },
    [updateLocation],
  );

  return {
    accountId,
    accountManagerOpen,
    allAccountsSelected,
    entryRequested,
    handleAccountManagerOpenChange,
    isCashAccount,
    navigateToTab,
    openAccountManager,
    requestedAccountId,
    selectAccount,
    selectManagedAccount,
    selectTab,
    selectedAccount,
    tab,
    updateLocation,
  };
}
