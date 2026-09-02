import { useEffect, useState, type FormEvent } from 'react';
import { useToastManager } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { LoaderCircle } from 'lucide-react';

import type { Account } from '../portfolio/portfolio.types.js';
import { useSaveCashBalanceMutation } from '../portfolio/portfolio.mutations.js';
import {
  currencies,
  currencyLabel,
  errorMessage,
  isNonNegativeDecimal,
  isCurrency,
} from './account-data.helpers.js';
import type { Currency } from './account-data.types.js';

export function CashObservationSheet({
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const toastManager = useToastManager();
  const mutation = useSaveCashBalanceMutation();
  const [amount, setAmount] = useState('0');
  const [currency, setCurrency] = useState<Currency>(account.currency);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount('0');
    setCurrency(account.currency);
    setError(null);
  }, [account.currency, account.id, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isNonNegativeDecimal(amount)) {
      setError('现金余额必须是大于或等于 0 的数字。');
      return;
    }
    try {
      await mutation.mutateAsync({ accountId: account.id, amount: amount.trim(), currency });
      toastManager.add({
        title: '现金观察已记录',
        description: '这不是现金流成交，仅更新现金快照。',
        type: 'success',
        timeout: 2800,
      });
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, '现金观察记录失败；当前输入已保留。'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[520px] max-w-[calc(100%-16px)] p-6">
        <SheetTitle>校准现金余额</SheetTitle>
        <SheetDescription>
          这会创建 CASH_BALANCE_OBSERVATION，不代表存入、取出或转账。
        </SheetDescription>
        <form className="mt-5 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cash-observation-currency">币种</FieldLabel>
              <Select
                value={currency}
                onValueChange={(value) => {
                  if (isCurrency(value)) setCurrency(value);
                }}
              >
                <SelectTrigger id="cash-observation-currency" className="w-full">
                  <SelectValue>{currencyLabel(currency)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {currencies.map((value) => (
                      <SelectItem key={value} value={value}>
                        {currencyLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cash-observation-amount">已结算余额</FieldLabel>
              <Input
                id="cash-observation-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </Field>
          </FieldGroup>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {mutation.isPending ? '记录中…' : '记录现金观察'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
