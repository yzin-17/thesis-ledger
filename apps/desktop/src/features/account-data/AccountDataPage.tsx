import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { LedgerEventV2 } from '@thesis-ledger/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import type { Account, PortfolioMode } from '../portfolio/portfolio.types.js';
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
import { ExecutionFormSheet } from './AccountDataExecutionSheet.js';
import { AuditSheet, CorrectionReasonSheet } from './AccountDataAuditSheets.js';
import { ReconciliationSheet } from './AccountDataReconciliationSheet.js';
import { CashObservationSheet } from './AccountDataCashObservationSheet.js';
import type { AccountDataTab, ExecutionEvent, VoidEvent } from './account-data.types.js';

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
  const [accountManagerOpen, setAccountManagerOpen] = useState(params.get('setup') === '1');
  const [draftDirty, setDraftDirty] = useState(false);
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

  const confirmDiscard = () =>
    !draftDirty || window.confirm('当前有未保存修改，切换后会丢弃，继续吗？');

  const selectAccount = (nextAccountId: string) => {
    if (!nextAccountId || nextAccountId === accountId || !confirmDiscard()) return;
    setDraftDirty(false);
    setExecutionOpen(false);
    setEditingEvent(null);
    setAuditEvent(null);
    setVoidEvent(null);
    setRestoreEvent(null);
    setImportOpen(false);
    setReconciliationOpen(false);
    setCashObservationOpen(false);
    setAccountId(nextAccountId);
    try {
      window.sessionStorage.setItem('thesis-ledger-last-account', nextAccountId);
    } catch {
      /* sessionStorage is optional */
    }
    updateLocation({ accountId: nextAccountId, entry: null });
  };

  const selectTab = (nextTab: AccountDataTab) => {
    if (nextTab === tab) return;
    if (!confirmDiscard()) return;
    setDraftDirty(false);
    setTab(nextTab);
    setExecutionOpen(false);
    setEditingEvent(null);
    setImportOpen(false);
    setReconciliationOpen(false);
    setCashObservationOpen(false);
    updateLocation({ tab: nextTab, entry: null });
  };

  const openCreateExecution = () => {
    if (!selectedAccount || selectedAccount.type === 'cash') return;
    setEditingEvent(null);
    setExecutionOpen(true);
    setTab('transactions');
    updateLocation({ tab: 'transactions', entry: 'execution' });
  };

  const openCorrectExecution = (event: ExecutionEvent) => {
    if (!confirmDiscard()) return;
    setAuditEvent(null);
    setEditingEvent(event);
    setExecutionOpen(true);
    setTab('transactions');
    updateLocation({ tab: 'transactions', entry: 'execution' });
  };

  const closeExecution = (open: boolean) => {
    if (open) {
      setExecutionOpen(true);
      return;
    }
    if (!confirmDiscard()) return;
    setDraftDirty(false);
    setEditingEvent(null);
    setExecutionOpen(false);
    updateLocation({ entry: null });
  };

  const openImport = () => {
    if (!selectedAccount || selectedAccount.type === 'cash' || !confirmDiscard()) return;
    setDraftDirty(false);
    setImportOpen(true);
    updateLocation({ tab: 'positions', entry: 'screenshot' });
  };

  const closeImport = (open: boolean) => {
    if (open) {
      setImportOpen(true);
      return;
    }
    if (!confirmDiscard()) return;
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
          <p className="m-0 text-sm font-medium text-muted-foreground">Account Data</p>
          <h1 className="m-0 text-3xl font-semibold tracking-tight">账户数据</h1>
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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="m-0 text-sm font-medium text-muted-foreground">Account Data</p>
          <h1 className="m-0 mt-1 text-3xl font-semibold tracking-tight">账户数据</h1>
          <p className="m-0 mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            真实成交是主录入入口；持仓和现金只记录观察检查点，不会伪造成交。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" data-selected-account-id={selectedAccount?.id}>
            {selectedAccount?.mode === 'shadow' ? '模拟账户' : '实际账户'}
          </Badge>
          <Button type="button" variant="outline" onClick={() => setAccountManagerOpen(true)}>
            管理账户
          </Button>
        </div>
      </div>

      <Card className="shadow-none">
        <CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(240px,1.3fr)_minmax(240px,1fr)] md:items-end">
          <Field>
            <FieldLabel htmlFor="account-data-account">当前账户</FieldLabel>
            <Select
              value={accountId || null}
              onValueChange={(value) => {
                if (value) selectAccount(value);
              }}
            >
              <SelectTrigger id="account-data-account" className="w-full">
                <SelectValue placeholder="选择账户">
                  {selectedAccount?.name ?? '选择账户'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {account.institution || '未填写机构'} · {account.currency} ·{' '}
                      {account.mode === 'shadow' ? '模拟' : '实际'}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {selectedAccount?.institution || '未填写机构'} · 本位币 {selectedAccount?.currency}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>账本模式</FieldLabel>
            <ToggleGroup
              value={selectedAccount ? [selectedAccount.mode] : []}
              aria-label="账户数据账本模式"
              className="w-full"
              onValueChange={(value) => {
                const nextMode = value[0] as PortfolioMode | undefined;
                if (!nextMode || nextMode === selectedAccount?.mode) return;
                const nextAccount = accounts.find((account) => account.mode === nextMode);
                if (nextAccount) selectAccount(nextAccount.id);
              }}
            >
              <ToggleGroupItem
                value="actual"
                className="flex-1"
                disabled={!accounts.some((account) => account.mode === 'actual')}
              >
                实际账户
              </ToggleGroupItem>
              <ToggleGroupItem
                value="shadow"
                className="flex-1"
                disabled={!accounts.some((account) => account.mode === 'shadow')}
              >
                模拟账户
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {selectedAccount?.mode === 'shadow'
                ? '本页提交会记录为模拟成交。'
                : '本页提交会记录为实际成交。'}
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(value) => selectTab(value as AccountDataTab)}>
        <TabsList variant="line" className="grid w-full grid-cols-3">
          <TabsTrigger value="positions">持仓</TabsTrigger>
          <TabsTrigger value="transactions">成交记录</TabsTrigger>
          <TabsTrigger value="cash">现金</TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="mt-0 pt-5">
          <TransactionSection
            account={selectedAccount}
            events={events}
            query={ledgerEventsQuery}
            filter={transactionFilter}
            onFilterChange={setTransactionFilter}
            onCreate={openCreateExecution}
            onCorrect={openCorrectExecution}
            onVoid={openVoidExecution}
            onAudit={openAudit}
            onOpenImport={openImport}
            onOpenReconciliation={() => setReconciliationOpen(true)}
          />
        </TabsContent>
        <TabsContent value="positions" className="mt-0 pt-5">
          <PositionCalibrationSection
            key={selectedAccount.id}
            account={selectedAccount}
            accounts={accounts}
            positions={accountPositions}
            cashValue={cashValue}
            valuationQuery={valuationQuery}
            onDirtyChange={setDraftDirty}
            onSaved={onPortfolioChanged}
            onOpenImport={openImport}
            onOpenReconciliation={() => setReconciliationOpen(true)}
          />
        </TabsContent>
        <TabsContent value="cash" className="mt-0 pt-5">
          <CashSection
            account={selectedAccount}
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
        onOpenChange={closeExecution}
        onDirtyChange={setDraftDirty}
      />
      <AuditSheet
        target={auditEvent}
        query={auditQuery}
        onOpenChange={(open) => {
          if (!open) setAuditEvent(null);
        }}
        onCorrect={openCorrectExecution}
        onVoid={openVoidExecution}
        onRestore={(event, source) => setRestoreEvent({ event, source })}
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
      <Sheet open={importOpen} onOpenChange={closeImport}>
        <SheetContent
          side="right"
          className="h-[100dvh] w-[900px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
        >
          <SheetTitle>ImportDraft：持仓快照</SheetTitle>
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
          setAccountManagerOpen(open);
          if (!open) updateLocation({ setup: null });
        }}
      >
        <SheetContent
          side="right"
          className="h-[100dvh] w-[720px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
        >
          <SheetTitle>账户设置</SheetTitle>
          <SheetDescription>账户是成交、持仓观察和现金观察的容器。</SheetDescription>
          <PortfolioManagement
            accounts={accounts}
            positions={[]}
            step="account"
            accountsReady={accountsReady}
            onAccountEntry={(nextAccountId) => {
              selectAccount(nextAccountId);
              setAccountManagerOpen(false);
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
    <section className="module-page flex flex-col gap-6" data-account-data-page>
      {children}
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
