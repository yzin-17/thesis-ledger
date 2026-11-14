import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';

import type {
  Account,
  HeldAssetType,
  InstrumentLookup,
  PortfolioChangeImpact,
  Position,
} from './portfolio.types.js';
import { portfolioKeys, useManagedAccountsQuery } from './portfolio.queries.js';
import {
  useConfirmPortfolioInstrumentMutation,
  useClearPortfolioPositionsMutation,
  usePermanentDeleteAccountMutation,
  useRemovePortfolioPositionMutation,
  useSaveAccountMutation,
  useSaveCashBalanceMutation,
  useSavePositionMutation,
  useToggleAccountMutation,
} from './portfolio.mutations.js';
import { createPortfolioActionHandlers } from './portfolio.actions.js';
import { usePortfolioInstrumentSearch } from './portfolio.instrument-search.js';
import { PortfolioManagementView } from './PortfolioManagementView.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';

export const shouldAutoOpenEmptyAccountForm = ({
  step,
  accountsReady,
  managedAccountsLoaded,
  managedAccountCount,
  accountFormInline,
  accountManagerOpen,
  alreadyAutoOpened,
}: {
  step: 'account' | 'position';
  accountsReady: boolean;
  managedAccountsLoaded: boolean;
  managedAccountCount: number;
  accountFormInline: boolean;
  accountManagerOpen: boolean | undefined;
  alreadyAutoOpened: boolean;
}) =>
  step === 'account' &&
  accountsReady &&
  managedAccountsLoaded &&
  managedAccountCount === 0 &&
  (!accountFormInline || accountManagerOpen !== false) &&
  !alreadyAutoOpened;

export function PortfolioManagement(props: PortfolioManagementProps) {
  const {
    positionsRefreshing = false,
    cashValue,
    showCash = true,
    resolveInstrumentName,
    embedded = false,
    onOpenImport,
    onOpenReconciliation,
    onAccountEntry,
    entryAccountLocked = false,
  } = props;

  const {
    accounts,
    positions,
    step,
    calibrationMode,
    accountFormInline,
    editing,
    setEditing,
    editingAccount,
    setEditingAccount,
    accountSheetOpen,
    entrySheetMode,
    setEntrySheetMode,
    entryAccountId,
    setEntryAccountId,
    busyAction,
    instrumentQuery,
    setInstrumentQuery,
    selectedInstrument,
    setSelectedInstrument,
    instrumentSearchOpen,
    setInstrumentSearchOpen,
    manualInstrumentEntry,
    setManualInstrumentEntry,
    manualAssetType,
    setManualAssetType,
    managedAccountsQuery,
    refreshManagedAccounts,
    managedAccounts,
    positionSheetOpen,
    selectedAccount,
    instrumentResults,
    instrumentSearchState,
    instrumentSearchBusy,
    markDirty,
    openEntrySheet,
    confirmDiscard,
    closeAccountSheet,
    requestPositionSheetOpen,
    actions,
  } = usePortfolioManagementController(props);
  return (
    <PortfolioManagementView
      accounts={accounts}
      positions={positions}
      positionsRefreshing={positionsRefreshing}
      cashValue={cashValue}
      step={step}
      showCash={showCash}
      calibrationMode={calibrationMode}
      embedded={embedded}
      {...(resolveInstrumentName ? { resolveInstrumentName } : {})}
      {...(onOpenImport ? { onOpenImport } : {})}
      {...(onOpenReconciliation ? { onOpenReconciliation } : {})}
      accountFormInline={accountFormInline}
      managedAccounts={managedAccounts}
      managedAccountsError={managedAccountsQuery.isError}
      managedAccountsPending={managedAccountsQuery.isFetching}
      onRetryManagedAccounts={() => void refreshManagedAccounts()}
      onAccountEntry={onAccountEntry}
      selectedAccount={selectedAccount}
      entryAccountLocked={entryAccountLocked}
      positionSheetOpen={positionSheetOpen}
      accountSheetOpen={accountSheetOpen}
      entrySheetMode={entrySheetMode}
      entryAccountId={entryAccountId}
      editing={editing}
      editingAccount={editingAccount}
      busyAction={busyAction}
      instrumentQuery={instrumentQuery}
      instrumentResults={instrumentResults}
      instrumentSearchState={instrumentSearchState}
      instrumentSearchBusy={instrumentSearchBusy}
      instrumentSearchOpen={instrumentSearchOpen}
      selectedInstrument={selectedInstrument}
      manualInstrumentEntry={manualInstrumentEntry}
      manualAssetType={manualAssetType}
      markDirty={markDirty}
      confirmDiscard={confirmDiscard}
      openEntrySheet={openEntrySheet}
      toggleAccount={actions.toggleAccount}
      permanentlyDeleteAccount={actions.permanentlyDeleteAccount}
      submitAccount={actions.submitAccount}
      submitPosition={actions.submitPosition}
      submitCashBalance={actions.submitCashBalance}
      clearPositions={actions.clearPositions}
      remove={actions.remove}
      confirmInstrument={actions.confirmInstrument}
      clearInstrumentSelection={actions.clearInstrumentSelection}
      startManualInstrumentEntry={actions.startManualInstrumentEntry}
      handleInstrumentQueryChange={actions.handleInstrumentQueryChange}
      setAccountSheetOpen={(open) => {
        void closeAccountSheet(open);
      }}
      setPositionSheetOpen={(open) => void requestPositionSheetOpen(open)}
      setEditingAccount={setEditingAccount}
      setEditing={setEditing}
      setEntryAccountId={setEntryAccountId}
      setEntrySheetMode={setEntrySheetMode}
      setSelectedInstrument={setSelectedInstrument}
      setInstrumentQuery={setInstrumentQuery}
      setInstrumentSearchOpen={setInstrumentSearchOpen}
      setManualInstrumentEntry={setManualInstrumentEntry}
      setManualAssetType={setManualAssetType}
    />
  );
}

type PortfolioManagementProps = {
  accounts: Account[];
  positions: Position[];
  positionsRefreshing?: boolean;
  cashValue?: number;
  step: 'account' | 'position';
  showCash?: boolean;
  calibrationMode?: boolean;
  resolveInstrumentName?: (symbol: string) => string | undefined;
  embedded?: boolean;
  onOpenImport?: () => void;
  onOpenReconciliation?: () => void;
  accountFormInline?: boolean;
  accountManagerOpen?: boolean;
  defaultAccountId?: string;
  accountsReady?: boolean;
  onAccountEntry?: (accountId: string) => void;
  entryAccountLocked?: boolean;
  entrySheetOpen?: boolean;
  onEntrySheetOpenChange?: (open: boolean) => void;
  editingPosition?: Position | null;
  onEditingPositionChange?: (editing: Position | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onSaved: (impact: PortfolioChangeImpact) => void | Promise<unknown>;
};

function usePortfolioManagementController({
  accounts,
  positions,
  step,
  calibrationMode = false,
  accountFormInline = false,
  accountManagerOpen,
  defaultAccountId,
  accountsReady = true,
  entrySheetOpen,
  onEntrySheetOpenChange,
  editingPosition,
  onEditingPositionChange,
  onDirtyChange,
  onBusyChange,
  onSaved,
}: PortfolioManagementProps) {
  const initialEntryAccountId = defaultAccountId ?? accounts[0]?.id ?? '';
  const { editing, setEditing, editingAccount, setEditingAccount } = usePortfolioEditingState(
    editingPosition,
    onEditingPositionChange,
  );
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [uncontrolledEntrySheetOpen, setUncontrolledEntrySheetOpen] = useState(false);
  const [entrySheetMode, setEntrySheetMode] = useState<'position' | 'cash'>('position');
  const [entryAccountId, setEntryAccountId] = useState(initialEntryAccountId);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [instrumentQuery, setInstrumentQuery] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentLookup | null>(null);
  const [instrumentConfirmationBusy, setInstrumentConfirmationBusy] = useState(false);
  useNavigationGuard({
    dirty,
    busy: busyAction !== null || instrumentConfirmationBusy,
    draft: {
      revision: draftRevision,
      entryAccountId,
      entrySheetMode,
      positionId: editing?.id,
      accountId: editingAccount?.id,
      accountSheetOpen,
      entrySheetOpen: entrySheetOpen ?? uncontrolledEntrySheetOpen,
    },
  });
  const [instrumentSearchOpen, setInstrumentSearchOpen] = useState(false);
  const [manualInstrumentEntry, setManualInstrumentEntry] = useState(false);
  const [manualAssetType, setManualAssetType] = useState<HeldAssetType>('stock');
  const instrumentSelectionInProgress = useRef(false);
  const accountSaveErrorToastId = useRef<string | null>(null);
  const positionSaveErrorToastId = useRef<string | null>(null);
  const emptyAccountFormAutoOpened = useRef(false);
  const { confirm } = useConfirmDialog();
  const toastManager = useToastManager();
  const queryClient = useQueryClient();
  const managedAccountsQuery = useManagedAccountsQuery(step === 'account' && accountsReady);
  const refreshManagedAccounts = () =>
    queryClient.refetchQueries({ queryKey: portfolioKeys.accounts() }, { cancelRefetch: false });
  const managedAccounts = managedAccountsQuery.data ?? accounts;
  const managedAccountsLoaded =
    step !== 'account' || managedAccountsQuery.isSuccess || managedAccountsQuery.isError;
  const mutations = usePortfolioManagementMutations();
  const positionSheetOpen = entrySheetOpen ?? uncontrolledEntrySheetOpen;
  const selectedAccount = accounts.find((account) => account.id === entryAccountId);
  const selectedAccountType = selectedAccount?.type;
  const instrumentSearch = usePortfolioInstrumentSearch({
    accountType: selectedAccountType,
    positionSheetOpen,
    editing,
    selectedInstrument,
    manualInstrumentEntry,
    instrumentConfirmationBusy,
    instrumentQuery,
    toastManager,
  });
  const {
    results: instrumentResults,
    state: instrumentSearchState,
    busy: instrumentSearchBusy,
  } = instrumentSearch;

  const markDirty = (nextDirty = true) => {
    if (nextDirty) setDraftRevision((value) => value + 1);
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  };
  const setPositionSheetOpen = (open: boolean) => {
    if (entrySheetOpen === undefined) setUncontrolledEntrySheetOpen(open);
    onEntrySheetOpenChange?.(open);
  };
  const openEntrySheet = (mode: 'position' | 'cash' = 'position') => {
    setEntrySheetMode(mode);
    setPositionSheetOpen(true);
  };
  const confirmDiscard = async () => {
    if (busyAction) return false;
    if (!dirty) return true;
    return confirm({
      title: '放弃未保存修改？',
      description: '当前有未保存修改，切换后会丢弃，继续吗？',
      confirmLabel: '放弃修改',
      cancelLabel: '继续编辑',
      variant: 'destructive',
    });
  };
  const closeAccountSheet = async (open: boolean) => {
    if (open) {
      setAccountSheetOpen(true);
      return;
    }
    if (!(await confirmDiscard())) return;
    setEditingAccount(null);
    markDirty(false);
    setAccountSheetOpen(false);
  };
  const requestPositionSheetOpen = async (open: boolean) => {
    if (!open && !(await confirmDiscard())) return;
    if (!open) markDirty(false);
    setPositionSheetOpen(open);
  };

  usePortfolioManagementLifecycle({
    onBusyChange,
    busyAction,
    defaultAccountId,
    setEntryAccountId,
    entryAccountId,
    accounts,
    editing,
    setInstrumentQuery,
    setSelectedInstrument,
    setInstrumentSearchOpen,
    setManualInstrumentEntry,
    positionSheetOpen,
    step,
    accountsReady,
    managedAccountsLoaded,
    managedAccounts,
    accountFormInline,
    accountManagerOpen,
    emptyAccountFormAutoOpened,
    setAccountSheetOpen,
    setEditingAccount,
    setDirty,
    onDirtyChange,
  });

  const actions = createPortfolioActionHandlers({
    accounts,
    positions,
    busyAction,
    setBusyAction,
    editing,
    editingAccount,
    selectedAccount,
    entryAccountId,
    selectedInstrument,
    manualInstrumentEntry,
    manualAssetType,
    calibrationMode,
    instrumentQuery,
    instrumentSelectionInProgress,
    setInstrumentConfirmationBusy,
    setEditing,
    setEditingAccount,
    setAccountSheetOpen,
    setSelectedInstrument,
    setInstrumentQuery,
    setInstrumentSearchOpen,
    setManualInstrumentEntry,
    setManualAssetType,
    setPositionSheetOpen,
    markDirty,
    confirm,
    onSaved,
    refreshManagedAccounts,
    accountSaveErrorToastId,
    positionSaveErrorToastId,
    toastManager,
    mutations,
  });

  return {
    accounts,
    positions,
    step,
    calibrationMode,
    accountFormInline,
    editing,
    setEditing,
    editingAccount,
    setEditingAccount,
    accountSheetOpen,
    entrySheetMode,
    setEntrySheetMode,
    entryAccountId,
    setEntryAccountId,
    busyAction,
    instrumentQuery,
    setInstrumentQuery,
    selectedInstrument,
    setSelectedInstrument,
    instrumentSearchOpen,
    setInstrumentSearchOpen,
    manualInstrumentEntry,
    setManualInstrumentEntry,
    manualAssetType,
    setManualAssetType,
    managedAccountsQuery,
    refreshManagedAccounts,
    managedAccounts,
    positionSheetOpen,
    selectedAccount,
    instrumentResults,
    instrumentSearchState,
    instrumentSearchBusy,
    markDirty,
    openEntrySheet,
    confirmDiscard,
    closeAccountSheet,
    requestPositionSheetOpen,
    actions,
  };
}

type PortfolioManagementLifecycleInput = {
  onBusyChange: PortfolioManagementProps['onBusyChange'];
  defaultAccountId: PortfolioManagementProps['defaultAccountId'];
  accounts: Account[];
  managedAccounts: Account[];
  step: PortfolioManagementProps['step'];
  accountsReady: boolean;
  accountFormInline: boolean;
  accountManagerOpen: PortfolioManagementProps['accountManagerOpen'];
  onDirtyChange: PortfolioManagementProps['onDirtyChange'];
  busyAction: string | null;
  entryAccountId: string;
  editing: Position | null;
  positionSheetOpen: boolean;
  managedAccountsLoaded: boolean;
  emptyAccountFormAutoOpened: { current: boolean };
  setEntryAccountId: (value: SetStateAction<string>) => void;
  setInstrumentQuery: (value: SetStateAction<string>) => void;
  setSelectedInstrument: (value: SetStateAction<InstrumentLookup | null>) => void;
  setInstrumentSearchOpen: (value: SetStateAction<boolean>) => void;
  setManualInstrumentEntry: (value: SetStateAction<boolean>) => void;
  setAccountSheetOpen: (value: SetStateAction<boolean>) => void;
  setEditingAccount: (value: SetStateAction<Account | null>) => void;
  setDirty: (value: SetStateAction<boolean>) => void;
};

function usePortfolioManagementLifecycle({
  onBusyChange,
  busyAction,
  defaultAccountId,
  setEntryAccountId,
  entryAccountId,
  accounts,
  editing,
  setInstrumentQuery,
  setSelectedInstrument,
  setInstrumentSearchOpen,
  setManualInstrumentEntry,
  positionSheetOpen,
  step,
  accountsReady,
  managedAccountsLoaded,
  managedAccounts,
  accountFormInline,
  accountManagerOpen,
  emptyAccountFormAutoOpened,
  setAccountSheetOpen,
  setEditingAccount,
  setDirty,
  onDirtyChange,
}: PortfolioManagementLifecycleInput) {
  useEffect(() => {
    onBusyChange?.(busyAction !== null);
  }, [busyAction, onBusyChange]);

  useEffect(() => {
    if (defaultAccountId) setEntryAccountId(defaultAccountId);
    else if (!entryAccountId && accounts[0]) setEntryAccountId(accounts[0].id);
  }, [accounts, defaultAccountId, entryAccountId]);

  useEffect(() => {
    if (editing) {
      setInstrumentQuery(editing.symbol);
      setSelectedInstrument(null);
      setInstrumentSearchOpen(false);
      setManualInstrumentEntry(false);
      return;
    }
    setInstrumentQuery('');
    setSelectedInstrument(null);
    setInstrumentSearchOpen(false);
    setManualInstrumentEntry(false);
  }, [editing, positionSheetOpen]);

  useEffect(() => {
    if (
      !shouldAutoOpenEmptyAccountForm({
        step,
        accountsReady,
        managedAccountsLoaded,
        managedAccountCount: managedAccounts.length,
        accountFormInline,
        accountManagerOpen,
        alreadyAutoOpened: emptyAccountFormAutoOpened.current,
      })
    )
      return;
    emptyAccountFormAutoOpened.current = true;
    setAccountSheetOpen(true);
  }, [
    accountFormInline,
    accountManagerOpen,
    accountsReady,
    managedAccounts.length,
    managedAccountsLoaded,
    step,
  ]);

  useEffect(() => {
    if (!accountFormInline || accountManagerOpen !== false) return;
    emptyAccountFormAutoOpened.current = false;
    setAccountSheetOpen(false);
    setEditingAccount(null);
    setDirty(false);
    onDirtyChange?.(false);
  }, [accountFormInline, accountManagerOpen, onDirtyChange]);
}

function usePortfolioEditingState(
  editingPosition: PortfolioManagementProps['editingPosition'],
  onEditingPositionChange: PortfolioManagementProps['onEditingPositionChange'],
) {
  const [uncontrolledEditing, setUncontrolledEditing] = useState<Position | null>(null);
  const editing = editingPosition ?? uncontrolledEditing;
  const setEditing = (position: SetStateAction<Position | null>) => {
    const next = typeof position === 'function' ? position(uncontrolledEditing) : position;
    setUncontrolledEditing(next);
    onEditingPositionChange?.(next);
  };
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  return { editing, setEditing, editingAccount, setEditingAccount };
}

function usePortfolioManagementMutations() {
  const mutations = {
    saveAccount: useSaveAccountMutation(),
    toggleAccount: useToggleAccountMutation(),
    permanentlyDeleteAccount: usePermanentDeleteAccountMutation(),
    confirmInstrument: useConfirmPortfolioInstrumentMutation(),
    savePosition: useSavePositionMutation(),
    saveCash: useSaveCashBalanceMutation(),
    clearPositions: useClearPortfolioPositionsMutation(),
    removePosition: useRemovePortfolioPositionMutation(),
  };
  return mutations;
}
