import { useEffect, useState, type FormEvent } from 'react';
import { useToastManager } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet';
import { Loader2Icon } from 'lucide-react';

import type { Account } from '../portfolio/portfolio.types.js';
import { useSaveCashBalanceMutation } from '../portfolio/portfolio.mutations.js';
import {
  currencies,
  currencyLabel,
  currentLocalDateTime,
  errorMessage,
  isNonNegativeDecimal,
  isCurrency,
  toCommandTime,
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
  const [capturedAt, setCapturedAt] = useState(currentLocalDateTime);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount('0');
    setCurrency(account.currency);
    setCapturedAt(currentLocalDateTime());
    setError(null);
  }, [account.currency, account.id, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isNonNegativeDecimal(amount)) {
      setError('现金余额必须是大于或等于 0 的数字。');
      return;
    }
    if (!capturedAt) {
      setError('请填写快照时间。');
      return;
    }
    let capturedAtIso: string;
    try {
      capturedAtIso = toCommandTime(capturedAt, 'INSTANT');
    } catch {
      setError('快照时间格式不正确。');
      return;
    }
    if (Date.parse(capturedAtIso) > Date.now()) {
      setError('快照时间不能晚于当前时间。');
      return;
    }
    try {
      await mutation.mutateAsync({
        accountId: account.id,
        amount: amount.trim(),
        currency,
        capturedAt: capturedAtIso,
      });
      toastManager.add({
        title: '现金快照已记录',
        description: '这不是现金流成交，仅更新现金快照。',
        type: 'success',
        timeout: 2800,
      });
      onSaved();
      handleOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, '现金快照记录失败；当前输入已保留。'));
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAmount('0');
      setCurrency(account.currency);
      setCapturedAt(currentLocalDateTime());
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="h-[100dvh] min-h-0 w-[520px] max-w-[calc(100%-16px)] overflow-hidden p-6 sm:max-w-[calc(100%-16px)]"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <div className="shrink-0">
            <SheetTitle>记录现金快照</SheetTitle>
            <SheetDescription>
              填写该余额对应的时间；默认当前时间，不能填写未来时间。
            </SheetDescription>
          </div>
          <form
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
            onSubmit={(event) => void submit(event)}
          >
            <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
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
                <Field invalid={Boolean(error) && (!capturedAt || error?.includes('快照时间'))}>
                  <FieldLabel htmlFor="cash-observation-captured-at">快照时间</FieldLabel>
                  <DateInput
                    id="cash-observation-captured-at"
                    type="datetime-local"
                    value={capturedAt}
                    max={currentLocalDateTime()}
                    onChange={(event) => setCapturedAt(event.target.value)}
                    required
                  />
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
                {error && (
                  <Field invalid>
                    <FieldError>{error}</FieldError>
                  </Field>
                )}
              </FieldGroup>
            </div>
            <SheetFooter className="shrink-0 flex-row justify-end border-t border-border p-0 pt-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                )}
                {mutation.isPending ? '记录中…' : '记录现金快照'}
              </Button>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
