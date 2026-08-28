import { describe, expect, it, vi } from 'vitest';
import { ledgerEventEnvelopeSchemaV2, type LedgerEventV2 } from '@thesis-ledger/schemas';
import { LedgerQueryService } from '../../src/ledger/ledger-query.service.js';

const accountId = '11111111-1111-4111-8111-111111111111';

const event = ledgerEventEnvelopeSchemaV2.parse({
  version: 2,
  eventId: '22222222-2222-4222-8222-222222222222',
  factId: '33333333-3333-4333-8333-333333333333',
  accountId,
  ledgerRevision: '3',
  type: 'BUY_EXECUTION',
  occurredAt: '2026-08-26T02:30:00.000Z',
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'buy-1',
  recordedAt: '2026-08-26T02:31:00.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL', channel: 'desktop', externalId: 'buy-1' },
  actorId: 'user-1',
  revisionAction: 'CREATE',
  payload: {
    symbol: 'AAPL.US',
    quantity: '1.25',
    price: '205.30',
    currency: 'USD',
    capabilityVerification: 'VERIFIED',
    charges: [],
  },
});

const storedEvent = (value: LedgerEventV2) => ({
  id: value.eventId,
  accountId: value.accountId,
  type: value.type,
  occurredAt: value.occurredAt === null ? null : new Date(value.occurredAt),
  externalId: value.source.externalId ?? null,
  sourceRowId: null,
  createdAt: new Date(value.recordedAt),
  factId: value.factId,
  ledgerRevision: BigInt(value.ledgerRevision),
  timePrecision: value.timePrecision,
  sourceTimezone: value.sourceTimezone,
  economicOrderKey: value.economicOrderKey,
  recordedAt: new Date(value.recordedAt),
  projectionGeneration: 4n,
  payloadVersion: value.payloadVersion,
  payload: value.revisionAction === 'VOID' ? null : value.payload,
  sourceCategory: value.source.category,
  sourceChannel: value.source.channel,
  actorId: value.actorId,
  revisionAction: value.revisionAction,
  supersedesEventId: null,
  reason: null,
});

describe('Ledger 查询 API 服务', () => {
  it('有效事件读取返回账户版本，审计读取仅接受 V2 事件', async () => {
    const prisma = {
      account: { findUnique: vi.fn(async () => ({ id: accountId })) },
      accountLedgerState: {
        findUnique: vi.fn(async () => ({ ledgerRevision: 3n, projectionGeneration: 4n })),
      },
      ledgerEvent: { findMany: vi.fn(async () => [storedEvent(event)]) },
    };
    const repository = {
      readEffectiveEvents: vi.fn(async () => [event]),
    };
    const service = new LedgerQueryService(prisma as never, repository as never);

    await expect(service.effectiveEvents(accountId)).resolves.toMatchObject({
      ledgerRevision: '3',
      projectionGeneration: '4',
      effective: true,
      events: [{ payload: { quantity: '1.25' } }],
    });
    await expect(service.auditEvents(accountId, '3')).resolves.toMatchObject({
      asOfLedgerRevision: '3',
      effective: false,
      events: [
        expect.objectContaining({
          version: 2,
          payload: expect.objectContaining({ quantity: '1.25' }),
        }),
      ],
    });
  });

  it('审计重放要求 Revision 并只读取指定时点的有效链', async () => {
    const prisma = {
      account: { findUnique: vi.fn(async () => ({ id: accountId })) },
      accountLedgerState: {
        findUnique: vi.fn(async () => ({ ledgerRevision: 3n, projectionGeneration: 4n })),
      },
    };
    const repository = { readEffectiveEvents: vi.fn(async () => [event]) };
    const service = new LedgerQueryService(prisma as never, repository as never);

    await expect(service.replay(accountId, '2')).resolves.toMatchObject({
      asOfLedgerRevision: '2',
      replayed: true,
    });
    expect(repository.readEffectiveEvents).toHaveBeenCalledWith(accountId, '2');
  });
});
