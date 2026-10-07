import { ledgerEventEnvelopeSchema, type LedgerEvent } from '@thesis-ledger/schemas';

export const accountId = '11111111-1111-4111-8111-111111111111';

export const knownEvent = ledgerEventEnvelopeSchema.parse({
  version: 3,
  eventId: '33333333-3333-4333-8333-333333333333',
  factId: '44444444-4444-4444-8444-444444444444',
  accountId,
  ledgerRevision: '1',
  type: 'BUY_EXECUTION',
  occurredAt: '2026-08-20T01:00:00.000Z',
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'a0',
  recordedAt: '2026-08-20T01:00:01.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL', channel: 'desktop', externalId: 'known-buy' },
  actorId: 'user-1',
  revisionAction: 'CREATE',
  payload: {
    symbol: '0700.HK',
    quantity: '10',
    price: '500',
    currency: 'HKD',
    capabilityVerification: 'VERIFIED',
    charges: [],
  },
});

export const storedFromEvent = (event: LedgerEvent) => ({
  id: event.eventId,
  accountId: event.accountId,
  type: event.type,
  occurredAt: event.occurredAt === null ? null : new Date(event.occurredAt),
  factId: event.factId,
  ledgerRevision: BigInt(event.ledgerRevision),
  timePrecision: event.timePrecision,
  sourceTimezone: event.sourceTimezone,
  economicOrderKey: event.economicOrderKey,
  recordedAt: new Date(event.recordedAt),
  envelopeVersion: 3,
  payloadVersion: event.payloadVersion,
  payload: event.revisionAction === 'VOID' ? null : event.payload,
  sourceCategory: event.source.category,
  sourceChannel: event.source.channel,
  externalId: event.source.externalId ?? null,
  sourceRowId: event.source.sourceRowId ?? null,
  actorId: event.actorId,
  revisionAction: event.revisionAction,
  supersedesEventId: event.supersedesEventId ?? null,
  reason: event.reason ?? null,
});
