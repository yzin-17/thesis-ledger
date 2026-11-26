import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '../shared/PageHeader.js';
import { useAccountDataWorkspace, type AccountDataPageProps } from './useAccountDataWorkspace.js';

import { ImportDraftReviewSheet } from '../import/ImportDraftReviewSheet.js';
import { PortfolioManagement } from '../portfolio/PortfolioManagement.js';
import { canManageFundInvestments } from './account-data.fund-investment.display.js';
import type { AccountDataTab } from './account-data.types.js';
import { AccountDataAccountSelector } from './AccountDataAccountSelector.js';
import { AuditSheet, CorrectionReasonSheet } from './AccountDataAuditSheets.js';
import { CashObservationSheet } from './AccountDataCashObservationSheet.js';
import { CashSection } from './AccountDataCashSections.js';
import { CashTransferCorrectionSheet } from './AccountDataCashTransferCorrectionSheet.js';
import { ExecutionFormSheet } from './AccountDataExecutionSheet.js';
import { AccountDataFrame, AccountDataLoading } from './AccountDataLayout.js';
import { ReconciliationSheet } from './AccountDataReconciliationSheet.js';
import { RecurringFundInvestments } from './AccountDataRecurringFundInvestments.js';
import { PositionCalibrationSection, TransactionSection } from './AccountDataSections.js';

export {
  accountSelectionTransition,
  resolveAccountSelection,
  shouldDeferAccountSelection,
} from './account-data.selection.js';

export function AccountDataPage(props: AccountDataPageProps) {
  return <AccountDataPageContent key={props.mode ?? 'actual'} {...props} />;
}

function AccountDataPageContent(props: AccountDataPageProps) {
  const control = useAccountDataWorkspace(props);
  const {
    refreshAction,
    modeAccounts,
    accountId,
    selectAccount,
    openAccountManager,
    isCashAccount,
    selectedAccount,
    ledgerEventsQuery,
    openCorrectExecution,
    openVoidExecution,
    setCashTransferAction,
    openSnapshotEditor,
    removeSnapshot,
    resolveInstrumentName,
    setReconciliationOpen,
    accountPositions,
    setDraftDirty,
    setAccountManagerBusy,
    refreshPortfolio,
    setCashObservationOpen,
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
  } = control;
  if (accountsPending && modeAccounts.length === 0) return <AccountDataLoading />;
  if (accountsError && modeAccounts.length === 0)
    return (
      <AccountDataFrame>
        <PageHeader eyebrow="ACCOUNT DATA" title="账户数据" actions={refreshAction} />
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
  if (modeAccounts.length === 0)
    return (
      <AccountDataFrame>
        <PageHeader eyebrow="ACCOUNT DATA" title="账户数据" actions={refreshAction} />
        {accounts.length > 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            当前模式暂无账户。
          </p>
        )}
        <PortfolioManagement
          accounts={accounts}
          positions={[]}
          step="account"
          accountsReady={accountsReady}
          onSaved={handlePortfolioChanged}
        />
      </AccountDataFrame>
    );
  if (!selectedAccount) return <AccountDataLoading />;
  return (
    <AccountDataFrame>
      <PageHeader eyebrow="ACCOUNT DATA" title="账户数据" actions={refreshAction} />

      <AccountDataAccountSelector
        accounts={modeAccounts}
        accountId={accountId}
        onSelectAccount={selectAccount}
        onManageAccounts={openAccountManager}
      />

      <AccountDataTabs control={control} selectedAccount={selectedAccount} />

      <ExecutionFormSheet
        account={selectedAccount}
        open={executionOpen && !isCashAccount}
        editingEvent={editingEvent}
        resolveInstrumentName={resolveInstrumentName}
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
        onSaved={setAuditEvent}
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
        ledgerReady={ledgerReady}
        onOpenChange={setReconciliationOpen}
      />
      <CashObservationSheet
        account={selectedAccount}
        open={cashObservationOpen}
        onOpenChange={setCashObservationOpen}
        onSaved={refreshPortfolio}
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
      <ImportDraftReviewSheet
        open={importOpen && !isCashAccount}
        accountId={selectedAccount.id}
        ledgerRevision={currentLedgerRevision}
        ledgerReady={ledgerReady}
        onDirtyChange={setDraftDirty}
        onBusyChange={setAccountManagerBusy}
        onPortfolioChanged={handlePortfolioChanged}
        onReadLedger={async () => {
          const result = await ledgerEventsQuery.refetch();
          if (result.isError) throw result.error;
        }}
        onOpenChange={(open) => {
          void closeImport(open);
        }}
      />
      <Sheet
        open={accountManagerOpen}
        onOpenChange={(open) => {
          void handleAccountManagerOpenChange(open);
        }}
      >
        <SheetContent side="right" size="form" className="h-[100dvh] min-h-0 overflow-hidden p-6">
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
            onBusyChange={setAccountManagerBusy}
            onSaved={handlePortfolioChanged}
          />
        </SheetContent>
      </Sheet>
    </AccountDataFrame>
  );
}

function AccountDataTabs({
  control,
  selectedAccount,
}: {
  control: ReturnType<typeof useAccountDataWorkspace>;
  selectedAccount: NonNullable<ReturnType<typeof useAccountDataWorkspace>['selectedAccount']>;
}) {
  return (
    <>
      <Tabs
        value={control.activeTab}
        onValueChange={(value) => void control.selectTab(value as AccountDataTab)}
      >
        <TabsList variant="line">
          {!control.isCashAccount && <TabsTrigger value="positions">持仓</TabsTrigger>}
          {!control.isCashAccount && <TabsTrigger value="transactions">成交记录</TabsTrigger>}
          <TabsTrigger value="cash">现金</TabsTrigger>
          {canManageFundInvestments(selectedAccount) && (
            <TabsTrigger value="fund-investments">定投计划</TabsTrigger>
          )}
        </TabsList>
        {!control.isCashAccount && (
          <>
            <TabsContent value="transactions">
              <TransactionSection
                account={selectedAccount}
                events={control.events}
                query={control.ledgerEventsQuery}
                filter={control.transactionFilter}
                onFilterChange={control.setTransactionFilter}
                onCreate={control.openCreateExecution}
                onCorrect={(event) => {
                  void control.openCorrectExecution(event);
                }}
                onVoid={control.openVoidExecution}
                onCorrectTransfer={(event) =>
                  control.setCashTransferAction({ event, mode: 'replace' })
                }
                onVoidTransfer={(event) => control.setCashTransferAction({ event, mode: 'void' })}
                onAudit={control.openAudit}
                findSnapshotPosition={control.findSnapshotPosition}
                onEditSnapshot={control.openSnapshotEditor}
                onRemoveSnapshot={(event) => void control.removeSnapshot(event)}
                resolveInstrumentName={control.resolveInstrumentName}
                onOpenImport={() => {
                  void control.openImport();
                }}
                onOpenReconciliation={() => control.setReconciliationOpen(true)}
                onOpenFundInvestment={
                  canManageFundInvestments(selectedAccount)
                    ? (occurrenceId) =>
                        control.navigateToTab('fund-investments', null, {
                          fundOccurrence: occurrenceId,
                        })
                    : undefined
                }
              />
            </TabsContent>
            <TabsContent value="positions">
              <PositionCalibrationSection
                key={selectedAccount.id}
                account={selectedAccount}
                accounts={control.modeAccounts}
                positions={control.accountPositions}
                cashValue={control.cashValue}
                valuationQuery={control.valuationQuery}
                onDirtyChange={control.setDraftDirty}
                onBusyChange={control.setAccountManagerBusy}
                onSaved={control.refreshPortfolio}
                entrySheetOpen={control.positionSheetOpen}
                onEntrySheetOpenChange={(open) => {
                  control.setPositionSheetOpen(open);
                  if (!open) control.setPositionSheetEditing(null);
                }}
                editingPosition={control.positionSheetEditing}
                onEditingPositionChange={control.setPositionSheetEditing}
                resolveInstrumentName={control.resolveInstrumentName}
                onOpenImport={() => {
                  void control.openImport();
                }}
                onOpenReconciliation={() => control.setReconciliationOpen(true)}
              />
            </TabsContent>
          </>
        )}
        <TabsContent value="cash">
          <CashSection
            account={selectedAccount}
            accounts={control.modeAccounts}
            valuation={control.valuationQuery.data}
            valuationQuery={control.valuationQuery}
            events={control.events}
            eventsQuery={control.ledgerEventsQuery}
            onCalibrate={() => control.setCashObservationOpen(true)}
            resolveInstrumentName={control.resolveInstrumentName}
          />
        </TabsContent>
        {canManageFundInvestments(selectedAccount) && (
          <TabsContent value="fund-investments">
            <RecurringFundInvestments
              key={selectedAccount.id}
              account={selectedAccount}
              focusOccurrenceId={control.fundOccurrenceId}
            />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
