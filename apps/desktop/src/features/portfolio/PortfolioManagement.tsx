import { useEffect, useRef, useState } from 'react';
import { useToastManager } from '@/components/ui/toast';

import type { Account, HeldAssetType, InstrumentLookup, Position } from './portfolio.types.js';
import { useManagedAccountsQuery } from './portfolio.queries.js';
import {
  useConfirmPortfolioInstrumentMutation,
  useClearPortfolioPositionsMutation,
  useRemovePortfolioPositionMutation,
  useSaveAccountMutation,
  useSaveCashBalanceMutation,
  useSavePositionMutation,
  useToggleAccountMutation,
} from './portfolio.mutations.js';
import { createPortfolioActionHandlers } from './portfolio.actions.js';
import { usePortfolioInstrumentSearch } from './portfolio.instrument-search.js';
import { PortfolioManagementView } from './PortfolioManagementView.js';

export function PortfolioManagement({
  accounts,
  positions,
  cashValue,
  step,
  showCash = true,
  calibrationMode = false,
  defaultAccountId,
  accountsReady = true,
  onAccountEntry,
  entryAccountLocked = false,
  entrySheetOpen,
  onEntrySheetOpenChange,
  onDirtyChange,
  onSaved,
}: {
  accounts: Account[];
  positions: Position[];
  cashValue?: number;
  step: 'account' | 'position';
  showCash?: boolean;
  calibrationMode?: boolean;
  defaultAccountId?: string;
  accountsReady?: boolean;
  onAccountEntry?: (accountId: string) => void;
  entryAccountLocked?: boolean;
  entrySheetOpen?: boolean;
  onEntrySheetOpenChange?: (open: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const initialEntryAccountId = defaultAccountId ?? accounts[0]?.id ?? '';
  const [editing, setEditing] = useState<Position | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [uncontrolledEntrySheetOpen, setUncontrolledEntrySheetOpen] = useState(false);
  const [entrySheetMode, setEntrySheetMode] = useState<'position' | 'cash'>('position');
  const [entryAccountId, setEntryAccountId] = useState(initialEntryAccountId);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [instrumentQuery, setInstrumentQuery] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentLookup | null>(null);
  const [instrumentConfirmationBusy, setInstrumentConfirmationBusy] = useState(false);
  const [instrumentSearchOpen, setInstrumentSearchOpen] = useState(false);
  const [manualInstrumentEntry, setManualInstrumentEntry] = useState(false);
  const [manualAssetType, setManualAssetType] = useState<HeldAssetType>('stock');
  const instrumentSelectionInProgress = useRef(false);
  const toastManager = useToastManager();
  const managedAccountsQuery = useManagedAccountsQuery(step === 'account' && accountsReady);
  const managedAccounts = managedAccountsQuery.data ?? accounts;
  const managedAccountsLoaded =
    step !== 'account' || managedAccountsQuery.isSuccess || managedAccountsQuery.isError;
  const mutations = {
    saveAccount: useSaveAccountMutation(),
    toggleAccount: useToggleAccountMutation(),
    confirmInstrument: useConfirmPortfolioInstrumentMutation(),
    savePosition: useSavePositionMutation(),
    saveCash: useSaveCashBalanceMutation(),
    clearPositions: useClearPortfolioPositionsMutation(),
    removePosition: useRemovePortfolioPositionMutation(),
  };
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
  const confirmDiscard = () => !dirty || window.confirm('当前有未保存修改，切换后会丢弃，继续吗？');

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
    } else if (!positionSheetOpen) {
      setInstrumentQuery('');
      setSelectedInstrument(null);
      setInstrumentSearchOpen(false);
      setManualInstrumentEntry(false);
    }
  }, [editing, positionSheetOpen]);

  const loadManagedAccounts = async () => {
    if (step === 'account') await managedAccountsQuery.refetch();
  };
  useEffect(() => {
    if (
      step === 'account' &&
      accountsReady &&
      managedAccountsLoaded &&
      managedAccounts.length === 0
    )
      setAccountSheetOpen(true);
  }, [accountsReady, managedAccounts.length, managedAccountsLoaded, step]);

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
    setSelectedInstrument,
    setInstrumentQuery,
    setInstrumentSearchOpen,
    setManualInstrumentEntry,
    setManualAssetType,
    setPositionSheetOpen,
    markDirty,
    onSaved,
    toastManager,
    loadManagedAccounts,
    mutations,
  });

  return (
    <PortfolioManagementView
      accounts={accounts}
      positions={positions}
      cashValue={cashValue}
      step={step}
      showCash={showCash}
      calibrationMode={calibrationMode}
      managedAccounts={managedAccounts}
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
      submitAccount={actions.submitAccount}
      submitPosition={actions.submitPosition}
      submitCashBalance={actions.submitCashBalance}
      clearPositions={actions.clearPositions}
      remove={actions.remove}
      confirmInstrument={actions.confirmInstrument}
      clearInstrumentSelection={actions.clearInstrumentSelection}
      startManualInstrumentEntry={actions.startManualInstrumentEntry}
      handleInstrumentQueryChange={actions.handleInstrumentQueryChange}
      setAccountSheetOpen={setAccountSheetOpen}
      setPositionSheetOpen={setPositionSheetOpen}
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
