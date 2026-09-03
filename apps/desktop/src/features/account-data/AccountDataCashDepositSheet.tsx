import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToastManager } from '@/components/ui/toast';

import type { Account } from '../portfolio/portfolio.types.js';
import {
  createClientCommandId,
  currentLocalDateTime,
  isPositiveDecimal,
  toCommandTime,
} from './account-data.helpers.js';
import { useCashOperationsMutations } from './account-data.cash.queries.js';

export const cashDepositErrorMessage = (_error: unknown) => '现金入账失败，请稍后重试。';

export const cashDepositSuccessDescription = (currency: Account['currency'], isFuture: boolean) =>
  isFuture ? '已列入待结算，到账后计入余额。' : `${currency} 现金余额已更新。`;

export const cashDepositSettlementTiming = (isFuture: boolean, occurredAt: string) =>
  isFuture ? { expectedAt: occurredAt } : { settledAt: occurredAt };

export function CashDepositSheet({
  account,
  open,
  onOpenChange,
}: {
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toastManager = useToastManager();
  const mutations = useCashOperationsMutations(account.id, account.mode);
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(currentLocalDateTime);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const commandIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setOccurredAt(currentLocalDateTime());
    setNote('');
    setError('');
    commandIdRef.current = null;
  }, [account.id, open]);

  const resetForm = () => {
    setAmount('');
    setOccurredAt(currentLocalDateTime());
    setNote('');
    setError('');
    commandIdRef.current = null;
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const normalizedAmount = amount.trim();
    if (!isPositiveDecimal(normalizedAmount)) {
      setError('入账金额必须是大于 0 的数字。');
      return;
    }
    if (!occurredAt || Number.isNaN(new Date(occurredAt).getTime())) {
      setError('请填写有效的到账时间。');
      return;
    }
    const commandId = commandIdRef.current ?? createClientCommandId();
    commandIdRef.current = commandId;
    const occurredAtIso = toCommandTime(occurredAt, 'INSTANT');
    const isFuture = new Date(occurredAtIso).getTime() > Date.now();
    try {
      await mutations.deposit.mutateAsync({
        accountId: account.id,
        amount: normalizedAmount,
        currency: account.currency,
        occurredAt: occurredAtIso,
        ...cashDepositSettlementTiming(isFuture, occurredAtIso),
        ...(note.trim() ? { note: note.trim() } : {}),
        commandId,
      });
      toastManager.add({
        title: '现金入账已记录',
        description: cashDepositSuccessDescription(account.currency, isFuture),
        type: 'success',
        timeout: 2800,
      });
      handleOpenChange(false);
    } catch (submissionError) {
      setError(cashDepositErrorMessage(submissionError));
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="h-[100dvh] min-h-0 w-[520px] max-w-[calc(100%-16px)] overflow-hidden p-6 sm:max-w-[calc(100%-16px)]"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <div className="shrink-0">
            <SheetTitle>现金入账</SheetTitle>
            <SheetDescription>
              填写实际到账的金额和时间。未来时间会先显示在待结算资金中。
            </SheetDescription>
          </div>
          <form
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
            onSubmit={(formEvent) => void submit(formEvent)}
          >
            <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
              <FieldGroup>
                <Field invalid={Boolean(error) && !isPositiveDecimal(amount.trim())}>
                  <FieldLabel htmlFor="cash-deposit-amount">金额（{account.currency}）</FieldLabel>
                  <Input
                    id="cash-deposit-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-invalid={Boolean(error) && !isPositiveDecimal(amount.trim())}
                  />
                </Field>
                <Field invalid={Boolean(error) && !occurredAt}>
                  <FieldLabel htmlFor="cash-deposit-occurred-at">到账时间</FieldLabel>
                  <DateInput
                    id="cash-deposit-occurred-at"
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(event) => setOccurredAt(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cash-deposit-note">备注（可选）</FieldLabel>
                  <Input
                    id="cash-deposit-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="例如：8 月工资"
                  />
                </Field>
                {error && (
                  <Field invalid>
                    <FieldError>{error}</FieldError>
                  </Field>
                )}
              </FieldGroup>
            </div>
            <SheetFooter className="shrink-0 flex-row justify-end border-t border-border p-0 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={mutations.deposit.isPending}
              >
                取消
              </Button>
              <Button type="submit" disabled={mutations.deposit.isPending}>
                {mutations.deposit.isPending && (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                )}
                确认入账
              </Button>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
