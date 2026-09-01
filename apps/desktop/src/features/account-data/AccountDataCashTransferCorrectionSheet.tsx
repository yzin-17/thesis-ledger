import { useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
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

import type { CashTransferEvent } from './account-data.types.js';
import { currentLocalDateTime, localDateTimeValue } from './account-data.helpers.js';
import { useCashOperationsMutations } from './account-data.cash.queries.js';

const correctionLabels = {
  replace: { title: '更正现金划转', reason: '更正原因', submit: '确认更正', success: '现金划转已更正' },
  void: { title: '作废现金划转', reason: '作废原因', submit: '确认作废', success: '现金划转已作废' },
  restore: { title: '恢复现金划转', reason: '恢复原因', submit: '确认恢复', success: '现金划转已恢复' },
} as const;

export function CashTransferCorrectionSheet({
  event,
  mode,
  open,
  onOpenChange,
  onSaved,
}: {
  event: CashTransferEvent;
  mode: 'replace' | 'void' | 'restore';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const toastManager = useToastManager();
  const labels = correctionLabels[mode];
  const mutations = useCashOperationsMutations(event.accountId, 'actual');
  const [amount, setAmount] = useState(event.payload.amount);
  const [occurredAt, setOccurredAt] = useState(() =>
    localDateTimeValue(event.occurredAt, 'INSTANT') || currentLocalDateTime(),
  );
  const [note, setNote] = useState(event.payload.note ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const pending =
    mutations.replaceTransfer.isPending ||
    mutations.voidTransfer.isPending ||
    mutations.restoreTransfer.isPending;
  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setError('');
    if (!reason.trim()) {
      setError('请填写更正或作废原因。');
      return;
    }
    try {
      if (mode === 'replace') {
        await mutations.replaceTransfer.mutateAsync({
          event,
          amount,
          occurredAt: new Date(occurredAt).toISOString(),
          ...(note.trim() ? { note: note.trim() } : {}),
          reason: reason.trim(),
        });
      } else if (mode === 'void') {
        await mutations.voidTransfer.mutateAsync({ event, reason: reason.trim() });
      } else {
        await mutations.restoreTransfer.mutateAsync({ event, reason: reason.trim() });
      }
      toastManager.add({
        title: labels.success,
        description: '两端修正链已原子更新。',
        type: 'success',
      });
      onSaved?.();
      onOpenChange(false);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : '现金划转操作失败。');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-[100dvh] min-h-0 w-[520px] max-w-[calc(100%-16px)] overflow-hidden sm:max-w-[calc(100%-16px)]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{labels.title}</SheetTitle>
          <SheetDescription>该操作始终同时更新划转两端，并保留完整 Revision 链。</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(formEvent) => void submit(formEvent)}
        >
          <div className="flex-1 overflow-y-auto p-4">
            <FieldGroup>
              {mode === 'replace' && (
                <>
                  <Field>
                    <FieldLabel htmlFor="cash-transfer-correction-amount">
                      更正金额（{event.payload.currency}）
                    </FieldLabel>
                    <Input
                      id="cash-transfer-correction-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(inputEvent) => setAmount(inputEvent.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cash-transfer-correction-date">更正时间</FieldLabel>
                    <Input
                      id="cash-transfer-correction-date"
                      type="datetime-local"
                      value={occurredAt}
                      onChange={(inputEvent) => setOccurredAt(inputEvent.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cash-transfer-correction-note">备注（可选）</FieldLabel>
                    <Input
                      id="cash-transfer-correction-note"
                      value={note}
                      onChange={(inputEvent) => setNote(inputEvent.target.value)}
                    />
                  </Field>
                </>
              )}
              <Field invalid={Boolean(error) && !reason.trim()}>
                <FieldLabel htmlFor="cash-transfer-correction-reason">
                  {labels.reason}
                </FieldLabel>
                <Input
                  id="cash-transfer-correction-reason"
                  value={reason}
                  onChange={(inputEvent) => setReason(inputEvent.target.value)}
                  aria-invalid={Boolean(error) && !reason.trim()}
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
              disabled={pending}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant={mode === 'void' ? 'destructive' : 'default'}
              disabled={pending}
            >
              {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              {labels.submit}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
