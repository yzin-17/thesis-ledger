import type {
  CashFlowPayloadV2,
  CashTransferMetadataV2,
  ConfirmRecurringCashDepositOccurrence,
  CreateCashFlowCommandV2,
  CreateCashTransferCommandV2,
  CreateRecurringCashDepositPlan,
  LedgerAuditResponseV2,
  LedgerCommandResponseV2,
  LedgerEventV2,
  RecurringCashDepositOccurrence,
  RecurringCashDepositPlan,
  ReplaceCashTransferCommandV2,
  RestoreCashTransferCommandV2,
  ThesisLedgerApiClient,
  UpdateRecurringCashDepositPlan,
  VoidCashTransferCommandV2,
} from '@thesis-ledger/api-client';

import { getDesktopApiClient } from '../../shared/api/client.js';
import { createClientCommandId, sourceTimezone } from './account-data.helpers.js';

export type CashOperationsClient = {
  ledger: Pick<
    ThesisLedgerApiClient['ledger'],
    | 'getEvents'
    | 'getEventAudit'
    | 'createCashFlow'
    | 'createCashTransfer'
    | 'replaceCashTransfer'
    | 'voidCashTransfer'
    | 'restoreCashTransfer'
  >;
  cashDeposits: ThesisLedgerApiClient['cashDeposits'];
};

const defaultClient = (): CashOperationsClient => getDesktopApiClient();

export const createManualCashDeposit = async (
  input: {
    accountId: string;
    amount: string;
    currency: 'CNY' | 'HKD' | 'USD';
    occurredAt: string;
    expectedAt?: string;
    settledAt?: string;
    note?: string;
    commandId?: string;
  },
  client: CashOperationsClient = defaultClient(),
): Promise<LedgerCommandResponseV2> => {
  const commandId = input.commandId ?? createClientCommandId();
  const command: CreateCashFlowCommandV2 = {
    command: 'CREATE_CASH_FLOW',
    accountId: input.accountId,
    occurredAt: input.occurredAt,
    timePrecision: 'INSTANT',
    sourceTimezone: sourceTimezone(),
    economicOrderKey: `desktop-cash-deposit:${commandId}`,
    payload: {
      direction: 'INFLOW',
      category: 'DEPOSIT',
      amount: input.amount,
      currency: input.currency,
      ...(input.expectedAt === undefined ? {} : { expectedAt: input.expectedAt }),
      ...(input.settledAt === undefined ? {} : { settledAt: input.settledAt }),
      ...(input.note ? { note: input.note } : {}),
    },
    source: {
      category: 'MANUAL',
      channel: 'desktop-cash-deposit',
      externalId: commandId,
    },
    actorId: 'desktop-user',
  };
  return client.ledger.createCashFlow(command);
};

export const createManualCashTransfer = async (
  input: {
    sourceAccountId: string;
    targetAccountId: string;
    amount: string;
    currency: 'CNY' | 'HKD' | 'USD';
    occurredAt: string;
    note?: string;
  },
  client: CashOperationsClient = defaultClient(),
): Promise<LedgerCommandResponseV2> => {
  const transferId = crypto.randomUUID();
  const [sourceLedger, targetLedger] = await Promise.all([
    client.ledger.getEvents(input.sourceAccountId),
    client.ledger.getEvents(input.targetAccountId),
  ]);
  const command: CreateCashTransferCommandV2 = {
    command: 'CREATE_CASH_TRANSFER',
    transferId,
    sourceAccountId: input.sourceAccountId,
    targetAccountId: input.targetAccountId,
    expectedSourceLedgerRevision: sourceLedger.ledgerRevision,
    expectedTargetLedgerRevision: targetLedger.ledgerRevision,
    occurredAt: input.occurredAt,
    timePrecision: 'INSTANT',
    sourceTimezone: 'Asia/Shanghai',
    economicOrderKey: `desktop-cash-transfer:${transferId}`,
    amount: input.amount,
    currency: input.currency,
    ...(input.note ? { note: input.note } : {}),
    source: {
      category: 'MANUAL',
      channel: 'desktop-cash-transfer',
      externalId: `desktop-cash-transfer:${transferId}`,
    },
    actorId: 'desktop-user',
  };
  return client.ledger.createCashTransfer(command);
};

type CashTransferPayload = CashFlowPayloadV2 & {
  category: 'TRANSFER';
  transfer: CashTransferMetadataV2;
};

export type TransferEvent = Extract<
  LedgerEventV2,
  { type: 'CASH_FLOW'; revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE' }
> & {
  type: 'CASH_FLOW';
  payload: CashTransferPayload;
};

type LedgerAuditEvent = LedgerAuditResponseV2['events'][number];

const isLedgerEventV2 = (event: LedgerAuditEvent): event is LedgerEventV2 => event.version === 2;

const isActiveCashTransferEvent = (event: LedgerAuditEvent): event is TransferEvent =>
  isLedgerEventV2(event) &&
  event.type === 'CASH_FLOW' &&
  event.revisionAction !== 'VOID' &&
  event.payload.category === 'TRANSFER' &&
  event.payload.transfer !== undefined;

const isVoidLedgerEvent = (
  event: LedgerAuditEvent | undefined,
): event is Extract<LedgerEventV2, { revisionAction: 'VOID' }> =>
  event !== undefined && isLedgerEventV2(event) && event.revisionAction === 'VOID';

const loadTransferContext = async (event: TransferEvent, client: CashOperationsClient) => {
  const transfer = event.payload.transfer;
  if (!transfer) throw new Error('现金划转事件缺少关联信息。');
  const sourceAccountId =
    transfer.leg === 'OUTFLOW' ? event.accountId : transfer.counterpartyAccountId;
  const targetAccountId =
    transfer.leg === 'INFLOW' ? event.accountId : transfer.counterpartyAccountId;
  const [sourceLedger, targetLedger] = await Promise.all([
    client.ledger.getEvents(sourceAccountId),
    client.ledger.getEvents(targetAccountId),
  ]);
  const findLeg = (events: typeof sourceLedger.events, leg: 'OUTFLOW' | 'INFLOW') =>
    events.find(
      (candidate): candidate is TransferEvent =>
        isActiveCashTransferEvent(candidate) &&
        candidate.payload.transfer.transferId === transfer.transferId &&
        candidate.payload.transfer.leg === leg,
    );
  const sourceEvent = findLeg(sourceLedger.events, 'OUTFLOW');
  const targetEvent = findLeg(targetLedger.events, 'INFLOW');
  if (!sourceEvent || !targetEvent) throw new Error('无法读取完整划转修正链，请刷新后重试。');
  return {
    transfer,
    sourceAccountId,
    targetAccountId,
    sourceLedger,
    targetLedger,
    sourceEvent,
    targetEvent,
  };
};

export const replaceManualCashTransfer = async (
  input: {
    event: TransferEvent;
    amount: string;
    occurredAt: string;
    note?: string;
    reason: string;
  },
  client: CashOperationsClient = defaultClient(),
) => {
  const context = await loadTransferContext(input.event, client);
  const externalId = crypto.randomUUID();
  const command: ReplaceCashTransferCommandV2 = {
    command: 'REPLACE_CASH_TRANSFER',
    transferId: context.transfer.transferId,
    sourceAccountId: context.sourceAccountId,
    targetAccountId: context.targetAccountId,
    expectedSourceLedgerRevision: context.sourceLedger.ledgerRevision,
    expectedTargetLedgerRevision: context.targetLedger.ledgerRevision,
    supersedesSourceEventId: context.sourceEvent.eventId,
    supersedesTargetEventId: context.targetEvent.eventId,
    occurredAt: input.occurredAt,
    timePrecision: 'INSTANT',
    sourceTimezone: 'Asia/Shanghai',
    economicOrderKey: `desktop-cash-transfer-replace:${externalId}`,
    amount: input.amount,
    currency: input.event.payload.currency,
    ...(input.note ? { note: input.note } : {}),
    source: { category: 'MANUAL', channel: 'desktop-cash-transfer', externalId },
    actorId: 'desktop-user',
    reason: input.reason,
  };
  return client.ledger.replaceCashTransfer(command);
};

export const voidManualCashTransfer = async (
  input: { event: TransferEvent; reason: string },
  client: CashOperationsClient = defaultClient(),
) => {
  const context = await loadTransferContext(input.event, client);
  const externalId = crypto.randomUUID();
  const command: VoidCashTransferCommandV2 = {
    command: 'VOID_CASH_TRANSFER',
    transferId: context.transfer.transferId,
    sourceAccountId: context.sourceAccountId,
    targetAccountId: context.targetAccountId,
    expectedSourceLedgerRevision: context.sourceLedger.ledgerRevision,
    expectedTargetLedgerRevision: context.targetLedger.ledgerRevision,
    supersedesSourceEventId: context.sourceEvent.eventId,
    supersedesTargetEventId: context.targetEvent.eventId,
    source: { category: 'MANUAL', channel: 'desktop-cash-transfer', externalId },
    actorId: 'desktop-user',
    reason: input.reason,
  };
  return client.ledger.voidCashTransfer(command);
};

export const restoreManualCashTransfer = async (
  input: { event: TransferEvent; reason: string },
  client: CashOperationsClient = defaultClient(),
) => {
  const transfer = input.event.payload.transfer;
  if (!transfer) throw new Error('现金划转事件缺少关联信息。');
  const sourceAccountId =
    transfer.leg === 'OUTFLOW' ? input.event.accountId : transfer.counterpartyAccountId;
  const targetAccountId =
    transfer.leg === 'INFLOW' ? input.event.accountId : transfer.counterpartyAccountId;
  const [sourceLedger, targetLedger, sourceAudit, targetAudit] = await Promise.all([
    client.ledger.getEvents(sourceAccountId),
    client.ledger.getEvents(targetAccountId),
    client.ledger.getEventAudit(sourceAccountId),
    client.ledger.getEventAudit(targetAccountId),
  ]);
  const findFact = (events: typeof sourceAudit.events, leg: 'OUTFLOW' | 'INFLOW') =>
    events.find(
      (candidate): candidate is TransferEvent =>
        isActiveCashTransferEvent(candidate) &&
        candidate.payload.transfer.transferId === transfer.transferId &&
        candidate.payload.transfer.leg === leg,
    );
  const sourceFact = findFact(sourceAudit.events, 'OUTFLOW');
  const targetFact = findFact(targetAudit.events, 'INFLOW');
  const findTip = (events: typeof sourceAudit.events, factId: string | undefined) =>
    events
      .filter(
        (candidate): candidate is LedgerEventV2 =>
          isLedgerEventV2(candidate) && candidate.factId === factId,
      )
      .sort((left, right) => Number(left.ledgerRevision) - Number(right.ledgerRevision))
      .at(-1);
  const sourceTip = findTip(sourceAudit.events, sourceFact?.factId);
  const targetTip = findTip(targetAudit.events, targetFact?.factId);
  if (!sourceFact || !targetFact || !isVoidLedgerEvent(sourceTip) || !isVoidLedgerEvent(targetTip))
    throw new Error('划转两端当前并非已作废状态，请刷新审计链后重试。');
  const externalId = crypto.randomUUID();
  const occurredAt = input.event.occurredAt ?? new Date().toISOString();
  const timePrecision = input.event.timePrecision === 'DATE' ? 'DATE' : 'INSTANT';
  const command: RestoreCashTransferCommandV2 = {
    command: 'RESTORE_CASH_TRANSFER',
    transferId: transfer.transferId,
    sourceAccountId,
    targetAccountId,
    expectedSourceLedgerRevision: sourceLedger.ledgerRevision,
    expectedTargetLedgerRevision: targetLedger.ledgerRevision,
    supersedesSourceEventId: sourceTip.eventId,
    supersedesTargetEventId: targetTip.eventId,
    occurredAt,
    timePrecision,
    sourceTimezone: input.event.sourceTimezone,
    economicOrderKey: `desktop-cash-transfer-restore:${externalId}`,
    amount: input.event.payload.amount,
    currency: input.event.payload.currency,
    ...(input.event.payload.settledAt ? { settledAt: input.event.payload.settledAt } : {}),
    ...(input.event.payload.note ? { note: input.event.payload.note } : {}),
    source: { category: 'MANUAL', channel: 'desktop-cash-transfer', externalId },
    actorId: 'desktop-user',
    reason: input.reason,
  };
  return client.ledger.restoreCashTransfer(command);
};

export const fetchCashDepositPlans = (
  accountId: string,
  client: CashOperationsClient = defaultClient(),
): Promise<RecurringCashDepositPlan[]> => client.cashDeposits.getPlans({ accountId });

export const fetchCashDepositOccurrences = (
  accountId: string,
  client: CashOperationsClient = defaultClient(),
): Promise<RecurringCashDepositOccurrence[]> => client.cashDeposits.getOccurrences({ accountId });

export const createCashDepositPlan = (
  input: CreateRecurringCashDepositPlan,
  client: CashOperationsClient = defaultClient(),
) => client.cashDeposits.createPlan(input);

export const updateCashDepositPlan = (
  id: string,
  input: UpdateRecurringCashDepositPlan,
  client: CashOperationsClient = defaultClient(),
) => client.cashDeposits.updatePlan(id, input);

export const changeCashDepositPlanState = (
  id: string,
  action: 'pause' | 'resume' | 'end',
  expectedVersion: number,
  client: CashOperationsClient = defaultClient(),
) => {
  if (action === 'pause') return client.cashDeposits.pausePlan(id, expectedVersion);
  if (action === 'resume') return client.cashDeposits.resumePlan(id, expectedVersion);
  return client.cashDeposits.endPlan(id, expectedVersion);
};

export const confirmCashDepositOccurrence = (
  id: string,
  input: ConfirmRecurringCashDepositOccurrence,
  client: CashOperationsClient = defaultClient(),
) => client.cashDeposits.confirmOccurrence(id, input);

export const skipCashDepositOccurrence = (
  id: string,
  input: { expectedVersion: number; reason: string },
  client: CashOperationsClient = defaultClient(),
) => client.cashDeposits.skipOccurrence(id, input);

export const reopenCashDepositOccurrence = (
  id: string,
  expectedVersion: number,
  client: CashOperationsClient = defaultClient(),
) => client.cashDeposits.reopenOccurrence(id, expectedVersion);
