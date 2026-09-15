import { PageHeader } from '../shared/PageHeader.js';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LedgerEventV2 } from '@thesis-ledger/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { Account, Position } from '../portfolio/portfolio.types.js';
import { useAccountValuationQuery } from '../portfolio/portfolio.queries.js';
import { useRemovePortfolioPositionMutation } from '../portfolio/portfolio.mutations.js';
import { PortfolioManagement } from '../portfolio/PortfolioManagement.js';
import { ScreenshotImportReview } from '../import/ScreenshotImportReview.js';
import {
  useAccountLedgerAuditQuery,
  useAccountLedgerEventsQuery,
  useReconciliationCandidatesQuery,
  type AccountDataEventFilter,
} from './account-data.queries.js';
import { errorMessage } from './account-data.helpers.js';
import { PositionCalibrationSection, TransactionSection } from './AccountDataSections.js';
import { CashSection } from './AccountDataCashSections.js';
import {
  ExecutionFormSheet,
  type ExecutionSheetCloseOptions,
} from './AccountDataExecutionSheet.js';
import { AuditSheet, CorrectionReasonSheet } from './AccountDataAuditSheets.js';
import { ReconciliationSheet } from './AccountDataReconciliationSheet.js';
import { CashObservationSheet } from './AccountDataCashObservationSheet.js';
import { CashTransferCorrectionSheet } from './AccountDataCashTransferCorrectionSheet.js';
import type {
  AccountDataTab,
  CashTransferEvent,
  ExecutionEvent,
  VoidEvent,
} from './account-data.types.js';
import { invalidatePortfolioChange } from './portfolio-change.js';
import type { PortfolioChangeImpact } from '../portfolio/portfolio.types.js';
import { AccountDataAccountSelector } from './AccountDataAccountSelector.js';
import { AccountDataAllAccountsView } from './AccountDataAllAccountsView.js';
import { AccountDataFrame, AccountDataLoading } from './AccountDataLayout.js';
import { useAccountDataNavigation } from './useAccountDataNavigation.js';

export {
  accountSelectionTransition,
  resolveAccountSelection,
  shouldDeferAccountSelection,
} from './account-data.selection.js';

export function AccountDataPage({
  accounts,
  accountsReady = true,
  accountsPending = false,
  accountsError = false,
  mode = 'actual',
  onRetryAccounts,
}: {
  accounts: Account[];
  accountsReady?: boolean;
  accountsPending?: boolean;
  accountsError?: boolean;
  mode?: Account['mode'];
  onRetryAccounts?: () => void;
}) {
  const [transactionFilter, setTransactionFilter] = useState<AccountDataEventFilter>('executions');
  const [executionOpen, setExecutionOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ExecutionEvent | null>(null);
  const [auditEvent, setAuditEvent] = useState<LedgerEventV2 | null>(null);
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
  const [positionSheetOpen, setPositionSheetOpen] = useState(false);
  const [positionSheetEditing, setPositionSheetEditing] = useState<Position | null>(null);
  const { confirm } = useConfirmDialog();
  const toastManager = useToastManager();
  const queryClient = useQueryClient();
  const removeSnapshotMutation = useRemovePortfolioPositionMutation();

  const confirmDiscard = useCallback(async () => {
    if (!draftDirty) return true;
    return confirm({
      title: '放弃未保存修改？',
      description: '当前有未保存修改，切换后会丢弃，继续吗？',
      confirmLabel: '放弃修改',
      cancelLabel: '继续编辑',
      variant: 'destructive',
    });
  }, [confirm, draftDirty]);

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

  const {
    accountId,
    accountManagerOpen,
    allAccountsSelected,
    entryRequested,
    handleAccountManagerOpenChange,
    isCashAccount,
    navigateToTab,
    openAccountManager,
    selectAccount,
    selectManagedAccount,
    selectTab,
    selectedAccount,
    tab,
    updateLocation,
  } = useAccountDataNavigation({
    accounts,
    accountsReady,
    accountsPending,
    accountsError,
    confirmDiscard,
    clearDraft,
    resetAccountContext,
    resetEmptyState,
    resetTabContext,
  });

  const valuationQuery = useAccountValuationQuery(
    accountId,
    selectedAccount?.mode,
    Boolean(selectedAccount) && !allAccountsSelected,
  );
  const ledgerEventsQuery = useAccountLedgerEventsQuery(
    accountId,
    selectedAccount?.mode,
    transactionFilter,
    Boolean(selectedAccount) && !allAccountsSelected,
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
  const handlePortfolioChanged = useCallback(
    (impact?: PortfolioChangeImpact) => {
      const effectiveImpact =
        impact ??
        ({
          mode: selectedAccount?.mode ?? 'actual',
          accountIds: accountId ? [accountId] : [],
          events: true,
          audit: true,
        } satisfies PortfolioChangeImpact);
      void invalidatePortfolioChange(queryClient, effectiveImpact);
    },
    [accountId, queryClient, selectedAccount?.mode],
  );

  useEffect(() => {
    if (entryRequested === 'execution') setExecutionOpen(true);
    if (entryRequested === 'screenshot' && selectedAccount?.type !== 'cash') setImportOpen(true);
  }, [entryRequested, selectedAccount?.type]);

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
    updateLocation({ tab: 'positions', entry: 'screenshot' });
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

  const openAudit = (event: LedgerEventV2) => {
    setAuditEvent(event);
  };

  const openVoidExecution = (event: ExecutionEvent) => {
    setAuditEvent(null);
    setVoidEvent(event);
  };

  const events = ledgerEventsQuery.data?.events ?? [];
  const currentLedgerRevision = ledgerEventsQuery.data?.ledgerRevision ?? '0';
  const accountPositions = valuationQuery.data?.positions ?? [];
  const cashValue = valuationQuery.data?.cashValue ?? 0;

  const findSnapshotPosition = (event: LedgerEventV2) =>
    event.type === 'POSITION_BASELINE_OBSERVATION' && event.revisionAction !== 'VOID'
      ? accountPositions.find(
          (position) =>
            position.accountId === event.accountId && position.symbol === event.payload.symbol,
        )
      : undefined;

  const openSnapshotEditor = (event: LedgerEventV2) => {
    const position = findSnapshotPosition(event);
    if (!position) return;
    setPositionSheetEditing(position);
    setPositionSheetOpen(true);
    void selectTab('positions');
  };

  const removeSnapshot = async (event: LedgerEventV2) => {
    const position = findSnapshotPosition(event);
    if (!position) return;
    if (
      !(await confirm({
        title: '移除快照？',
        description: `确认移除 ${position.asset.name || position.symbol}（${position.symbol}）？`,
        confirmLabel: '移除快照',
        cancelLabel: '取消',
        variant: 'destructive',
      }))
    )
      return;
    try {
      await removeSnapshotMutation.mutateAsync(position.id);
      toastManager.add({ title: '持仓快照已移除', type: 'success', timeout: 2800 });
      handlePortfolioChanged({
        mode: selectedAccount?.mode ?? 'actual',
        accountIds: [position.accountId],
        events: true,
        audit: true,
        reconciliation: true,
      });
    } catch (caught) {
      toastManager.add({
        title: '持仓快照移除失败',
        description: errorMessage(caught, '请稍后重试。'),
        type: 'error',
        timeout: 0,
      });
    }
  };

  if (accountsPending && accounts.length === 0) {
    return <AccountDataLoading />;
  }

  if (accountsError && accounts.length === 0) {
    return (
      <AccountDataFrame>
        <PageHeader className="mb-0" eyebrow="ACCOUNT DATA" title="账户数据" />
        <Alert variant="destructive">
          <AlertTitle>账户读取失败</AlertTitle>
          <AlertDescription>无法打开账户数据。请检查服务状态后重试。</AlertDescription>
          {onRetryAccounts && (
            <Button type="button" variant="outline" size="sm" onClick={onRetryAccounts}>
              重新加载账户
            </Button>
          )}
        </Alert>
      </AccountDataFrame>
    );
  }

  if (accounts.length === 0) {
    return (
      <AccountDataFrame>
        <PageHeader
          className="mb-0"
          eyebrow="ACCOUNT DATA"
          title="账户数据"
          description="先创建一个账户，再录入成交、持仓或现金。"
        />
        <PortfolioManagement
          accounts={accounts}
          positions={[]}
          step="account"
          accountsReady={accountsReady}
          onSaved={handlePortfolioChanged}
        />
      </AccountDataFrame>
    );
  }

  if (allAccountsSelected) {
    return (
      <AccountDataAllAccountsView
        accounts={accounts}
        accountId={accountId}
        mode={mode}
        onSelectAccount={selectAccount}
      />
    );
  }

  if (!selectedAccount) return <AccountDataLoading />;

  const activeTab = isCashAccount ? 'cash' : tab;

  return (
    <AccountDataFrame>
      <PageHeader
        className="mb-0"
        eyebrow="ACCOUNT DATA"
        title="账户数据"
        description={
          isCashAccount
            ? '管理现金入账、账户划转和定期入账。'
            : '录入真实成交，管理持仓与现金快照。'
        }
      />

      <AccountDataAccountSelector
        accounts={accounts}
        accountId={accountId}
        onSelectAccount={selectAccount}
        onManageAccounts={openAccountManager}
      />

      <Tabs value={activeTab} onValueChange={(value) => void selectTab(value as AccountDataTab)}>
        <TabsList variant="line">
          {!isCashAccount && <TabsTrigger value="positions">持仓</TabsTrigger>}
          {!isCashAccount && <TabsTrigger value="transactions">成交记录</TabsTrigger>}
          <TabsTrigger value="cash">现金</TabsTrigger>
        </TabsList>
        {!isCashAccount && (
          <>
            <TabsContent value="transactions" className="mt-0 pt-3">
              <TransactionSection
                account={selectedAccount}
                events={events}
                query={ledgerEventsQuery}
                filter={transactionFilter}
                onFilterChange={setTransactionFilter}
                onCreate={openCreateExecution}
                onCorrect={(event) => {
                  void openCorrectExecution(event);
                }}
                onVoid={openVoidExecution}
                onCorrectTransfer={(event) => setCashTransferAction({ event, mode: 'replace' })}
                onVoidTransfer={(event) => setCashTransferAction({ event, mode: 'void' })}
                onAudit={openAudit}
                findSnapshotPosition={findSnapshotPosition}
                onEditSnapshot={openSnapshotEditor}
                onRemoveSnapshot={(event) => void removeSnapshot(event)}
                onOpenImport={() => {
                  void openImport();
                }}
                onOpenReconciliation={() => setReconciliationOpen(true)}
              />
            </TabsContent>
            <TabsContent value="positions" className="mt-0 pt-3">
              <PositionCalibrationSection
                key={selectedAccount.id}
                account={selectedAccount}
                accounts={accounts}
                positions={accountPositions}
                cashValue={cashValue}
                valuationQuery={valuationQuery}
                onDirtyChange={setDraftDirty}
                onSaved={handlePortfolioChanged}
                entrySheetOpen={positionSheetOpen}
                onEntrySheetOpenChange={(open) => {
                  setPositionSheetOpen(open);
                  if (!open) setPositionSheetEditing(null);
                }}
                editingPosition={positionSheetEditing}
                onEditingPositionChange={setPositionSheetEditing}
                onOpenImport={() => {
                  void openImport();
                }}
                onOpenReconciliation={() => setReconciliationOpen(true)}
              />
            </TabsContent>
          </>
        )}
        <TabsContent value="cash" className="mt-0 pt-3">
          <CashSection
            account={selectedAccount}
            accounts={accounts}
            valuation={valuationQuery.data}
            valuationQuery={valuationQuery}
            events={events}
            eventsQuery={ledgerEventsQuery}
            onCalibrate={() => setCashObservationOpen(true)}
          />
        </TabsContent>
      </Tabs>

      <ExecutionFormSheet
        account={selectedAccount}
        open={executionOpen && !isCashAccount}
        editingEvent={editingEvent}
        ledgerRevision={currentLedgerRevision}
        onOpenChange={(open, options) => {
          void closeExecution(open, options);
        }}
        onDirtyChange={setDraftDirty}
      />
      <AuditSheet
        target={auditEvent}
        query={auditQuery}
        snapshotPositions={accountPositions}
        onOpenChange={(open) => {
          if (!open) setAuditEvent(null);
        }}
        onEditSnapshot={openSnapshotEditor}
        onRemoveSnapshot={(event) => void removeSnapshot(event)}
        onCorrect={(event) => {
          void openCorrectExecution(event);
        }}
        onVoid={openVoidExecution}
        onRestore={(event, source) => setRestoreEvent({ event, source })}
        onRestoreTransfer={(_event, source) =>
          setCashTransferAction({ event: source, mode: 'restore' })
        }
      />
      <CorrectionReasonSheet
        account={selectedAccount}
        action="void"
        target={voidEvent}
        ledgerRevision={currentLedgerRevision}
        onOpenChange={(open) => {
          if (!open) setVoidEvent(null);
        }}
      />
      {restoreEvent && (
        <CorrectionReasonSheet
          account={selectedAccount}
          action="restore"
          target={restoreEvent.event}
          restoreSource={restoreEvent.source}
          ledgerRevision={currentLedgerRevision}
          onOpenChange={(open) => {
            if (!open) setRestoreEvent(null);
          }}
        />
      )}
      <ReconciliationSheet
        account={selectedAccount}
        open={reconciliationOpen}
        query={reconciliationQuery}
        ledgerRevision={currentLedgerRevision}
        onOpenChange={setReconciliationOpen}
      />
      <CashObservationSheet
        account={selectedAccount}
        open={cashObservationOpen}
        onOpenChange={setCashObservationOpen}
        onSaved={handlePortfolioChanged}
      />
      {cashTransferAction && (
        <CashTransferCorrectionSheet
          key={`${cashTransferAction.mode}:${cashTransferAction.event.eventId}`}
          event={cashTransferAction.event}
          mode={cashTransferAction.mode}
          open
          onOpenChange={(open) => {
            if (!open) setCashTransferAction(null);
          }}
          {...(cashTransferAction.mode === 'void'
            ? { onSaved: () => setAuditEvent(cashTransferAction.event) }
            : {})}
        />
      )}
      <Sheet
        open={importOpen && !isCashAccount}
        onOpenChange={(open) => {
          void closeImport(open);
        }}
      >
        <SheetContent side="right" size="detail" className="h-[100dvh] overflow-auto p-6">
          <SheetHeader>
            <SheetTitle>持仓快照导入草稿</SheetTitle>
            <SheetDescription>
              上传只创建可审阅草稿；原始证据、来源行、重复和冲突状态会保留，提交前不会写入持仓。
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0">
            <ScreenshotImportReview
              accounts={accounts}
              initialAccountId={selectedAccount.id}
              accountLocked
              embedded
              onDirtyChange={setDraftDirty}
              onPortfolioChanged={handlePortfolioChanged}
            />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet
        open={accountManagerOpen}
        onOpenChange={(open) => {
          void handleAccountManagerOpenChange(open);
        }}
      >
        <SheetContent
          side="right"
          aria-describedby="account-manager-description"
          size="form"
          className="h-[100dvh] min-h-0 overflow-hidden p-6"
        >
          <PortfolioManagement
            accounts={accounts}
            positions={[]}
            step="account"
            accountsReady={accountsReady}
            accountFormInline
            accountManagerOpen={accountManagerOpen}
            onDirtyChange={setDraftDirty}
            onAccountEntry={(nextAccountId) => {
              void selectManagedAccount(nextAccountId);
            }}
            onSaved={handlePortfolioChanged}
          />
        </SheetContent>
      </Sheet>
    </AccountDataFrame>
  );
}
