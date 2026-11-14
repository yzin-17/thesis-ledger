import type { useToastManager } from '@/components/ui/toast';
import type { LedgerCommandResponse } from '@thesis-ledger/api-client';
import { type FormEvent } from 'react';
import { type Account, type InstrumentLookup } from '../portfolio/portfolio.types.js';
import {
  commandFeedback,
  createClientCommandId,
  dateOnly,
  errorCode,
  errorMessage,
  isPositiveDecimal,
  sourceTimezone,
  toCommandTime,
} from './account-data.helpers.js';
import type {
  useCreateExecutionMutation,
  useReplaceExecutionMutation,
} from './account-data.mutations.js';
import type { ChargeDraft, ExecutionDraft, ExecutionEvent } from './account-data.types.js';

type ExecutionSubmitContext = {
  submitting: boolean;
  setFormError: (value: string | null) => void;
  selectedInstrument: InstrumentLookup | null;
  draft: ExecutionDraft;
  charges: ChargeDraft[];
  editingEvent: ExecutionEvent | null;
  replaceMutation: ReturnType<typeof useReplaceExecutionMutation>;
  createMutation: ReturnType<typeof useCreateExecutionMutation>;
  account: Account;
  ledgerRevision: string;
  toastManager: ReturnType<typeof useToastManager>;
  updateDirty: (dirty?: boolean) => void;
  onOpenChange: (open: boolean, options?: { skipDiscardConfirm?: boolean }) => void;
};
export function createExecutionSubmit({
  submitting,
  setFormError,
  selectedInstrument,
  draft,
  charges,
  editingEvent,
  replaceMutation,
  createMutation,
  account,
  ledgerRevision,
  toastManager,
  updateDirty,
  onOpenChange,
}: ExecutionSubmitContext) {
  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    const validation = validateExecutionFields({
      selectedInstrument,
      draft,
      charges,
      editingEvent,
    });
    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }
    const { symbol, parsedCharges } = validation;
    const commandId = createClientCommandId();
    const occurredAt = toCommandTime(draft.occurredAt, draft.timePrecision);
    const settlementAt = draft.settledAt.trim()
      ? new Date(draft.settledAt).toISOString()
      : undefined;
    let settlementTiming: { expectedAt?: string; settledAt?: string } = {};
    if (settlementAt) {
      if (new Date(settlementAt).getTime() > Date.now())
        settlementTiming = { expectedAt: settlementAt };
      else settlementTiming = { settledAt: settlementAt };
    }
    const payload = {
      symbol,
      quantity: draft.quantity.trim(),
      price: draft.price.trim(),
      currency: draft.currency,
      ...settlementTiming,
      capabilityVerification: draft.capabilityVerification,
      charges: parsedCharges,
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    } as const;
    try {
      let response: LedgerCommandResponse;
      if (editingEvent) {
        response = await replaceMutation.mutateAsync({
          command: 'REPLACE_EXECUTION',
          accountId: account.id,
          occurredAt,
          timePrecision: draft.timePrecision,
          sourceTimezone: sourceTimezone(),
          economicOrderKey: editingEvent.economicOrderKey,
          side: draft.side,
          payload,
          source: {
            category: 'MANUAL',
            channel: 'desktop-account-data',
            externalId: commandId,
          },
          actorId: 'desktop-user',
          expectedLedgerRevision: ledgerRevision,
          supersedesEventId: editingEvent.eventId,
          reason: draft.reason.trim(),
        });
      } else {
        response = await createMutation.mutateAsync({
          command: 'CREATE_EXECUTION',
          accountId: account.id,
          occurredAt,
          timePrecision: draft.timePrecision,
          sourceTimezone: sourceTimezone(),
          economicOrderKey: `${account.id}:${occurredAt}:${symbol}:${draft.side}:${commandId}`,
          side: draft.side,
          payload,
          source: {
            category: 'MANUAL',
            channel: 'desktop-account-data',
            externalId: commandId,
          },
          actorId: 'desktop-user',
        });
      }
      toastManager.add({
        title: commandFeedback(response, editingEvent ? '成交更正' : '成交'),
        type: 'success',
        timeout: 2800,
      });
      updateDirty(false);
      onOpenChange(false, { skipDiscardConfirm: true });
    } catch (error) {
      const code = errorCode(error);
      const conflict = code === 'LEDGER_REVISION_CONFLICT';
      setFormError(
        conflict
          ? '账本版本已变化，请刷新并比较后再提交；当前输入已保留。'
          : errorMessage(error, '成交写入失败；当前输入已保留。'),
      );
    }
  };
}
function validateExecutionFields({
  selectedInstrument,
  draft,
  charges,
  editingEvent,
}: Pick<ExecutionSubmitContext, 'selectedInstrument' | 'draft' | 'charges' | 'editingEvent'>) {
  const symbol = (selectedInstrument?.symbol ?? draft.symbol).trim().toUpperCase();
  if (!symbol) {
    return { valid: false as const, error: '请选择或填写标的。' };
  }
  if (!isPositiveDecimal(draft.quantity)) {
    return { valid: false as const, error: '数量必须是大于 0 的数字，可保留高精度小数。' };
  }
  if (!isPositiveDecimal(draft.price)) {
    return { valid: false as const, error: '价格必须是大于 0 的数字，可保留高精度小数。' };
  }
  if (draft.timePrecision === 'DATE' && !dateOnly(draft.occurredAt)) {
    return { valid: false as const, error: '日期精度必须使用 YYYY-MM-DD。' };
  }
  if (draft.timePrecision === 'INSTANT' && Number.isNaN(new Date(draft.occurredAt).getTime())) {
    return { valid: false as const, error: '请填写有效的成交时间。' };
  }
  if (draft.settledAt.trim() && Number.isNaN(new Date(draft.settledAt).getTime())) {
    return { valid: false as const, error: '请填写有效的结算时间。' };
  }
  const parsedCharges = [];
  for (const charge of charges) {
    if (!charge.amount.trim()) continue;
    if (!isPositiveDecimal(charge.amount)) {
      return { valid: false as const, error: '费用金额必须是大于 0 的数字。' };
    }
    parsedCharges.push({
      category: charge.category,
      amount: charge.amount.trim(),
      currency: charge.currency,
      ...(charge.description.trim() ? { description: charge.description.trim() } : {}),
    });
  }
  if (editingEvent && !draft.reason.trim()) {
    return { valid: false as const, error: '更正原因必填。' };
  }

  return { valid: true as const, symbol, parsedCharges };
}
