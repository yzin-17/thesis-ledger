import { describe, expect, it, vi } from 'vitest';
import { LedgerService, appendLedgerEvent } from '../../src/ledger/ledger.service.js';

describe('Ledger Service', () => {
  it('externalUid upsert 提供幂等事件写入', async () => {
    const upsert = vi.fn(async ({ where }: { where: object }) => where);
    await appendLedgerEvent({ ledgerEvent: { upsert } } as never, {
      version: 1,
      id: '11111111-1111-4111-8111-111111111115',
      accountId: '11111111-1111-4111-8111-111111111111',
      type: 'CASH_DEPOSIT',
      amount: 1000,
      occurredAt: '2025-01-01T00:00:00Z',
      source: 'manual',
      externalUid: 'bank-1',
      currency: 'CNY',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId_externalId: {
            accountId: '11111111-1111-4111-8111-111111111111',
            externalId: 'bank-1',
          },
        },
        update: {},
      }),
    );
  });
  it('rebuild 先清空旧投影再写入 Ledger 投影', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => data);
    const ledgerEvent = {
      findMany: vi.fn(async () => [
        {
          id: 'buy',
          accountId: '11111111-1111-4111-8111-111111111111',
          type: 'BUY',
          occurredAt: new Date('2025-01-01'),
          symbol: '600519.SH',
          quantity: 100,
          price: 10,
          amount: null,
          fee: 0,
          tax: 0,
        },
      ]),
    };
    const transaction = { ledgerEvent, position: { deleteMany: vi.fn(), create } };
    const prisma = {
      ledgerEvent,
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const result = await new LedgerService(prisma as never).rebuild(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result[0]).toMatchObject({ quantity: 100, averageCost: 10 });
    expect(transaction.position.deleteMany).toHaveBeenCalledWith({
      where: { accountId: '11111111-1111-4111-8111-111111111111' },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'ledger' }) }),
    );
  });
});
