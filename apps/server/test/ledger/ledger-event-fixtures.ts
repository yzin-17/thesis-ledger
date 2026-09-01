import { createHash } from 'node:crypto';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const fixtureUuid = (value: string) => {
  if (uuidPattern.test(value)) return value;
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};

type StoredV2EventInput = {
  id: string;
  accountId?: string;
  type: string;
  occurredAt?: Date | string | null;
  payload: unknown;
  factId?: string | null;
  ledgerRevision?: bigint | number | string | null;
  economicOrderKey?: string;
  revisionAction?: 'CREATE' | 'REPLACE' | 'VOID' | 'RESTORE';
  supersedesEventId?: string | null;
  reason?: string | null;
  externalId?: string | null;
  sourceChannel?: string;
  sourceCategory?: string;
  sourceRowId?: string | null;
};

export const storedV2Event = ({
  id,
  accountId = 'account-a',
  type,
  occurredAt = new Date('2025-01-01T00:00:00.000Z'),
  payload,
  factId = id,
  ledgerRevision = 1n,
  economicOrderKey = id,
  revisionAction = 'CREATE',
  supersedesEventId = null,
  reason = null,
  externalId = id,
  sourceChannel = 'test',
  sourceCategory = 'MANUAL',
  sourceRowId = null,
}: StoredV2EventInput) => {
  const recordedAt =
    occurredAt === null ? new Date('2025-01-01T00:00:00.000Z') : new Date(occurredAt);
  return {
    id: fixtureUuid(id),
    accountId: fixtureUuid(accountId),
    type,
    occurredAt: occurredAt === null ? null : new Date(occurredAt),
    createdAt: recordedAt,
    externalId,
    sourceRowId,
    factId: factId === null ? null : fixtureUuid(factId ?? id),
    ledgerRevision:
      typeof ledgerRevision === 'bigint' ? ledgerRevision : BigInt(ledgerRevision ?? 1),
    timePrecision: 'INSTANT',
    sourceTimezone: 'UTC',
    economicOrderKey,
    recordedAt,
    projectionGeneration: 0n,
    payloadVersion: 1,
    payload: revisionAction === 'VOID' ? null : payload,
    sourceCategory,
    sourceChannel,
    actorId: 'test-user',
    revisionAction,
    supersedesEventId:
      supersedesEventId === null || supersedesEventId === undefined
        ? supersedesEventId
        : fixtureUuid(supersedesEventId),
    reason,
  };
};

export const cashFlowEvent = ({
  id,
  accountId = 'account-a',
  amount,
  currency = 'CNY',
  direction = 'INFLOW',
  category = direction === 'INFLOW' ? 'DEPOSIT' : 'WITHDRAWAL',
  occurredAt,
  settledAt,
}: {
  id: string;
  accountId?: string;
  amount: string | number;
  currency?: string;
  direction?: 'INFLOW' | 'OUTFLOW';
  category?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'INTEREST' | 'FEE' | 'TAX';
  occurredAt?: Date | string;
  settledAt?: Date | string;
}) =>
  storedV2Event({
    id,
    accountId,
    type: 'CASH_FLOW',
    occurredAt: occurredAt ?? new Date('2025-01-01T00:00:00.000Z'),
    payload: {
      direction,
      category,
      amount: String(amount),
      currency,
      ...(settledAt ? { settledAt: new Date(settledAt).toISOString() } : {}),
    },
  });

export const cashBalanceEvent = ({
  id,
  accountId = 'account-a',
  amount,
  currency = 'CNY',
  occurredAt,
}: {
  id: string;
  accountId?: string;
  amount: string | number;
  currency?: string;
  occurredAt?: Date | string;
}) =>
  storedV2Event({
    id,
    accountId,
    type: 'CASH_BALANCE_OBSERVATION',
    occurredAt: occurredAt ?? new Date('2025-01-01T00:00:00.000Z'),
    payload: { amount: String(amount), currency },
  });

export const executionEvent = ({
  id,
  accountId = '11111111-1111-4111-8111-111111111111',
  type,
  quantity,
  price,
  symbol = '600519.SH',
  currency = 'CNY',
  occurredAt,
}: {
  id: string;
  accountId?: string;
  type: 'BUY_EXECUTION' | 'SELL_EXECUTION';
  quantity: string | number;
  price: string | number;
  symbol?: string;
  currency?: string;
  occurredAt?: Date | string;
}) =>
  storedV2Event({
    id,
    accountId,
    type,
    occurredAt: occurredAt ?? new Date('2025-01-01T00:00:00.000Z'),
    payload: {
      symbol,
      quantity: String(quantity),
      price: String(price),
      currency,
      capabilityVerification: 'VERIFIED',
      charges: [],
    },
  });
