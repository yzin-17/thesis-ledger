import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AuditSheet,
  CorrectionReasonSheet,
} from '../src/features/account-data/AccountDataAuditSheets.js';
import { ReconciliationSheet } from '../src/features/account-data/AccountDataReconciliationSheet.js';
import { CashTransferCorrectionSheet } from '../src/features/account-data/AccountDataCashTransferCorrectionSheet.js';
import { ExecutionFormSheet } from '../src/features/account-data/AccountDataExecutionSheet.js';
import { RecurringCashDeposits } from '../src/features/account-data/AccountDataRecurringCashDeposits.js';
import { cashDepositKeys } from '../src/features/account-data/account-data.cash.queries.js';
import { AccountDataPage } from '../src/features/account-data/AccountDataPage.js';
import { PortfolioManagement } from '../src/features/portfolio/PortfolioManagement.js';
import { portfolioKeys } from '../src/features/portfolio/portfolio.queries.js';
import { accountDataKeys } from '../src/features/account-data/account-data.queries.js';
import { PortfolioTradeOpeningBoundarySheet } from '../src/features/portfolio/PortfolioTradeOpeningBoundarySheet.js';
import {
  drawerAccount as account,
  drawerPosition as position,
  drawerEvent as event,
  drawerAudit as audit,
  drawerTransfer as transfer,
  drawerQuery as query,
  drawerCandidate as candidate,
  drawerJournalInput,
  drawerVoid,
} from './browser-drawer-samples.js';

export function DrawerAccountCases({ scenario }: { scenario: string }) {
  const [open, setOpen] = useState(true);
  const qc = useQueryClient();
  useState(() => {
    const plan = {
      id: 'cash-plan',
      accountId: account.id,
      name: '隔离固定入账',
      expectedAmount: '1000',
      currency: 'CNY',
      dayOfMonth: 10,
      startPeriod: '2026-11',
      timezone: 'Asia/Shanghai',
      status: 'ACTIVE',
      version: 1,
    };
    qc.setQueryData(cashDepositKeys.plans(account.id), [plan]);
    qc.setQueryData(cashDepositKeys.occurrences(account.id), [
      {
        ...plan,
        id: 'cash-occurrence',
        planId: plan.id,
        planName: plan.name,
        periodKey: '2026-11',
        scheduledFor: '2026-11-06T00:00:00Z',
        status: 'PENDING',
      },
    ]);
    qc.setQueryData(portfolioKeys.accounts(), [account]);
    if (scenario.startsWith('account-manager'))
      qc.setQueryData(portfolioKeys.valuation('actual', account.id), {
        mode: 'actual', totalMarketValue: 430, totalCost: 412.3456789, totalPnl: 17.6543211,
        cashValue: 0, partial: false, valuedAt: '2026-11-14T08:00:00Z', positions: [position],
      });
    qc.setQueryData(
      portfolioKeys.managedAccounts(),
      scenario === 'account-manager-list'
        ? Array.from({ length: 12 }, (_, i) => ({
            ...account,
            id: i ? `fixture-account-${i}` : account.id,
            name: `隔离账户 ${i + 1}`,
          }))
        : [account],
    );
    for (const filter of ['all', 'other', 'executions'] as const)
      qc.setQueryData(accountDataKeys.events(account.id, 'actual', filter), {
        ...audit,
        ledgerRevision: '1',
        asOfLedgerRevision: '1',
      });
  });
  const props = { open, onOpenChange: setOpen };
  if (!open) return null;
  if (['audit', 'audit-error', 'reason-void', 'reason-restore'].includes(scenario))
    return <DrawerAuditCase scenario={scenario} setOpen={setOpen} />;
  if (scenario.startsWith('transfer-'))
    return (
      <CashTransferCorrectionSheet
        mode={scenario.slice(9) as 'replace'}
        event={transfer as never}
        {...props}
      />
    );
  if (scenario.startsWith('execution-'))
    return (
      <ExecutionFormSheet
        account={account}
        {...props}
        editingEvent={scenario === 'execution-edit' ? event : null}
        ledgerRevision="1"
        onDirtyChange={() => {}}
        resolveInstrumentName={() => position.asset.name}
      />
    );
  if (scenario.startsWith('cash-plan-') || scenario.startsWith('cash-occurrence-'))
    return <RecurringCashDeposits account={{ ...account, type: 'cash' }} />;
  if (scenario === 'reconciliation')
    return (
      <ReconciliationSheet
        account={account}
        {...props}
        ledgerRevision="1"
        query={
          query({
            accountId: account.id,
            candidates: [candidate],
            batches: [],
            checkpoints: [],
            observedAt: '2026-10-01T00:00:00Z',
            ledgerRevision: '1',
          }) as never
        }
      />
    );
  if (scenario === 'opening-boundary')
    return (
      <PortfolioTradeOpeningBoundarySheet
        detail={
          { ...drawerJournalInput.trade, earliestEvidenceAt: '2026-01-02T00:00:00Z' } as never
        }
        {...props}
      />
    );
  if (scenario.startsWith('account-manager'))
    return <main className="content"><AccountDataPage accounts={[account]} /></main>;
  if (scenario.startsWith('portfolio-'))
    return (
      <PortfolioManagement
        accounts={[account]}
        positions={[position]}
        step={scenario.startsWith('portfolio-account') ? 'account' : 'position'}
        defaultAccountId={account.id}
        {...(scenario === 'portfolio-cash'
          ? {}
          : { entrySheetOpen: !scenario.startsWith('portfolio-account') && open })}
        editingPosition={scenario === 'portfolio-position-edit' ? position : null}
        onEntrySheetOpenChange={setOpen}
        accountsReady
        onSaved={() => {}}
      />
    );
  return null;
}

function DrawerAuditCase({
  scenario,
  setOpen,
}: {
  scenario: string;
  setOpen: (value: boolean) => void;
}) {
  if (scenario === 'audit' || scenario === 'audit-error')
    return (
      <AuditSheet
        target={event}
        query={query(audit, scenario.endsWith('error')) as never}
        onOpenChange={setOpen}
        onCorrect={() => {}}
        onVoid={() => {}}
        onRestore={() => {}}
        onRestoreTransfer={() => {}}
      />
    );
  if (scenario === 'reason-void' || scenario === 'reason-restore')
    return (
      <CorrectionReasonSheet
        account={account}
        action={scenario === 'reason-void' ? 'void' : 'restore'}
        target={scenario === 'reason-void' ? event : drawerVoid}
        restoreSource={event}
        ledgerRevision="1"
        onOpenChange={setOpen}
      />
    );

  return null;
}
