import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToastManager } from '@/components/ui/toast';
import type {
  RecurringCashDepositOccurrence,
  RecurringCashDepositPlan,
} from '@thesis-ledger/api-client';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import type { Account } from '../portfolio/portfolio.types.js';
import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import { useCashOperationsMutations } from './account-data.cash.queries.js';
import {
  currentLocalDateTime,
  errorMessage,
  formatCurrencyAmount,
  supportedCurrency,
} from './account-data.helpers.js';

type PlanEditor = { mode: 'create'; plan: null } | { mode: 'edit'; plan: RecurringCashDepositPlan };

type OccurrenceAction = { type: 'confirm' | 'skip'; occurrence: RecurringCashDepositOccurrence };

const currentPeriod = () => new Date().toISOString().slice(0, 7);

function PlanEditorSheet({
  account,
  editor,
  open,
  onOpenChange,
  onSaved,
}: {
  account: Account;
  editor: PlanEditor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const toastManager = useToastManager();
  const mutations = useCashOperationsMutations(account.id, account.mode);
  const [name, setName] = useState(editor.plan?.name ?? '工资入账');
  const [amount, setAmount] = useState(editor.plan?.expectedAmount ?? '');
  const [dayOfMonth, setDayOfMonth] = useState(String(editor.plan?.dayOfMonth ?? 1));
  const [startPeriod, setStartPeriod] = useState(currentPeriod);
  const [error, setError] = useState('');
  const pending = mutations.createPlan.isPending || mutations.updatePlan.isPending;
  const requestClose = useDraftCloseGuard({
    open,
    draft: { name, amount, dayOfMonth, startPeriod },
    busy: pending,
    onOpenChange,
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError('');
    try {
      if (editor.mode === 'create')
        await mutations.createPlan.mutateAsync({
          accountId: account.id,
          name,
          expectedAmount: amount,
          dayOfMonth: Number(dayOfMonth),
          startPeriod,
          timezone: 'Asia/Shanghai',
        });
      else
        await mutations.updatePlan.mutateAsync({
          id: editor.plan.id,
          input: {
            expectedVersion: editor.plan.version,
            name,
            expectedAmount: amount,
            dayOfMonth: Number(dayOfMonth),
          },
        });
      toastManager.add({ title: '定期入账计划已保存', type: 'success' });
      onSaved();
    } catch (submissionError) {
      setError(errorMessage(submissionError, '计划保存失败，输入已保留，请重试。'));
    }
  };
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => void requestClose(nextOpen)}>
      <SheetContent side="right" size="compact" className="h-[100dvh] min-h-0 overflow-hidden">
        <SheetHeader>
          <SheetTitle>
            {editor.mode === 'create' ? '新建定期入账计划' : '修改定期入账计划'}
          </SheetTitle>
          <SheetDescription>到期仅生成待确认记录，不会自动写入现金余额。</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-6"
          onSubmit={(formEvent) => void submit(formEvent)}
        >
          <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto scroll-p-2 px-1 py-1">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="cash-plan-name">计划名称</FieldLabel>
                <Input
                  id="cash-plan-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cash-plan-amount">预期金额（{account.currency}）</FieldLabel>
                <Input
                  id="cash-plan-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cash-plan-day">每月日期</FieldLabel>
                <Input
                  id="cash-plan-day"
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(event) => setDayOfMonth(event.target.value)}
                />
              </Field>
              {editor.mode === 'create' && (
                <Field>
                  <FieldLabel htmlFor="cash-plan-start">开始月份</FieldLabel>
                  <DateInput
                    id="cash-plan-start"
                    type="month"
                    value={startPeriod}
                    onChange={(event) => setStartPeriod(event.target.value)}
                  />
                </Field>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>计划保存失败</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </div>
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => void requestClose(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}保存计划
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function OccurrenceActionSheet({
  action,
  open,
  onOpenChange,
  onSaved,
}: {
  action: OccurrenceAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const toastManager = useToastManager();
  const occurrence = action.occurrence;
  const mutations = useCashOperationsMutations(occurrence.accountId, 'actual');
  const [actualAmount, setActualAmount] = useState(occurrence.expectedAmount);
  const [occurredAt, setOccurredAt] = useState(currentLocalDateTime);
  const [reason, setReason] = useState('本期未到账');
  const [error, setError] = useState('');
  const pending = mutations.confirmOccurrence.isPending || mutations.skipOccurrence.isPending;
  const requestClose = useDraftCloseGuard({
    open,
    draft: { actualAmount, occurredAt, reason },
    busy: pending,
    onOpenChange,
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError('');
    try {
      if (action.type === 'confirm')
        await mutations.confirmOccurrence.mutateAsync({
          id: occurrence.id,
          input: {
            expectedVersion: occurrence.version,
            actualAmount,
            occurredAt: new Date(occurredAt).toISOString(),
          },
        });
      else
        await mutations.skipOccurrence.mutateAsync({
          id: occurrence.id,
          expectedVersion: occurrence.version,
          reason,
        });
      toastManager.add({
        title: action.type === 'confirm' ? '实际入账已确认' : '本期入账已跳过',
        type: 'success',
      });
      onSaved();
    } catch (submissionError) {
      setError(errorMessage(submissionError, '操作失败，输入已保留，请重试。'));
    }
  };
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => void requestClose(nextOpen)}>
      <SheetContent side="right" size="compact" className="h-[100dvh] min-h-0 overflow-hidden">
        <SheetHeader>
          <SheetTitle>{action.type === 'confirm' ? '确认实际入账' : '跳过本期入账'}</SheetTitle>
          <SheetDescription>
            {occurrence.planName} · {occurrence.periodKey} · 计划{' '}
            {formatCurrencyAmount(
              Number(occurrence.expectedAmount),
              supportedCurrency(occurrence.currency),
            )}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-6"
          onSubmit={(formEvent) => void submit(formEvent)}
        >
          <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto scroll-p-2 px-1 py-1">
            <FieldGroup>
              {action.type === 'confirm' ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="cash-occurrence-amount">
                      实际金额（{occurrence.currency}）
                    </FieldLabel>
                    <Input
                      id="cash-occurrence-amount"
                      inputMode="decimal"
                      value={actualAmount}
                      onChange={(event) => setActualAmount(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cash-occurrence-date">实际到账时间</FieldLabel>
                    <DateInput
                      id="cash-occurrence-date"
                      type="datetime-local"
                      value={occurredAt}
                      onChange={(event) => setOccurredAt(event.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel htmlFor="cash-occurrence-reason">跳过原因</FieldLabel>
                  <Input
                    id="cash-occurrence-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>入账操作失败</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </div>
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => void requestClose(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant={action.type === 'skip' ? 'outline' : 'default'}
              disabled={pending}
            >
              {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              {action.type === 'confirm' ? '确认入账' : '确认跳过'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export { OccurrenceAction, OccurrenceActionSheet, PlanEditor, PlanEditorSheet };
