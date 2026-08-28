import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const draftLedgerEventPrefix = (draftId: string) => `draft:${draftId}:`;

export const stableBaselineHash = (events: unknown[]) => {
  const decimalValue = (value: unknown) => {
    if (value === null) return null;
    if (value === undefined) return '0';
    if (value instanceof Prisma.Decimal) return value.toString();
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')
      return String(value);
    return JSON.stringify(value);
  };
  const normalized = events.map((event) => {
    if (!event || typeof event !== 'object') return event;
    const item = event as Record<string, unknown>;
    return {
      id: item.id,
      type: item.type,
      occurredAt: item.occurredAt instanceof Date ? item.occurredAt.toISOString() : item.occurredAt,
      factId: item.factId,
      ledgerRevision: decimalValue(item.ledgerRevision),
      sourceRowId: item.sourceRowId,
      payloadVersion: item.payloadVersion,
      payload: item.payload,
      sourceCategory: item.sourceCategory,
      sourceChannel: item.sourceChannel,
      externalId: item.externalId,
      actorId: item.actorId,
      revisionAction: item.revisionAction,
      supersedesEventId: item.supersedesEventId,
      reason: item.reason,
    };
  }) as Array<Record<string, unknown>>;
  return createHash('sha256')
    .update(JSON.stringify(normalized.sort((a, b) => String(a.id).localeCompare(String(b.id)))))
    .digest('hex');
};

export const readLedgerEvents = async (client: unknown, accountId: string) => {
  const delegate = (
    client as { ledgerEvent?: { findMany?: (args: unknown) => Promise<unknown[]> } }
  ).ledgerEvent;
  if (!delegate || typeof delegate.findMany !== 'function') return [];
  return delegate.findMany({
    where: { accountId },
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  });
};

export const readAccount = async (client: unknown, accountId: string) => {
  const delegate = (
    client as {
      account?: { findUnique?: (args: unknown) => Promise<Record<string, unknown> | null> };
    }
  ).account;
  if (!delegate || typeof delegate.findUnique !== 'function') return null;
  return delegate.findUnique({ where: { id: accountId } });
};
