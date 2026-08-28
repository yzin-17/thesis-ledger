import { Prisma } from '@prisma/client';
import type { LedgerEventV2 } from '@thesis-ledger/domain';
import { latestLedgerEventByFact } from './ledger-event-v2.js';
import { toLedgerEventV2 } from './ledger-v2.repository.js';

Prisma.Decimal.set({ precision: 40 });

export type StoredCashEvent = {
  id: string;
  accountId: string;
  type: string;
  occurredAt?: Date | null;
  createdAt?: Date | null;
  currency?: string | null;
  quantity?: unknown;
  price?: unknown;
  amount?: unknown;
  fee?: unknown;
  tax?: unknown;
  metadata?: unknown;
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

const decimal = (value: unknown) => new Prisma.Decimal(decimalString(value));

const decimalString = (value: unknown) => {
  if (value === null || value === undefined) return '0';
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  return '0';
};

const metadataRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const occurredAt = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
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

const legacyOperations = (stored: StoredCashEvent[]): CashOperation[] =>
  stored
    .filter((event) => event.factId == null)
    .flatMap((event): CashOperation[] => {
      const metadata = metadataRecord(event.metadata);
      const currency = typeof event.currency === 'string' ? event.currency : 'CNY';
      const base = {
        accountId: event.accountId,
        currency,
        occurredAt: occurredAt(event.occurredAt),
        order: `${typeof event.economicOrderKey === 'string' ? event.economicOrderKey : ''}:${event.id}`,
        eventId: event.id,
        factId: event.id,
        sourceType: event.type,
      };
      if (event.type === 'ADJUSTMENT' && metadata.kind === 'cash-balance')
        return [{ ...base, set: decimal(metadata.amount ?? event.amount) }];
      if (event.type === 'CASH_DEPOSIT' || event.type === 'TRANSFER_IN')
        return [
          {
            ...base,
            delta: decimal(event.amount),
            settlement: {
              direction: 'RECEIVABLE' as const,
              amount: decimal(event.amount),
              settledAt: null,
              status: 'SETTLED' as const,
            },
          },
        ];
      if (event.type === 'CASH_WITHDRAW' || event.type === 'TRANSFER_OUT')
        return [
          {
            ...base,
            delta: decimal(event.amount).neg(),
            settlement: {
              direction: 'PAYABLE' as const,
              amount: decimal(event.amount),
              settledAt: null,
              status: 'SETTLED' as const,
            },
          },
        ];
      if (event.type === 'DIVIDEND' || event.type === 'INTEREST')
        return [
          {
            ...base,
            delta: decimal(event.amount),
            settlement: {
              direction: 'RECEIVABLE' as const,
              amount: decimal(event.amount),
              settledAt: null,
              status: 'SETTLED' as const,
            },
          },
        ];
      if (event.type === 'FEE' || event.type === 'TAX')
        return [
          {
            ...base,
            delta: decimal(event.amount).neg(),
            settlement: {
              direction: 'PAYABLE' as const,
              amount: decimal(event.amount),
              settledAt: null,
              status: 'SETTLED' as const,
            },
          },
        ];
      if (event.type === 'BUY' || event.type === 'SELL') {
        const gross = decimal(event.quantity).mul(decimal(event.price));
        const charges = decimal(event.fee).plus(decimal(event.tax));
        const amount = event.type === 'BUY' ? gross.plus(charges) : gross.minus(charges);
        return [
          {
            ...base,
            delta: event.type === 'BUY' ? amount.neg() : amount,
            settlement: {
              direction: event.type === 'BUY' ? ('PAYABLE' as const) : ('RECEIVABLE' as const),
              amount,
              settledAt: null,
              status: 'SETTLED' as const,
            },
          },
        ];
      }
      return [];
    });

const toStoredV2Event = (event: StoredCashEvent): LedgerEventV2 | undefined => {
  if (event.factId == null) return undefined;
  try {
    return toLedgerEventV2({
      id: event.id,
      accountId: event.accountId,
      type: event.type,
      factId: event.factId,
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
    }) as unknown as LedgerEventV2;
  } catch {
    return undefined;
  }
};

const v2Events = (stored: StoredCashEvent[]) =>
  stored.map(toStoredV2Event).filter((event): event is LedgerEventV2 => event !== undefined);

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
  const operations = [...legacyOperations(stored), ...v2Operations(stored)].sort(
    compareCashOperation,
  );
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
  const operations = [...legacyOperations(stored), ...v2Operations(stored, now)].sort(
    compareCashOperation,
  );
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
