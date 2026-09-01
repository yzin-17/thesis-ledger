import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRightIcon, Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToastManager } from '@/components/ui/toast';

import type { Account } from '../portfolio/portfolio.types.js';
import { currentLocalDateTime } from './account-data.helpers.js';
import { useCashOperationsMutations } from './account-data.cash.queries.js';

export function CashTransferSheet({
  account,
  accounts,
  open,
  onOpenChange,
}: {
  account: Account;
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toastManager = useToastManager();
  const mutations = useCashOperationsMutations(account.id, account.mode);
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(currentLocalDateTime);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const counterparties = useMemo(
    () =>
      accounts.filter((candidate) => {
        if (candidate.id === account.id || candidate.active === false) return false;
        if (candidate.mode !== 'actual' || candidate.currency !== account.currency) return false;
        if (account.type === 'cash')
          return candidate.type === 'securities' || candidate.type === 'fund';
        return candidate.type === 'cash';
      }),
    [account, accounts],
  );

  useEffect(() => {
    if (!open || counterparties.some((candidate) => candidate.id === counterpartyId)) return;
    setCounterpartyId(counterparties[0]?.id ?? '');
  }, [counterparties, counterpartyId, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const numericAmount = Number(amount);
    if (!counterpartyId) {
      setError('请选择同币种的现金或投资账户。');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('划转金额必须大于 0。');
      return;
    }
    const counterparty = counterparties.find((candidate) => candidate.id === counterpartyId);
    if (!counterparty) return;
    const sourceAccountId = direction === 'out' ? account.id : counterparty.id;
    const targetAccountId = direction === 'out' ? counterparty.id : account.id;
    try {
      await mutations.transfer.mutateAsync({
        sourceAccountId,
        targetAccountId,
        amount,
        currency: account.currency,
        occurredAt: new Date(occurredAt).toISOString(),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toastManager.add({
        title: '现金划转已入账',
        description: '两端账户已原子更新。',
        type: 'success',
      });
      setAmount('');
      setNote('');
      setOccurredAt(currentLocalDateTime());
      onOpenChange(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : '现金划转失败，请稍后重试。',
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-[100dvh] min-h-0 w-[520px] max-w-[calc(100%-16px)] overflow-hidden sm:max-w-[calc(100%-16px)]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>账户间现金划转</SheetTitle>
          <SheetDescription>
            仅支持真实现金账户与同币种证券或基金账户；提交后两端同时入账。
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(formEvent) => void submit(formEvent)}
        >
          <div className="flex-1 overflow-y-auto p-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="cash-transfer-direction">当前账户方向</FieldLabel>
                <Select
                  value={direction}
                  onValueChange={(value) => value && setDirection(value)}
                >
                  <SelectTrigger id="cash-transfer-direction" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="out">从 {account.name} 转出</SelectItem>
                      <SelectItem value="in">转入 {account.name}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field invalid={!counterpartyId && Boolean(error)}>
                <FieldLabel htmlFor="cash-transfer-counterparty">对方账户</FieldLabel>
                <Select
                  value={counterpartyId || null}
                  onValueChange={(value) => value && setCounterpartyId(value)}
                >
                  <SelectTrigger
                    id="cash-transfer-counterparty"
                    className="w-full"
                    aria-invalid={!counterpartyId && Boolean(error)}
                  >
                    <SelectValue placeholder="选择同币种账户" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {counterparties.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name} · {candidate.currency}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  可用范围由账户类型、模式、币种和启用状态共同决定。
                </FieldDescription>
              </Field>
              <Field invalid={Boolean(error) && (!amount || Number(amount) <= 0)}>
                <FieldLabel htmlFor="cash-transfer-amount">金额（{account.currency}）</FieldLabel>
                <Input
                  id="cash-transfer-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-invalid={Boolean(error) && (!amount || Number(amount) <= 0)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cash-transfer-occurred-at">划转时间</FieldLabel>
                <Input
                  id="cash-transfer-occurred-at"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cash-transfer-note">备注（可选）</FieldLabel>
                <Input
                  id="cash-transfer-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="例如：转入证券账户备用金"
                />
              </Field>
              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>
          </div>
          <SheetFooter className="border-t bg-popover">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutations.transfer.isPending}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={mutations.transfer.isPending || counterparties.length === 0}
            >
              {mutations.transfer.isPending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <ArrowLeftRightIcon data-icon="inline-start" />
              )}
              确认划转
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
