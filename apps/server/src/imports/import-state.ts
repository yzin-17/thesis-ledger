import { createHash } from 'node:crypto';

export const stableBaselineHash = (events: unknown[]) => {
  const normalized = events.map((event) => {
    if (!event || typeof event !== 'object') return event;
    const item = event as Record<string, unknown>;
    return {
      id: item.id,
      type: item.type,
      occurredAt: item.occurredAt instanceof Date ? item.occurredAt.toISOString() : item.occurredAt,
      symbol: item.symbol,
      quantity: item.quantity === null ? null : Number(item.quantity ?? 0),
      price: item.price === null ? null : Number(item.price ?? 0),
      amount: item.amount === null ? null : Number(item.amount ?? 0),
      source: item.source,
      correctionOf: item.correctionOf,
      metadata: item.metadata,
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
