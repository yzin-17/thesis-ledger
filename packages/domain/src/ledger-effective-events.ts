import type { LedgerEvent } from './ledger-contract.js';

const compareLedgerEventOrder = (left: LedgerEvent, right: LedgerEvent) => {
  if (left.occurredAt === null && right.occurredAt !== null) return -1;
  if (left.occurredAt !== null && right.occurredAt === null) return 1;
  if (left.occurredAt !== right.occurredAt)
    return (left.occurredAt ?? '').localeCompare(right.occurredAt ?? '');
  return (
    left.economicOrderKey.localeCompare(right.economicOrderKey) ||
    left.eventId.localeCompare(right.eventId)
  );
};

export const compareLedgerEventRevision = (left: LedgerEvent, right: LedgerEvent) => {
  const leftRevision = BigInt(left.ledgerRevision);
  const rightRevision = BigInt(right.ledgerRevision);
  if (leftRevision === rightRevision) return left.eventId.localeCompare(right.eventId);
  if (leftRevision < rightRevision) return -1;
  return 1;
};

export const selectEffectiveLedgerEvents = (events: readonly LedgerEvent[]) => {
  const latestByFact = new Map<string, LedgerEvent>();
  for (const event of events) {
    const current = latestByFact.get(event.factId);
    if (!current || compareLedgerEventRevision(current, event) < 0)
      latestByFact.set(event.factId, event);
  }
  return [...latestByFact.values()]
    .filter((event) => event.revisionAction !== 'VOID')
    .sort(compareLedgerEventOrder);
};
