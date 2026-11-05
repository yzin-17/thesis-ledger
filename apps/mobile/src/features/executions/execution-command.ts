import {
  createExecutionCommandSchema,
  replaceExecutionCommandSchema,
  restoreExecutionCommandSchema,
  type LedgerEvent,
  type ExecutionCharge,
} from '@thesis-ledger/schemas';
import { ledgerInputTime } from '../accounts/ledger-input-time';
export type ExecutionEvent = Extract<LedgerEvent, { type: 'BUY_EXECUTION' | 'SELL_EXECUTION' }>;
export function isExecution(event: LedgerEvent): event is ExecutionEvent {
  return (
    event.revisionAction !== 'VOID' &&
    (event.type === 'BUY_EXECUTION' || event.type === 'SELL_EXECUTION')
  );
}
export type ExecutionForm = {
  side: 'BUY' | 'SELL';
  symbol: string;
  quantity: string;
  price: string;
  currency: string;
  occurredAt: string;
  timePrecision: 'DATE' | 'INSTANT';
  sourceTimezone: string;
  settledAt: string;
  note: string;
  reason: string;
  charges: ExecutionCharge[];
  expectedAt: string;
  capabilityVerification: 'UNVERIFIED' | 'VERIFIED';
};
export function executionForm(
  event: LedgerEvent | undefined,
  currency: ExecutionForm['currency'],
): ExecutionForm {
  if (!event || !isExecution(event))
    return {
      side: 'BUY',
      symbol: '',
      quantity: '',
      price: '',
      currency,
      occurredAt: '',
      timePrecision: 'INSTANT',
      sourceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      settledAt: '',
      note: '',
      reason: '',
      charges: [],
      expectedAt: '',
      capabilityVerification: 'UNVERIFIED',
    };
  const execution = event;
  return {
    side: execution.type === 'SELL_EXECUTION' ? 'SELL' : 'BUY',
    symbol: execution.payload.symbol,
    quantity: execution.payload.quantity,
    price: execution.payload.price,
    currency: execution.payload.currency,
    occurredAt: execution.occurredAt ?? '',
    timePrecision: execution.timePrecision === 'DATE' ? 'DATE' : 'INSTANT',
    sourceTimezone: execution.sourceTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    settledAt: execution.payload.settledAt ?? '',
    note: execution.payload.note ?? '',
    reason: '',
    charges: execution.payload.charges,
    expectedAt: execution.payload.expectedAt ?? '',
    capabilityVerification: execution.payload.capabilityVerification ?? 'UNVERIFIED',
  };
}
export function buildExecutionCommand(
  form: ExecutionForm,
  context: {
    id: string;
    accountId: string;
    action?: 'replace' | 'restore';
    revision: string;
    supersedesEventId?: string;
  },
) {
  const base = {
    accountId: context.accountId,
    occurredAt: ledgerInputTime(form.occurredAt, form.timePrecision),
    timePrecision: form.timePrecision,
    sourceTimezone: form.sourceTimezone.trim(),
    economicOrderKey: context.id,
    side: form.side,
    payload: {
      symbol: form.symbol,
      quantity: form.quantity.trim(),
      price: form.price.trim(),
      currency: form.currency,
      capabilityVerification: form.capabilityVerification,
      charges: form.charges,
      ...(form.expectedAt.trim()
        ? { expectedAt: ledgerInputTime(form.expectedAt, 'INSTANT') }
        : {}),
      ...(form.settledAt.trim() ? { settledAt: ledgerInputTime(form.settledAt, 'INSTANT') } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    },
    source: { category: 'MANUAL' as const, channel: 'mobile-account-data', externalId: context.id },
    actorId: 'mobile-user',
  };
  if (!context.action)
    return createExecutionCommandSchema.parse({ ...base, command: 'CREATE_EXECUTION' });
  const correction = {
    ...base,
    expectedLedgerRevision: context.revision,
    supersedesEventId: context.supersedesEventId,
    reason: form.reason.trim(),
  };
  if (context.action === 'restore')
    return restoreExecutionCommandSchema.parse({ ...correction, command: 'RESTORE_EXECUTION' });
  return replaceExecutionCommandSchema.parse({ ...correction, command: 'REPLACE_EXECUTION' });
}
