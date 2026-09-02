import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { LedgerEventV2 } from '@thesis-ledger/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { Account } from '../portfolio/portfolio.types.js';
import { useAccountValuationQuery } from '../portfolio/portfolio.queries.js';
import { PortfolioManagement } from '../portfolio/PortfolioManagement.js';
import { ScreenshotImportReview } from '../import/ScreenshotImportReview.js';
import {
  useAccountLedgerAuditQuery,
  useAccountLedgerEventsQuery,
  useReconciliationCandidatesQuery,
  type AccountDataEventFilter,
} from './account-data.queries.js';
import { readLastAccount } from './account-data.helpers.js';
import {
  CashSection,
  PositionCalibrationSection,
  TransactionSection,
} from './AccountDataSections.js';
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

function accountDisplayLabel(account: Account) {
  const modeLabel = account.mode === 'shadow' ? '模拟' : '实际';
  const institutionLabel =
    account.institution && account.institution !== account.name ? ` · ${account.institution}` : '';
  return `${account.name}${institutionLabel} · ${account.currency} · ${modeLabel}`;
}

export function AccountDataPage({
  accounts,
  accountsReady = true,
  accountsPending = false,
  accountsError = false,
  onRetryAccounts,
  onPortfolioChanged,
}: {
  accounts: Account[];
  accountsReady?: boolean;
  accountsPending?: boolean;
  accountsError?: boolean;
  onRetryAccounts?: () => void;
  onPortfolioChanged: () => void;
}) {
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
  const [transactionFilter, setTransactionFilter] = useState<AccountDataEventFilter>('executions');
  const [executionOpen, setExecutionOpen] = useState(entryRequested === 'execution');
  const [editingEvent, setEditingEvent] = useState<ExecutionEvent | null>(null);
  const [auditEvent, setAuditEvent] = useState<LedgerEventV2 | null>(null);
  const [voidEvent, setVoidEvent] = useState<ExecutionEvent | null>(null);
  const [restoreEvent, setRestoreEvent] = useState<{
    event: VoidEvent;
    source: ExecutionEvent;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(entryRequested === 'screenshot');
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [cashObservationOpen, setCashObservationOpen] = useState(false);
  const [cashTransferAction, setCashTransferAction] = useState<{
    event: CashTransferEvent;
    mode: 'replace' | 'void' | 'restore';
  } | null>(null);
  const [accountManagerOpen, setAccountManagerOpen] = useState(params.get('setup') === '1');
  const [draftDirty, setDraftDirty] = useState(false);
  const { confirm } = useConfirmDialog();
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const valuationQuery = useAccountValuationQuery(
    accountId,
    selectedAccount?.mode,
    Boolean(selectedAccount),
  );
  const ledgerEventsQuery = useAccountLedgerEventsQuery(
    accountId,
    selectedAccount?.mode,
    transactionFilter,
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

  useEffect(() => {
    if (requestedAccountId && accounts.some((account) => account.id === requestedAccountId)) {
      setAccountId(requestedAccountId);
      return;
    }
    if (accountId && accounts.some((account) => account.id === accountId)) return;
    if (accounts[0]) {
      setAccountId(accounts[0].id);
      try {
        window.sessionStorage.setItem('thesis-ledger-last-account', accounts[0].id);
      } catch {
        /* sessionStorage is optional */
      }
    }
  }, [accountId, accounts, requestedAccountId]);

  useEffect(() => {
    if (entryRequested === 'screenshot' && selectedAccount?.type !== 'cash') setImportOpen(true);
  }, [entryRequested, selectedAccount?.type]);

  const updateLocation = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const search = next.toString();
    void navigate({ pathname: '/accounts', ...(search ? { search: `?${search}` } : {}) });
  };

  const confirmDiscard = async () => {
    if (!draftDirty) return true;
    return confirm({
      title: '放弃未保存修改？',
      description: '当前有未保存修改，切换后会丢弃，继续吗？',
      confirmLabel: '放弃修改',
      cancelLabel: '继续编辑',
      variant: 'destructive',
    });
  };

  const selectAccount = async (
    nextAccountId: string,
    extraLocationUpdates: Record<string, string | null> = {},
  ) => {
    if (!nextAccountId || nextAccountId === accountId) return true;
    if (!(await confirmDiscard())) return false;
    setDraftDirty(false);
    setExecutionOpen(false);
    setEditingEvent(null);
    setAuditEvent(null);
    setVoidEvent(null);
    setRestoreEvent(null);
    setImportOpen(false);
    setReconciliationOpen(false);
    setCashObservationOpen(false);
    setCashTransferAction(null);
    setAccountId(nextAccountId);
    try {
      window.sessionStorage.setItem('thesis-ledger-last-account', nextAccountId);
    } catch {
      /* sessionStorage is optional */
    }
    updateLocation({ accountId: nextAccountId, entry: null, ...extraLocationUpdates });
    return true;
  };

  const selectTab = async (nextTab: AccountDataTab) => {
    if (nextTab === tab) return;
    if (!(await confirmDiscard())) return;
    setDraftDirty(false);
    setTab(nextTab);
    setExecutionOpen(false);
    setEditingEvent(null);
    setImportOpen(false);
    setReconciliationOpen(false);
    setCashObservationOpen(false);
    setCashTransferAction(null);
    updateLocation({ tab: nextTab, entry: null });
  };

  const openCreateExecution = () => {
    if (!selectedAccount || selectedAccount.type === 'cash') return;
    setEditingEvent(null);
    setExecutionOpen(true);
    setTab('transactions');
    updateLocation({ tab: 'transactions', entry: 'execution' });
  };

  const openCorrectExecution = async (event: ExecutionEvent) => {
    if (!(await confirmDiscard())) return;
    setAuditEvent(null);
    setEditingEvent(event);
    setExecutionOpen(true);
    setTab('transactions');
    updateLocation({ tab: 'transactions', entry: 'execution' });
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

  const closeAccountManager = async (open: boolean) => {
    if (open) {
      setAccountManagerOpen(true);
      return;
    }
    if (!(await confirmDiscard())) return;
    setDraftDirty(false);
    setAccountManagerOpen(false);
    updateLocation({ setup: null });
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

  if (accountsPending && accounts.length === 0) {
    return <AccountDataLoading />;
  }

  if (accountsError && accounts.length === 0) {
    return (
      <AccountDataFrame>
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
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-3xl font-semibold tracking-tight">资产录入</h1>
          <p className="m-0 max-w-2xl text-sm leading-6 text-muted-foreground">
            先创建一个账户，再录入真实成交或记录持仓观察。
          </p>
        </div>
        <PortfolioManagement
          accounts={accounts}
          positions={[]}
          step="account"
          accountsReady={accountsReady}
          onSaved={onPortfolioChanged}
        />
      </AccountDataFrame>
    );
  }

  if (!selectedAccount) return <AccountDataLoading />;

  return (
    <AccountDataFrame>
      <div className="min-w-0">
        <h1 className="m-0 text-3xl font-semibold tracking-tight">资产录入</h1>
        <p className="m-0 mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          真实成交是主录入入口；持仓和现金只记录快照基准，不会伪造成交。
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Field className="min-w-0 flex-1 sm:flex-row sm:items-center sm:gap-3">
          <FieldLabel htmlFor="account-data-account" className="shrink-0 whitespace-nowrap">
            当前账户
          </FieldLabel>
          <Select
            value={accountId || null}
            onValueChange={(value) => {
              if (value) void selectAccount(value);
            }}
          >
            <SelectTrigger id="account-data-account" className="w-full">
              <SelectValue placeholder="选择账户">
                {selectedAccount ? accountDisplayLabel(selectedAccount) : '选择账户'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {accountDisplayLabel(account)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex shrink-0">
          <Button type="button" variant="outline" onClick={() => setAccountManagerOpen(true)}>
            管理账户
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => void selectTab(value as AccountDataTab)}>
        <TabsList variant="line" className="min-h-11 w-fit">
          <TabsTrigger value="positions">持仓</TabsTrigger>
          <TabsTrigger value="transactions">成交记录</TabsTrigger>
          <TabsTrigger value="cash">现金</TabsTrigger>
        </TabsList>
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
            onSaved={onPortfolioChanged}
            onOpenImport={() => {
              void openImport();
            }}
            onOpenReconciliation={() => setReconciliationOpen(true)}
          />
        </TabsContent>
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
        open={executionOpen}
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
        onOpenChange={(open) => {
          if (!open) setAuditEvent(null);
        }}
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
        onSaved={onPortfolioChanged}
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
        open={importOpen}
        onOpenChange={(open) => {
          void closeImport(open);
        }}
      >
        <SheetContent
          side="right"
          className="h-[100dvh] w-[900px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
        >
          <SheetTitle>持仓快照导入草稿</SheetTitle>
          <SheetDescription>
            上传只创建可审阅草稿；原始证据、来源行、重复和冲突状态会保留，提交前不会写入持仓。
          </SheetDescription>
          <div className="mt-4 min-h-0">
            <ScreenshotImportReview
              accounts={accounts}
              initialAccountId={selectedAccount.id}
              accountLocked
              embedded
              onDirtyChange={setDraftDirty}
              onPortfolioChanged={onPortfolioChanged}
            />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet
        open={accountManagerOpen}
        onOpenChange={(open) => {
          void closeAccountManager(open);
        }}
      >
        <SheetContent
          side="right"
          aria-describedby="account-manager-description"
          className="h-[100dvh] min-h-0 w-[720px] max-w-[calc(100%-16px)] overflow-hidden p-6 sm:max-w-[calc(100%-16px)]"
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
              void (async () => {
                if (await selectAccount(nextAccountId, { setup: null })) {
                  setAccountManagerOpen(false);
                }
              })();
            }}
            onSaved={onPortfolioChanged}
          />
        </SheetContent>
      </Sheet>
    </AccountDataFrame>
  );
}

function AccountDataFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="module-page" data-account-data-page>
      <div className="flex w-full max-w-7xl flex-col gap-6">{children}</div>
    </section>
  );
}

function AccountDataLoading() {
  return (
    <AccountDataFrame>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-96 w-full" />
    </AccountDataFrame>
  );
}
