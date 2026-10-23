import {
  createCashTransferCommandSchema,
  replaceCashTransferCommandSchema,
  restoreCashTransferCommandSchema,
  voidCashTransferCommandSchema,
  type AccountResponse,
  type LedgerEvent,
  type LedgerEventsResponse,
} from '@thesis-ledger/schemas';
import { ledgerInputTime } from '../accounts/ledger-input-time';
export type TransferFact = Extract<
  LedgerEvent,
  { type: 'CASH_FLOW'; revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE' }
>;
export function isTransfer(event: LedgerEvent): event is TransferFact {
  return (
    event.type === 'CASH_FLOW' &&
    event.revisionAction !== 'VOID' &&
    event.payload.category === 'TRANSFER' &&
    Boolean(event.payload.transfer)
  );
}
export function transferAccounts(event: TransferFact) {
  const transfer = event.payload.transfer;
  if (!transfer) throw new Error('划转关联信息缺失。');
  return {
    sourceAccountId: transfer.leg === 'OUTFLOW' ? event.accountId : transfer.counterpartyAccountId,
    targetAccountId: transfer.leg === 'INFLOW' ? event.accountId : transfer.counterpartyAccountId,
  };
}
export type TransferRead = {
  source: LedgerEventsResponse;
  target: LedgerEventsResponse;
  sourceAudit: LedgerEvent[];
  targetAudit: LedgerEvent[];
};
export type TransferForm = { amount: string; occurredAt: string; note: string; reason: string };
export function cashTransferPair(
  source: AccountResponse['type'] | undefined,
  target: AccountResponse['type'] | undefined,
) {
  if (!source || !target) return false;
  return (
    (source === 'cash' && (target === 'securities' || target === 'fund')) ||
    (target === 'cash' && (source === 'securities' || source === 'fund'))
  );
}
function legTip(events: LedgerEvent[], transferId: string, leg: 'INFLOW' | 'OUTFLOW') {
  const facts = events
    .filter(isTransfer)
    .filter(
      (event) =>
        event.payload.transfer?.transferId === transferId && event.payload.transfer.leg === leg,
    );
  const fact = facts.at(-1);
  if (!fact) throw new Error('无法读取完整划转链，请重新读取两侧账本。');
  const tip = events
    .filter((event) => event.factId === fact.factId)
    .reduce((a, b) => (BigInt(a.ledgerRevision) > BigInt(b.ledgerRevision) ? a : b));
  return { fact, tip };
}
export function buildTransferCommand(
  form: TransferForm,
  context: {
    id: string;
    source: AccountResponse;
    target: AccountResponse;
    read: TransferRead;
    event?: TransferFact;
    action?: 'replace' | 'void' | 'restore';
  },
) {
  const { source, target, read, id, event, action } = context;
  if (!source.active || !target.active || source.mode !== 'actual' || target.mode !== 'actual')
    throw new Error('划转只支持启用的实际账户。');
  if (source.currency !== target.currency) throw new Error('划转两侧账户币种必须一致。');
  if (!cashTransferPair(source.type, target.type))
    throw new Error('现金划转仅支持现金账户与证券或基金账户之间操作。');
  if (read.source.accountId !== source.id || read.target.accountId !== target.id)
    throw new Error('划转账本与所选账户不一致。');
  const base = {
    transferId: event?.payload.transfer?.transferId ?? id,
    sourceAccountId: source.id,
    targetAccountId: target.id,
    expectedSourceLedgerRevision: read.source.ledgerRevision,
    expectedTargetLedgerRevision: read.target.ledgerRevision,
    source: { category: 'MANUAL' as const, channel: 'mobile-cash-transfer', externalId: id },
    actorId: 'mobile-user',
  };
  const content = {
    occurredAt: ledgerInputTime(form.occurredAt, 'INSTANT'),
    timePrecision: 'INSTANT' as const,
    sourceTimezone: event?.sourceTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    economicOrderKey: id,
    amount: form.amount.trim(),
    currency: source.currency,
    ...(event?.payload.expectedAt ? { expectedAt: event.payload.expectedAt } : {}),
    ...(event?.payload.settledAt ? { settledAt: event.payload.settledAt } : {}),
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
  };
  if (!action)
    return createCashTransferCommandSchema.parse({
      ...base,
      ...content,
      command: 'CREATE_CASH_TRANSFER',
    });
  if (!event || !event.payload.transfer) throw new Error('请先选择划转事实。');
  const linked = transferAccounts(event);
  if (linked.sourceAccountId !== source.id || linked.targetAccountId !== target.id)
    throw new Error('不能在更正时改变划转两侧账户。');
  const from = legTip(read.sourceAudit, base.transferId, 'OUTFLOW');
  const to = legTip(read.targetAudit, base.transferId, 'INFLOW');
  if (
    from.fact.accountId !== source.id ||
    to.fact.accountId !== target.id ||
    from.fact.payload.transfer?.counterpartyAccountId !== target.id ||
    to.fact.payload.transfer?.counterpartyAccountId !== source.id
  )
    throw new Error('划转两端事实关联不一致。');
  const correction = {
    ...base,
    supersedesSourceEventId: from.tip.eventId,
    supersedesTargetEventId: to.tip.eventId,
    reason: form.reason.trim(),
  };
  const bothVoided = from.tip.revisionAction === 'VOID' && to.tip.revisionAction === 'VOID';
  const eitherVoided = from.tip.revisionAction === 'VOID' || to.tip.revisionAction === 'VOID';
  if (action === 'restore') {
    if (!bothVoided) throw new Error('恢复要求两侧划转均已作废。');
    return restoreCashTransferCommandSchema.parse({
      ...correction,
      ...content,
      command: 'RESTORE_CASH_TRANSFER',
    });
  }
  if (eitherVoided) throw new Error('划转两端当前状态不可更正或作废。');
  if (action === 'void')
    return voidCashTransferCommandSchema.parse({ ...correction, command: 'VOID_CASH_TRANSFER' });
  return replaceCashTransferCommandSchema.parse({
    ...correction,
    ...content,
    command: 'REPLACE_CASH_TRANSFER',
  });
}
