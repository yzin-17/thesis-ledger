import { createMemoryRouter, RouterProvider } from 'react-router';
import { DrawerAccountCases } from './browser-drawer-account-cases.js';
import { DrawerContentCases } from './browser-drawer-content-cases.js';
import { DrawerSettingsCases } from './browser-drawer-settings-cases.js';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { ToastProvider } from '../src/components/ui/toast.js';
import { Button } from '../src/components/ui/button.js';
import { Input } from '../src/components/ui/input.js';
import { Textarea } from '../src/components/ui/textarea.js';
import { Field, FieldGroup, FieldLabel } from '../src/components/ui/field.js';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../src/components/ui/sheet.js';
import { RecurringFundInvestments } from '../src/features/account-data/AccountDataRecurringFundInvestments.js';
import { fundInvestmentKeys } from '../src/features/account-data/account-data.fund-investment.queries.js';
import { CashObservationSheet } from '../src/features/account-data/AccountDataCashObservationSheet.js';
import { CashDepositSheet } from '../src/features/account-data/AccountDataCashDepositSheet.js';
import { CashTransferSheet } from '../src/features/account-data/AccountDataCashTransferSheet.js';
import { EvidenceEditorSheet } from './fixtures/journal/EvidenceEditorSheet.js';
import { AdvancedJsonSheet } from './fixtures/journal/AdvancedJsonSheet.js';
import type { Account } from '../src/features/portfolio/portfolio.types.js';
import '../src/ui/styles.css';

const account: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '隔离验收基金账户',
  type: 'fund',
  mode: 'actual',
  currency: 'CNY',
};
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } },
});
const now = '2026-11-06T00:00:00Z';
const plan = {
  id: '22222222-2222-4222-8222-222222222222',
  accountId: account.id,
  name: '隔离样例计划',
  symbol: '000001.OF',
  fundName: '隔离样例基金',
  expectedAmount: '1000',
  currency: 'CNY',
  dayOfMonth: 10,
  startPeriod: '2026-11',
  timezone: 'Asia/Shanghai',
  status: 'ACTIVE',
  version: 1,
  nextDueAt: now,
  pausedAt: null,
  endedAt: null,
  createdAt: now,
  updatedAt: now,
};
client.setQueryData(fundInvestmentKeys.plans(account.id), [plan]);
client.setQueryData(fundInvestmentKeys.occurrences(account.id), [
  {
    ...plan,
    id: '33333333-3333-4333-8333-333333333333',
    planId: plan.id,
    planName: plan.name,
    periodKey: '2026-11',
    scheduledFor: now,
    status: 'PENDING',
    actualQuantity: null,
    unitPrice: null,
    commission: null,
    occurredAt: null,
    ledgerEventId: null,
    ledgerFactId: null,
    reason: null,
  },
]);

function Fixture() {
  const scenario = new URLSearchParams(location.search).get('case') ?? 'fund';
  const [open, setOpen] = useState(true);
  const [error, setError] = useState(false);
  const control = { open, onOpenChange: setOpen };
  if (scenario.startsWith('all-account:'))
    return <DrawerAccountCases scenario={scenario.slice(12)} />;
  if (scenario.startsWith('all-content:'))
    return <DrawerContentCases scenario={scenario.slice(12)} />;
  if (scenario.startsWith('all-settings:'))
    return <DrawerSettingsCases scenario={scenario.slice(13)} />;
  if (scenario === 'fund') return <RecurringFundInvestments account={account} />;
  if (scenario === 'observation')
    return <CashObservationSheet account={account} {...control} onSaved={() => {}} />;
  if (scenario === 'deposit') return <CashDepositSheet account={account} {...control} />;
  if (scenario === 'transfer')
    return (
      <CashTransferSheet
        account={account}
        accounts={[
          account,
          {
            ...account,
            id: '44444444-4444-4444-8444-444444444444',
            name: '隔离现金账户',
            type: 'cash',
          },
        ]}
        {...control}
      />
    );
  if (scenario === 'evidence')
    return (
      <EvidenceEditorSheet
        candidate={{ symbol: '000001.OF' }}
        value={{}}
        {...control}
        onSave={() => {}}
      />
    );
  if (scenario === 'json')
    return <AdvancedJsonSheet value={{}} mode="single" {...control} onApply={() => {}} />;
  return (
    <Sheet {...control}>
      <SheetContent
        side={scenario === 'bottom' ? 'bottom' : 'right'}
        size="compact"
        className={scenario === 'whole' ? undefined : 'overflow-hidden'}
      >
        <SheetHeader>
          <SheetTitle>共享布局长内容验收</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(true);
          }}
          className={
            scenario === 'whole' ? 'flex flex-col gap-6' : 'flex min-h-0 flex-1 flex-col gap-6'
          }
        >
          <SheetBody>
            <FieldGroup>
              {Array.from({ length: 20 }, (_, index) => (
                <Field key={index}>
                  <FieldLabel>验收字段 {index + 1}</FieldLabel>
                  <Input
                    aria-label={`验收字段 ${index + 1}`}
                    aria-invalid={error}
                    defaultValue="长内容与焦点"
                  />
                </Field>
              ))}
              <Textarea aria-label="末项备注" defaultValue="末项必须完整可达" />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {'隔离错误状态，输入保留。'.repeat(12)}
                </p>
              )}
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit">受控错误</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <ConfirmDialogProvider>
        <RouterProvider
          router={createMemoryRouter(
            [
              {
                path: new URLSearchParams(location.search)
                  .get('case')
                  ?.startsWith('all-account:account-manager')
                  ? '*'
                  : '/strategies/:strategyId/versions/:versionId',
                element: <Fixture />,
              },
              { path: '*', element: <p>已关闭受控入口</p> },
            ],
            {
              initialEntries: [
                '/strategies/fixture-strategy/versions/fixture-version?accountId=11111111-1111-4111-8111-111111111111' +
                  (new URLSearchParams(location.search).get('case') ===
                  'all-content:import-screenshot'
                    ? '&entry=screenshot'
                    : ''),
              ],
            },
          )}
        />
      </ConfirmDialogProvider>
    </ToastProvider>
  </QueryClientProvider>,
);
