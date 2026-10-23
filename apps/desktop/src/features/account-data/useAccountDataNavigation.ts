import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import {
  accountSelectionTransition,
  resolveAccountSelection,
  shouldDeferAccountSelection,
} from './account-data.selection.js';
import type { Account } from '../portfolio/portfolio.types.js';
import type { AccountDataTab } from './account-data.types.js';
import { useGuardedTransition } from '../shared/navigation-guard.js';

type AccountDataNavigationOptions = {
  accounts: Account[];
  mode: Account['mode'];
  accountsReady: boolean;
  accountsPending: boolean;
  accountsError: boolean;
  confirmDiscard: () => Promise<boolean>;
  clearDraft: () => void;
  resetAccountContext: () => void;
  resetEmptyState: () => void;
  resetTabContext: () => void;
};

const lastAccountStorageKey = (mode: Account['mode']) => `thesis-ledger-last-account:${mode}`;

const readModeLastAccount = (mode: Account['mode']) => {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(lastAccountStorageKey(mode)) ?? '';
  } catch {
    return '';
  }
};

const writeModeLastAccount = (mode: Account['mode'], accountId: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(lastAccountStorageKey(mode), accountId);
  } catch {
    /* sessionStorage is optional */
  }
};

const clearModeLastAccount = (mode: Account['mode']) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(lastAccountStorageKey(mode));
  } catch {
    /* sessionStorage is optional */
  }
};

const selectionExistsInScope = (accountId: string, accounts: Account[]) =>
  accountId === 'all' || accounts.some((account) => account.id === accountId);

export function useAccountDataNavigation({
  accounts,
  mode,
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
  const guard = useGuardedTransition();
  const request = guard?.request;
  const transition = useCallback(async (commit: () => void) => {
    if (request) return request(commit, { title: '放弃未保存的修改？', description: '切换账户或页签后，本次修改将丢失。', confirmLabel: '放弃修改' });
    if (!(await confirmDiscard())) return false;
    commit();
    return true;
  }, [request, confirmDiscard]);
  const params = new URLSearchParams(location.search);
  const requestedAccountId = params.get('accountId') ?? '';
  const entryRequested = params.get('entry');
  const requestedTab = params.get('tab');
  const initialTab: AccountDataTab =
    requestedTab === 'positions' || requestedTab === 'cash' || requestedTab === 'transactions'
      ? requestedTab
      : 'transactions';
  const [accountId, setAccountId] = useState(() => {
    const requestedSelection = selectionExistsInScope(requestedAccountId, accounts)
      ? requestedAccountId
      : readModeLastAccount(mode);
    return resolveAccountSelection({
      accounts,
      accountId: '',
      requestedAccountId: requestedSelection,
    });
  });
  const [tab, setTab] = useState<AccountDataTab>(initialTab);
  const [accountManagerOpen, setAccountManagerOpen] = useState(params.get('setup') === '1');
  const requestedSelection = selectionExistsInScope(requestedAccountId, accounts)
    ? requestedAccountId
    : '';
  const stateSelection = selectionExistsInScope(accountId, accounts) ? accountId : '';
  const rememberedSelection = readModeLastAccount(mode);
  const preferredSelection = requestedSelection || stateSelection || rememberedSelection;
  const effectiveAccountId = resolveAccountSelection({
    accounts,
    accountId: '',
    requestedAccountId: preferredSelection,
  });
  const selectedAccount = accounts.find((account) => account.id === effectiveAccountId);
  const allAccountsSelected = effectiveAccountId === 'all';
  const isCashAccount = selectedAccount?.type === 'cash';

  const updateLocation = useCallback(
    (updates: Record<string, string | null>, replace = false) => {
      const next = new URLSearchParams(location.search);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      void navigate({ pathname: '/accounts', search: search ? `?${search}` : '' }, { replace });
    },
    [location.search, navigate],
  );

  useEffect(() => {
    // An empty query result is ambiguous while the account directory is still
    // loading (or failed). Preserve deep links and the last selection until a
    // successful, settled response proves that the directory is truly empty.
    if (shouldDeferAccountSelection({ accountsReady, accountsPending, accountsError })) return;
    const nextAccountId = effectiveAccountId;
    if (accounts.length === 0) {
      setAccountId('');
      clearDraft();
      resetEmptyState();
      setAccountManagerOpen(false);
      clearModeLastAccount(mode);
      if (requestedAccountId || requestedTab || entryRequested || params.has('setup'))
        updateLocation({ accountId: null, entry: null, tab: null, setup: null }, true);
      return;
    }
    writeModeLastAccount(mode, nextAccountId);
    if (nextAccountId === accountId && requestedAccountId === nextAccountId) return;
    setAccountId(nextAccountId);
    if (requestedAccountId !== nextAccountId) {
      updateLocation({ accountId: nextAccountId, entry: null }, true);
    }
  }, [
    accountId,
    accounts,
    accountsError,
    accountsPending,
    accountsReady,
    clearDraft,
    effectiveAccountId,
    mode,
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
      const sameAccount =
        nextAccountId === effectiveAccountId && requestedAccountId === nextAccountId;
      if (sameAccount && !closeAccountManager) return true;
      return transition(() => {
        clearDraft();
        if (!sameAccount) resetAccountContext();
        if (closeAccountManager) setAccountManagerOpen(false);
        const selection = accountSelectionTransition(nextAccountId, extraLocationUpdates);
        updateLocation(selection.locationUpdates);
      });
    },
    [
      accountId,
      clearDraft,
      transition,
      effectiveAccountId,
      requestedAccountId,
      resetAccountContext,
      updateLocation,
    ],
  );

  const selectAccount = useCallback(
    (nextAccountId: string, extraLocationUpdates: Record<string, string | null> = {}) =>
      transitionToAccount(nextAccountId, extraLocationUpdates),
    [transitionToAccount],
  );

  const selectManagedAccount = useCallback(
    (nextAccountId: string) => transitionToAccount(nextAccountId, { setup: null }, true),
    [transitionToAccount],
  );

  const selectTab = useCallback(
    async (nextTab: AccountDataTab) => {
      if (isCashAccount && nextTab !== 'cash') return;
      if (nextTab === tab) return;
      await transition(() => {
        clearDraft(); resetTabContext(); setTab(nextTab);
        updateLocation({ tab: nextTab, entry: null });
      });
    },
    [clearDraft, transition, isCashAccount, resetTabContext, tab, updateLocation],
  );

  const handleAccountManagerOpenChange = useCallback(
    async (open: boolean) => {
      if (open) {
        setAccountManagerOpen(true);
        return;
      }
      await transition(() => {
        clearDraft(); setAccountManagerOpen(false); updateLocation({ setup: null });
      });
    },
    [clearDraft, transition, updateLocation],
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
    accountId: effectiveAccountId,
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
