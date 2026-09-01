import { Prisma } from '@prisma/client';
import type { LedgerEventV2 } from '@thesis-ledger/domain';
import {
  legacyMigratedCashTransferEventSchemaV2,
  type LegacyMigratedCashTransferEventV2,
} from '@thesis-ledger/schemas';
import { latestLedgerEventByFact } from './ledger-event-v2.js';
import { toLedgerEventV2 } from './ledger-v2.repository.js';

Prisma.Decimal.set({ precision: 40 });

export type StoredCashEvent = {
  id: string;
  accountId: string;
  type: string;
  occurredAt?: Date | null;
  createdAt?: Date | null;
  factId?: string | null;
  ledgerRevision?: bigint | null;
  timePrecision?: string | null;
  sourceTimezone?: string | null;
  economicOrderKey?: string | null;
  recordedAt?: Date;
  payloadVersion?: number | null;
  payload?: Prisma.JsonValue;
  sourceCategory?: string | null;
  sourceChannel?: string | null;
  externalId?: string | null;
  sourceRowId?: string | null;
  actorId?: string | null;
  revisionAction?: string | null;
  supersedesEventId?: string | null;
  reason?: string | null;
};

type CashOperation = {
  accountId: string;
  currency: string;
  occurredAt: string | null;
  order: string;
  eventId?: string;
  factId?: string;
  sourceType?: string;
  issues?: string[];
  set?: Prisma.Decimal;
  delta?: Prisma.Decimal;
  settlement?: {
    direction: 'RECEIVABLE' | 'PAYABLE';
    amount: Prisma.Decimal;
    settledAt: string | null;
    status: 'SETTLED' | 'PENDING';
  };
};

export type CashMaterializedBalance = {
  accountId: string;
  currency: string;
  settledAmount: Prisma.Decimal;
  pendingReceivable: Prisma.Decimal;
  pendingPayable: Prisma.Decimal;
  completeness: 'COMPLETE' | 'PARTIAL';
  issues: string[];
};

export type CashMaterializedSettlement = {
  accountId: string;
  eventId: string;
  factId: string;
  currency: string;
  direction: 'RECEIVABLE' | 'PAYABLE';
  amount: Prisma.Decimal;
  occurredAt: string | null;
  settledAt: string | null;
  status: 'SETTLED' | 'PENDING';
  sourceType: string;
};

export type CashProjectionMaterialization = {
  balances: CashMaterializedBalance[];
  settlements: CashMaterializedSettlement[];
};

const LEGACY_LEDGER_MIGRATION_ACTOR = 'migration:legacy-ledger-v2';

type CashProjectionEvent = LedgerEventV2 | LegacyMigratedCashTransferEventV2;

const decimal = (value: unknown) => new Prisma.Decimal(decimalString(value));

const decimalString = (value: unknown) => {
  if (value === null || value === undefined) return '0';
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  return '0';
};

const compareCashOperation = (left: CashOperation, right: CashOperation) => {
  if (left.occurredAt === null && right.occurredAt !== null) return -1;
  if (left.occurredAt !== null && right.occurredAt === null) return 1;
  if (left.occurredAt !== right.occurredAt)
    return (left.occurredAt ?? '').localeCompare(right.occurredAt ?? '');
  return left.order.localeCompare(right.order);
};

const settledStatus = (settledAt: string | undefined, now: Date) => {
  if (settledAt === undefined) return 'SETTLED' as const;
  return new Date(settledAt) > now ? ('PENDING' as const) : ('SETTLED' as const);
};

const settlement = (input: {
  amount: Prisma.Decimal;
  direction: 'RECEIVABLE' | 'PAYABLE';
  settledAt: string | undefined;
  now: Date;
}) => ({
  direction: input.direction,
  amount: input.amount,
  settledAt: input.settledAt ?? null,
  status: settledStatus(input.settledAt, input.now),
});

const storedEventInput = (event: StoredCashEvent) => ({
  id: event.id,
  accountId: event.accountId,
  type: event.type,
  factId: event.factId ?? null,
  ledgerRevision: event.ledgerRevision ?? null,
  occurredAt: event.occurredAt ?? null,
  timePrecision: event.timePrecision ?? null,
  sourceTimezone: event.sourceTimezone ?? null,
  economicOrderKey: event.economicOrderKey ?? null,
  recordedAt: event.recordedAt ?? event.createdAt ?? new Date(0),
  payloadVersion: event.payloadVersion ?? null,
  payload: event.payload ?? {},
  sourceCategory: event.sourceCategory ?? null,
  sourceChannel: event.sourceChannel ?? null,
  externalId: event.externalId ?? null,
  sourceRowId: event.sourceRowId ?? null,
  actorId: event.actorId ?? null,
  revisionAction: event.revisionAction ?? null,
  supersedesEventId: event.supersedesEventId ?? null,
  reason: event.reason ?? null,
});

const normalizedStoredOccurredAt = (event: StoredCashEvent) => {
  if (event.occurredAt === null || event.occurredAt === undefined) return null;
  const value = event.occurredAt.toISOString();
  if (event.timePrecision === 'DATE') return value.slice(0, 10);
  return value;
};

const storedEnvelopeInput = (event: StoredCashEvent) => ({
  version: 2,
  eventId: event.id,
  factId: event.factId,
  accountId: event.accountId,
  ledgerRevision: event.ledgerRevision?.toString(),
  type: event.type,
  occurredAt: normalizedStoredOccurredAt(event),
  timePrecision: event.timePrecision,
  sourceTimezone: event.sourceTimezone,
  economicOrderKey: event.economicOrderKey,
  recordedAt: (event.recordedAt ?? event.createdAt ?? new Date(0)).toISOString(),
  payloadVersion: event.payloadVersion,
  source: {
    category: event.sourceCategory,
    channel: event.sourceChannel,
    ...(event.externalId === null || event.externalId === undefined
      ? {}
      : { externalId: event.externalId }),
    ...(event.sourceRowId === null || event.sourceRowId === undefined
      ? {}
      : { sourceRowId: event.sourceRowId }),
  },
  actorId: event.actorId,
  revisionAction: event.revisionAction,
  ...(event.supersedesEventId === null || event.supersedesEventId === undefined
    ? {}
    : { supersedesEventId: event.supersedesEventId }),
  ...(event.reason === null || event.reason === undefined ? {} : { reason: event.reason }),
  payload: event.payload ?? {},
});

type ParsedLedgerEventV2 = ReturnType<typeof toLedgerEventV2>;

const normalizeEventSource = (source: ParsedLedgerEventV2['source']) => ({
  category: source.category,
  channel: source.channel,
  ...(source.externalId === undefined ? {} : { externalId: source.externalId }),
  ...(source.draftId === undefined ? {} : { draftId: source.draftId }),
  ...(source.sourceRowId === undefined ? {} : { sourceRowId: source.sourceRowId }),
});

const normalizeRevisionFields = (
  supersedesEventId: string | undefined,
  reason: string | undefined,
) => ({
  ...(supersedesEventId === undefined ? {} : { supersedesEventId }),
  ...(reason === undefined ? {} : { reason }),
});

type ParsedExecutionCharge = Extract<
  ParsedLedgerEventV2,
  { type: 'BUY_EXECUTION' | 'SELL_EXECUTION' }
>['payload']['charges'][number];

const normalizeExecutionCharge = (
  charge: ParsedExecutionCharge,
) => ({
  category: charge.category,
  amount: charge.amount,
  currency: charge.currency,
  ...(charge.description === undefined ? {} : { description: charge.description }),
});

const normalizeExecutionPayload = (
  payload: Extract<ParsedLedgerEventV2, { type: 'BUY_EXECUTION' | 'SELL_EXECUTION' }>['payload'],
) => {
  const { settledAt, note, charges, ...base } = payload;
  return {
    ...base,
    charges: charges.map(normalizeExecutionCharge),
    ...(settledAt === undefined ? {} : { settledAt }),
    ...(note === undefined ? {} : { note }),
  };
};

const normalizePositionBaselinePayload = (
  payload: Extract<ParsedLedgerEventV2, { type: 'POSITION_BASELINE_OBSERVATION' }>['payload'],
) => {
  const { averageCost, capturedAt, ...base } = payload;
  return {
    ...base,
    ...(averageCost === undefined ? {} : { averageCost }),
    ...(capturedAt === undefined ? {} : { capturedAt }),
  };
};

const normalizeCashBalancePayload = (
  payload: Extract<ParsedLedgerEventV2, { type: 'CASH_BALANCE_OBSERVATION' }>['payload'],
) => {
  const { capturedAt, ...base } = payload;
  return { ...base, ...(capturedAt === undefined ? {} : { capturedAt }) };
};

const normalizeDividendPayload = (
  payload: Extract<ParsedLedgerEventV2, { type: 'DIVIDEND' }>['payload'],
) => {
  const { settledAt, ...base } = payload;
  return { ...base, ...(settledAt === undefined ? {} : { settledAt }) };
};

const normalizeCashFlowPayload = (
  payload: Extract<ParsedLedgerEventV2, { type: 'CASH_FLOW' }>['payload'],
) => {
  const { settledAt, note, transfer, ...base } = payload;
  return {
    ...base,
    ...(settledAt === undefined ? {} : { settledAt }),
    ...(note === undefined ? {} : { note }),
    ...(transfer === undefined ? {} : { transfer }),
  };
};

const normalizeLedgerEventV2 = (event: ParsedLedgerEventV2): LedgerEventV2 => {
  if (event.revisionAction === 'VOID') {
    const { source, ...base } = event;
    return {
      ...base,
      source: normalizeEventSource(source),
    };
  }
  if (event.type === 'BUY_EXECUTION' || event.type === 'SELL_EXECUTION') {
    const { source, payload, supersedesEventId, reason, ...base } = event;
    return {
      ...base,
      source: normalizeEventSource(source),
      payload: normalizeExecutionPayload(payload),
      ...normalizeRevisionFields(supersedesEventId, reason),
    };
  }
  if (event.type === 'POSITION_BASELINE_OBSERVATION') {
    const { source, payload, supersedesEventId, reason, ...base } = event;
    return {
      ...base,
      source: normalizeEventSource(source),
      payload: normalizePositionBaselinePayload(payload),
      ...normalizeRevisionFields(supersedesEventId, reason),
    };
  }
  if (event.type === 'CASH_BALANCE_OBSERVATION') {
    const { source, payload, supersedesEventId, reason, ...base } = event;
    return {
      ...base,
      source: normalizeEventSource(source),
      payload: normalizeCashBalancePayload(payload),
      ...normalizeRevisionFields(supersedesEventId, reason),
    };
  }
  if (event.type === 'DIVIDEND') {
    const { source, payload, supersedesEventId, reason, ...base } = event;
    return {
      ...base,
      source: normalizeEventSource(source),
      payload: normalizeDividendPayload(payload),
      ...normalizeRevisionFields(supersedesEventId, reason),
    };
  }
  if (event.type === 'CASH_FLOW') {
    const { source, payload, supersedesEventId, reason, ...base } = event;
    return {
      ...base,
      source: normalizeEventSource(source),
      payload: normalizeCashFlowPayload(payload),
      ...normalizeRevisionFields(supersedesEventId, reason),
    };
  }
  if (event.type === 'BASELINE_RECONCILIATION') {
    const { source, payload, supersedesEventId, reason, ...base } = event;
    return {
      ...base,
      source: normalizeEventSource(source),
      payload,
      ...normalizeRevisionFields(supersedesEventId, reason),
    };
  }
  if (event.type === 'BONUS_SHARE') {
    const { source, payload, supersedesEventId, reason, ...base } = event;
    return {
      ...base,
      source: normalizeEventSource(source),
      payload,
      ...normalizeRevisionFields(supersedesEventId, reason),
    };
  }
  if (event.type === 'SPLIT' || event.type === 'MERGE') {
    const { source, payload, supersedesEventId, reason, ...base } = event;
    return {
      ...base,
      source: normalizeEventSource(source),
      payload,
      ...normalizeRevisionFields(supersedesEventId, reason),
    };
  }
  throw new Error('无法规范化未知账本事件类型');
};

const legacyMigratedCashTransfer = (
  event: StoredCashEvent,
): LegacyMigratedCashTransferEventV2 | undefined => {
  // The historical migration preserves the original source category, so its actor marker is the
  // canonical discriminator for this read-only compatibility path.
  if (
    event.type !== 'CASH_FLOW' ||
    event.payloadVersion !== 1 ||
    event.revisionAction !== 'CREATE' ||
    event.actorId !== LEGACY_LEDGER_MIGRATION_ACTOR
  )
    return undefined;
  const parsed = legacyMigratedCashTransferEventSchemaV2.safeParse(storedEnvelopeInput(event));
  return parsed.success ? parsed.data : undefined;
};

class CashProjectionEventError extends Error {
  constructor(eventId: string, cause: unknown) {
    super(
      `现金投影无法解析账本事件 ${eventId}: ${cause instanceof Error ? cause.message : '事件载荷无效'}`,
    );
    this.name = 'CashProjectionEventError';
  }
}

const toStoredV2Event = (event: StoredCashEvent): CashProjectionEvent | undefined => {
  if (event.factId == null) return undefined;
  const input = storedEventInput(event);
  try {
    return normalizeLedgerEventV2(toLedgerEventV2(input));
  } catch (error) {
    const legacy = legacyMigratedCashTransfer(event);
    if (legacy) return legacy;
    throw new CashProjectionEventError(event.id, error);
  }
};

const v2Events = (stored: StoredCashEvent[]) =>
  stored.map(toStoredV2Event).filter((event): event is CashProjectionEvent => event !== undefined);

type ExecutionEvent = Extract<LedgerEventV2, { type: 'BUY_EXECUTION' | 'SELL_EXECUTION' }>;

const executionCashOperations = (event: ExecutionEvent, now: Date): CashOperation[] => {
  const base = {
    accountId: event.accountId,
    occurredAt: event.occurredAt,
    order: `${event.economicOrderKey}:${event.eventId}`,
    eventId: event.eventId,
    factId: event.factId,
    sourceType: event.type,
  };
  const charges = event.payload.charges;
  const sameCurrencyCharges = charges.reduce(
    (total, charge) =>
      charge.currency === event.payload.currency ? total.plus(decimal(charge.amount)) : total,
    new Prisma.Decimal(0),
  );
  const gross = decimal(event.payload.quantity).mul(decimal(event.payload.price));
  const amount =
    event.type === 'BUY_EXECUTION'
      ? gross.plus(sameCurrencyCharges)
      : gross.minus(sameCurrencyCharges);
  const hasCurrencyMismatch = charges.some((charge) => charge.currency !== event.payload.currency);
  const operations: CashOperation[] = [
    {
      ...base,
      currency: event.payload.currency,
      delta: event.type === 'BUY_EXECUTION' ? amount.neg() : amount,
      ...(hasCurrencyMismatch ? { issues: ['FEE_CURRENCY_MISMATCH'] } : {}),
      settlement: settlement({
        amount,
        direction: event.type === 'BUY_EXECUTION' ? 'PAYABLE' : 'RECEIVABLE',
        settledAt: event.payload.settledAt,
        now,
      }),
    },
  ];
  for (const [index, charge] of charges.entries()) {
    if (charge.currency === event.payload.currency) continue;
    const chargeAmount = decimal(charge.amount);
    operations.push({
      ...base,
      currency: charge.currency,
      order: `${base.order}:charge:${String(index).padStart(6, '0')}`,
      factId: `${event.factId}:charge:${index}`,
      delta: chargeAmount.neg(),
      issues: ['FEE_CURRENCY_MISMATCH'],
      settlement: settlement({
        amount: chargeAmount,
        direction: 'PAYABLE',
        settledAt: event.payload.settledAt,
        now,
      }),
    });
  }
  return operations;
};

const v2Operations = (stored: StoredCashEvent[], now = new Date()): CashOperation[] => {
  const candidates = stored.filter((event) => event.factId != null);
  if (candidates.length === 0) return [];
  const valid = v2Events(candidates);
  const tips = latestLedgerEventByFact(valid);
  const operations: CashOperation[] = [];
  for (const event of tips.values()) {
    if (event.revisionAction === 'VOID') continue;
    const base = {
      accountId: event.accountId,
      occurredAt: event.occurredAt,
      order: `${event.economicOrderKey}:${event.eventId}`,
      eventId: event.eventId,
      factId: event.factId,
      sourceType: event.type,
    };
    if (event.type === 'CASH_BALANCE_OBSERVATION') {
      operations.push({
        ...base,
        currency: event.payload.currency,
        set: decimal(event.payload.amount),
      });
      continue;
    }
    if (event.type === 'CASH_FLOW') {
      const amount = decimal(event.payload.amount);
      const inflow = event.payload.direction === 'INFLOW';
      operations.push({
        ...base,
        currency: event.payload.currency,
        delta: inflow ? amount : amount.neg(),
        settlement: settlement({
          amount,
          direction: inflow ? 'RECEIVABLE' : 'PAYABLE',
          settledAt: event.payload.settledAt,
          now,
        }),
      });
      continue;
    }
    if (event.type === 'BUY_EXECUTION' || event.type === 'SELL_EXECUTION') {
      operations.push(...executionCashOperations(event, now));
      continue;
    }
    if (event.type === 'DIVIDEND') {
      const amount = decimal(event.payload.amount);
      operations.push({
        ...base,
        currency: event.payload.currency,
        delta: amount,
        settlement: settlement({
          amount,
          direction: 'RECEIVABLE',
          settledAt: event.payload.settledAt,
          now,
        }),
      });
    }
  }
  return operations;
};

export const projectCashBalances = (stored: StoredCashEvent[]) => {
  const balances = new Map<string, Map<string, Prisma.Decimal>>();
  const operations = v2Operations(stored).sort(compareCashOperation);
  for (const operation of operations) {
    const byCurrency = balances.get(operation.accountId) ?? new Map<string, Prisma.Decimal>();
    const current = byCurrency.get(operation.currency) ?? new Prisma.Decimal(0);
    byCurrency.set(
      operation.currency,
      operation.set === undefined ? current.plus(operation.delta ?? 0) : operation.set,
    );
    balances.set(operation.accountId, byCurrency);
  }
  return balances;
};

export const projectCashMaterialization = (
  stored: StoredCashEvent[],
  now = new Date(),
): CashProjectionMaterialization => {
  const balances = new Map<string, CashMaterializedBalance & { issueSet: Set<string> }>();
  const operations = v2Operations(stored, now).sort(compareCashOperation);
  const settlements: CashMaterializedSettlement[] = [];
  for (const operation of operations) {
    const key = `${operation.accountId}:${operation.currency}`;
    const current = balances.get(key) ?? {
      accountId: operation.accountId,
      currency: operation.currency,
      settledAmount: new Prisma.Decimal(0),
      pendingReceivable: new Prisma.Decimal(0),
      pendingPayable: new Prisma.Decimal(0),
      completeness: 'COMPLETE' as const,
      issues: [],
      issueSet: new Set<string>(),
    };
    if (operation.set !== undefined) {
      current.settledAmount = operation.set;
    } else if (operation.delta !== undefined) {
      const cashSettlement = operation.settlement;
      if (cashSettlement?.status === 'PENDING') {
        if (cashSettlement.direction === 'RECEIVABLE')
          current.pendingReceivable = current.pendingReceivable.plus(cashSettlement.amount);
        else current.pendingPayable = current.pendingPayable.plus(cashSettlement.amount);
      } else current.settledAmount = current.settledAmount.plus(operation.delta);
      if (cashSettlement && operation.eventId && operation.factId && operation.sourceType)
        settlements.push({
          accountId: operation.accountId,
          eventId: operation.eventId,
          factId: operation.factId,
          currency: operation.currency,
          direction: cashSettlement.direction,
          amount: cashSettlement.amount,
          occurredAt: operation.occurredAt,
          settledAt: cashSettlement.settledAt,
          status: cashSettlement.status,
          sourceType: operation.sourceType,
        });
    }
    for (const issue of operation.issues ?? []) current.issueSet.add(issue);
    current.issues = [...current.issueSet].sort();
    current.completeness = current.issues.length === 0 ? 'COMPLETE' : 'PARTIAL';
    balances.set(key, current);
  }
  return {
    balances: [...balances.values()]
      .map((value) => {
        const { issueSet, ...balance } = value;
        void issueSet;
        return balance;
      })
      .sort(
        (left, right) =>
          left.accountId.localeCompare(right.accountId) ||
          left.currency.localeCompare(right.currency),
      ),
    settlements,
  };
};
