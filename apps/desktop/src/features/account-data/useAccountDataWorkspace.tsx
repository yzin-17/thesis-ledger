import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import type { LedgerEvent } from '@thesis-ledger/api-client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRemovePortfolioPositionMutation } from '../portfolio/portfolio.mutations.js';
import { portfolioKeys, useAccountValuationQuery } from '../portfolio/portfolio.queries.js';
import type { Account, PortfolioChangeImpact, Position } from '../portfolio/portfolio.types.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { usePageRefresh } from '../shared/usePageRefresh.js';
import { cashDepositKeys } from './account-data.cash.queries.js';
import { fundInvestmentKeys } from './account-data.fund-investment.queries.js';
import { errorMessage, instrumentNameLookup } from './account-data.helpers.js';
import {
  accountDataKeys,
  useAccountLedgerAuditQuery,
  useAccountLedgerEventsQuery,
  useReconciliationCandidatesQuery,
  type AccountDataEventFilter,
} from './account-data.queries.js';
import type { CashTransferEvent, ExecutionEvent, VoidEvent } from './account-data.types.js';
import { type ExecutionSheetCloseOptions } from './AccountDataExecutionSheet.js';
import { invalidatePortfolioChange } from './portfolio-change.js';
import { useAccountDataNavigation } from './useAccountDataNavigation.js';
export type AccountDataPageProps = {
  accounts: Account[];
  accountsReady?: boolean;
  accountsPending?: boolean;
  accountsError?: boolean;
  mode?: Account['mode'];
  onRetryAccounts?: () => void;
};

export function useAccountDataWorkspace({
  accounts,
  accountsReady = true,
  accountsPending = false,
  accountsError = false,
  mode = 'actual',
  onRetryAccounts,
}: AccountDataPageProps) {
  const state = useAccountDataWorkspaceState({ accounts, mode });
  const {
    transactionFilter,
    setTransactionFilter,
    executionOpen,
    setExecutionOpen,
    editingEvent,
    auditEvent,
    setAuditEvent,
    voidEvent,
    setVoidEvent,
    restoreEvent,
    setRestoreEvent,
    importOpen,
    setImportOpen,
    reconciliationOpen,
    setReconciliationOpen,
    cashObservationOpen,
    setCashObservationOpen,
    cashTransferAction,
    setCashTransferAction,
    setDraftDirty,
    setAccountManagerBusy,
    positionSheetOpen,
    setPositionSheetOpen,
    positionSheetEditing,
    setPositionSheetEditing,
    queryClient,
    refreshAction,
    modeAccounts,
  } = state;

  const { confirmDiscard, clearDraft, resetAccountContext, resetTabContext, resetEmptyState } =
    useAccountDataNavigationActions(state);

  const navigation = useAccountDataNavigation({
    accounts: modeAccounts,
    mode,
    accountsReady,
    accountsPending,
    accountsError,
    confirmDiscard,
    clearDraft,
    resetAccountContext,
    resetEmptyState,
    resetTabContext,
  });
  const {
    accountId,
    accountManagerOpen,
    entryRequested,
    fundOccurrenceId,
    handleAccountManagerOpenChange,
    isCashAccount,
    navigateToTab,
    openAccountManager,
    selectAccount,
    selectManagedAccount,
    selectTab,
    selectedAccount,
    tab,
  } = navigation;

  const valuationQuery = useAccountValuationQuery(
    accountId,
    selectedAccount?.mode,
    Boolean(selectedAccount),
  );
  const ledgerEventsQuery = useAccountLedgerEventsQuery(
    accountId,
    selectedAccount?.mode,
    transactionFilter,
    Boolean(selectedAccount),
  );
  const auditQuery = useAccountLedgerAuditQuery(
    accountId,
    selectedAccount?.mode,
    Boolean(auditEvent),
  );
  const reconciliationQuery = useReconciliationCandidatesQuery(
    accountId,
    selectedAccount?.mode,
    reconciliationOpen,
  );
  const refreshPortfolio = useCallback(
    (impact?: PortfolioChangeImpact) => {
      const effectiveImpact =
        impact ??
        ({
          mode: selectedAccount?.mode ?? 'actual',
          accountIds: accountId ? [accountId] : [],
          events: true,
          audit: true,
        } satisfies PortfolioChangeImpact);
      return invalidatePortfolioChange(queryClient, effectiveImpact);
    },
    [accountId, queryClient, selectedAccount?.mode],
  );
  const handlePortfolioChanged = useCallback(
    (impact?: PortfolioChangeImpact) => {
      void refreshPortfolio(impact);
    },
    [refreshPortfolio],
  );

  useEffect(() => {
    if (entryRequested === 'execution') setExecutionOpen(true);
    if (
      (entryRequested === 'draft' || entryRequested === 'screenshot') &&
      selectedAccount?.type !== 'cash'
    )
      setImportOpen(true);
  }, [entryRequested, selectedAccount?.type]);

  const {
    openCreateExecution,
    openCorrectExecution,
    closeExecution,
    openImport,
    closeImport,
    openAudit,
    openVoidExecution,
  } = createAccountDataExecutionActions(state, navigation, confirmDiscard);

  const {
    events,
    currentLedgerRevision,
    ledgerReady,
    accountPositions,
    cashValue,
    resolveInstrumentName,
  } = accountDataWorkspaceReadModels(valuationQuery, ledgerEventsQuery);

  const { findSnapshotPosition, openSnapshotEditor, removeSnapshot } =
    createAccountDataSnapshotActions(
      state,
      navigation,
      accountPositions,
      resolveInstrumentName,
      refreshPortfolio,
    );

  const activeTab = isCashAccount ? 'cash' : tab;

  return {
    refreshAction,
    modeAccounts,
    accountId,
    selectAccount,
    openAccountManager,
    activeTab,
    selectTab,
    isCashAccount,
    selectedAccount,
    events,
    ledgerEventsQuery,
    transactionFilter,
    setTransactionFilter,
    openCreateExecution,
    openCorrectExecution,
    openVoidExecution,
    setCashTransferAction,
    openAudit,
    findSnapshotPosition,
    openSnapshotEditor,
    removeSnapshot,
    resolveInstrumentName,
    openImport,
    setReconciliationOpen,
    navigateToTab,
    accountPositions,
    cashValue,
    valuationQuery,
    setDraftDirty,
    setAccountManagerBusy,
    refreshPortfolio,
    positionSheetOpen,
    setPositionSheetOpen,
    setPositionSheetEditing,
    positionSheetEditing,
    setCashObservationOpen,
    fundOccurrenceId,
    executionOpen,
    editingEvent,
    currentLedgerRevision,
    closeExecution,
    auditEvent,
    auditQuery,
    setAuditEvent,
    setRestoreEvent,
    voidEvent,
    setVoidEvent,
    restoreEvent,
    reconciliationOpen,
    reconciliationQuery,
    ledgerReady,
    cashObservationOpen,
    cashTransferAction,
    importOpen,
    handlePortfolioChanged,
    closeImport,
    accountManagerOpen,
    handleAccountManagerOpenChange,
    accounts,
    accountsReady,
    selectManagedAccount,
    accountsPending,
    accountsError,
    onRetryAccounts,
  };
}

function useAccountDataWorkspaceState({
  accounts,
  mode,
}: {
  accounts: Account[];
  mode: Account['mode'];
}) {
  const [transactionFilter, setTransactionFilter] = useState<AccountDataEventFilter>('executions');
  const [executionOpen, setExecutionOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ExecutionEvent | null>(null);
  const [auditEvent, setAuditEvent] = useState<LedgerEvent | null>(null);
  const [voidEvent, setVoidEvent] = useState<ExecutionEvent | null>(null);
  const [restoreEvent, setRestoreEvent] = useState<{
    event: VoidEvent;
    source: ExecutionEvent;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [cashObservationOpen, setCashObservationOpen] = useState(false);
  const [cashTransferAction, setCashTransferAction] = useState<{
    event: CashTransferEvent;
    mode: 'replace' | 'void' | 'restore';
  } | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [accountManagerBusy, setAccountManagerBusy] = useState(false);
  const [positionSheetOpen, setPositionSheetOpen] = useState(false);
  const [positionSheetEditing, setPositionSheetEditing] = useState<Position | null>(null);
  useNavigationGuard({
    dirty: draftDirty,
    busy: accountManagerBusy,
    draft: {
      mode,
      executionOpen,
      executionEventId: editingEvent?.eventId,
      importOpen,
      positionSheetOpen,
      positionId: positionSheetEditing?.id,
    },
  });
  const { confirm } = useConfirmDialog();
  const toastManager = useToastManager();
  const queryClient = useQueryClient();
  const pageRefresh = usePageRefresh([
    { queryKey: portfolioKeys.root },
    { queryKey: accountDataKeys.root },
    { queryKey: cashDepositKeys.root },
    { queryKey: fundInvestmentKeys.root },
  ]);
  const refreshAction = (
    <RefreshIconButton
      label="刷新账户数据"
      refreshing={pageRefresh.refreshing}
      onClick={() => void pageRefresh.refresh()}
    />
  );
  const removeSnapshotMutation = useRemovePortfolioPositionMutation();
  const modeAccounts = useMemo(
    () => accounts.filter((account) => account.mode === mode),
    [accounts, mode],
  );
  return {
    transactionFilter,
    setTransactionFilter,
    executionOpen,
    setExecutionOpen,
    editingEvent,
    setEditingEvent,
    auditEvent,
    setAuditEvent,
    voidEvent,
    setVoidEvent,
    restoreEvent,
    setRestoreEvent,
    importOpen,
    setImportOpen,
    reconciliationOpen,
    setReconciliationOpen,
    cashObservationOpen,
    setCashObservationOpen,
    cashTransferAction,
    setCashTransferAction,
    draftDirty,
    setDraftDirty,
    accountManagerBusy,
    setAccountManagerBusy,
    positionSheetOpen,
    setPositionSheetOpen,
    positionSheetEditing,
    setPositionSheetEditing,
    confirm,
    toastManager,
    queryClient,
    pageRefresh,
    refreshAction,
    removeSnapshotMutation,
    modeAccounts,
  };
}

function createAccountDataExecutionActions(
  state: ReturnType<typeof useAccountDataWorkspaceState>,
  navigation: ReturnType<typeof useAccountDataNavigation>,
  confirmDiscard: () => Promise<boolean>,
) {
  const { selectedAccount, isCashAccount, navigateToTab, updateLocation } = navigation;
  const {
    setEditingEvent,
    setExecutionOpen,
    setDraftDirty,
    setImportOpen,
    setAuditEvent,
    setVoidEvent,
  } = state;
  const openCreateExecution = () => {
    if (!selectedAccount || selectedAccount.type === 'cash') return;
    setEditingEvent(null);
    setExecutionOpen(true);
    navigateToTab('transactions', 'execution');
  };

  const openCorrectExecution = async (event: ExecutionEvent) => {
    if (isCashAccount) return;
    if (!(await confirmDiscard())) return;
    setAuditEvent(null);
    setEditingEvent(event);
    setExecutionOpen(true);
    navigateToTab('transactions', 'execution');
  };

  const closeExecution = async (open: boolean, options?: ExecutionSheetCloseOptions) => {
    if (open) {
      setExecutionOpen(true);
      return;
    }
    if (!options?.skipDiscardConfirm && !(await confirmDiscard())) return;
    setDraftDirty(false);
    setEditingEvent(null);
    setExecutionOpen(false);
    updateLocation({ entry: null });
  };

  const openImport = async () => {
    if (!selectedAccount || selectedAccount.type === 'cash' || !(await confirmDiscard())) return;
    setDraftDirty(false);
    setImportOpen(true);
    updateLocation({ tab: 'positions', entry: 'draft' });
  };

  const closeImport = async (open: boolean) => {
    if (open) {
      setImportOpen(true);
      return;
    }
    if (!(await confirmDiscard())) return;
    setDraftDirty(false);
    setImportOpen(false);
    updateLocation({ entry: null });
  };

  const openAudit = (event: LedgerEvent) => {
    setAuditEvent(event);
  };

  const openVoidExecution = (event: ExecutionEvent) => {
    setAuditEvent(null);
    setVoidEvent(event);
  };
  return {
    openCreateExecution,
    openCorrectExecution,
    closeExecution,
    openImport,
    closeImport,
    openAudit,
    openVoidExecution,
  };
}

function createAccountDataSnapshotActions(
  state: ReturnType<typeof useAccountDataWorkspaceState>,
  navigation: ReturnType<typeof useAccountDataNavigation>,
  accountPositions: Position[],
  resolveInstrumentName: ReturnType<typeof instrumentNameLookup>,
  refreshPortfolio: (impact?: PortfolioChangeImpact) => Promise<void>,
) {
  const { selectTab, selectedAccount } = navigation;
  const {
    setPositionSheetEditing,
    setPositionSheetOpen,
    accountManagerBusy,
    removeSnapshotMutation,
    confirm,
    setAccountManagerBusy,
    toastManager,
  } = state;
  const findSnapshotPosition = (event: LedgerEvent) =>
    event.type === 'POSITION_BASELINE_OBSERVATION' && event.revisionAction !== 'VOID'
      ? accountPositions.find(
          (position) =>
            position.accountId === event.accountId && position.symbol === event.payload.symbol,
        )
      : undefined;

  const openSnapshotEditor = (event: LedgerEvent) => {
    const position = findSnapshotPosition(event);
    if (!position) return;
    setPositionSheetEditing(position);
    setPositionSheetOpen(true);
    void selectTab('positions');
  };

  const removeSnapshot = async (event: LedgerEvent) => {
    if (accountManagerBusy || removeSnapshotMutation.isPending) return;
    const position = findSnapshotPosition(event);
    if (!position) return;
    if (
      !(await confirm({
        title: '移除快照？',
        description: `确认移除 ${resolveInstrumentName(position.symbol) ?? (position.asset.name || position.symbol)}（${position.symbol}）？`,
        confirmLabel: '移除快照',
        cancelLabel: '取消',
        variant: 'destructive',
      }))
    )
      return;
    setAccountManagerBusy(true);
    try {
      await removeSnapshotMutation.mutateAsync(position.id);
      await refreshPortfolio({
        mode: selectedAccount?.mode ?? 'actual',
        accountIds: [position.accountId],
        events: true,
        audit: true,
        reconciliation: true,
      }).catch(() => undefined);
      toastManager.add({ title: '持仓快照已移除', type: 'success', timeout: 2800 });
    } catch (caught) {
      toastManager.add({
        title: '持仓快照移除失败',
        description: errorMessage(caught, '请稍后重试。'),
        type: 'error',
        timeout: 0,
      });
    } finally {
      setAccountManagerBusy(false);
    }
  };
  return { findSnapshotPosition, openSnapshotEditor, removeSnapshot };
}

function useAccountDataNavigationActions(state: ReturnType<typeof useAccountDataWorkspaceState>) {
  const {
    accountManagerBusy,
    draftDirty,
    confirm,
    setDraftDirty,
    setExecutionOpen,
    setEditingEvent,
    setAuditEvent,
    setVoidEvent,
    setRestoreEvent,
    setImportOpen,
    setReconciliationOpen,
    setCashObservationOpen,
    setCashTransferAction,
    setPositionSheetOpen,
    setPositionSheetEditing,
  } = state;
  const confirmDiscard = useCallback(async () => {
    if (accountManagerBusy) return false;
    if (!draftDirty) return true;
    return confirm({
      title: '放弃未保存修改？',
      description: '当前有未保存修改，切换后会丢弃，继续吗？',
      confirmLabel: '放弃修改',
      cancelLabel: '继续编辑',
      variant: 'destructive',
    });
  }, [accountManagerBusy, confirm, draftDirty]);

  const clearDraft = useCallback(() => {
    setDraftDirty(false);
  }, []);

  const resetAccountContext = useCallback(() => {
    setExecutionOpen(false);
    setEditingEvent(null);
    setAuditEvent(null);
    setVoidEvent(null);
    setRestoreEvent(null);
    setImportOpen(false);
    setReconciliationOpen(false);
    setCashObservationOpen(false);
    setCashTransferAction(null);
    setPositionSheetOpen(false);
    setPositionSheetEditing(null);
  }, []);

  const resetTabContext = useCallback(() => {
    setExecutionOpen(false);
    setEditingEvent(null);
    setImportOpen(false);
    setReconciliationOpen(false);
    setCashObservationOpen(false);
    setCashTransferAction(null);
  }, []);

  const resetEmptyState = useCallback(() => {
    resetAccountContext();
    setPositionSheetOpen(false);
    setPositionSheetEditing(null);
  }, [resetAccountContext]);
  return { confirmDiscard, clearDraft, resetAccountContext, resetTabContext, resetEmptyState };
}

function accountDataWorkspaceReadModels(
  valuationQuery: ReturnType<typeof useAccountValuationQuery>,
  ledgerEventsQuery: ReturnType<typeof useAccountLedgerEventsQuery>,
) {
  const events = ledgerEventsQuery.data?.events ?? [];
  const currentLedgerRevision = ledgerEventsQuery.data?.ledgerRevision ?? '0';
  const ledgerReady =
    !ledgerEventsQuery.isPending && !ledgerEventsQuery.isError && !ledgerEventsQuery.isFetching;
  const accountPositions = valuationQuery.data?.positions ?? [];
  const cashValue = valuationQuery.data?.cashValue ?? 0;
  const resolveInstrumentName = instrumentNameLookup(ledgerEventsQuery.data?.instrumentDirectory);
  return {
    events,
    currentLedgerRevision,
    ledgerReady,
    accountPositions,
    cashValue,
    resolveInstrumentName,
  };
}
