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
  it('rebuild 更新现有投影时保留 Position ID', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => data);
    const update = vi.fn(async ({ data }: { data: object }) => data);
    const remove = vi.fn(async () => undefined);
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
    const transaction = {
      ledgerEvent,
      position: {
        findMany: vi.fn(async () => [{ id: 'position-1', symbol: '600519.SH' }]),
        update,
        delete: remove,
        create,
      },
    };
    const prisma = {
      ledgerEvent,
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const result = await new LedgerService(prisma as never).rebuild(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result[0]).toMatchObject({ quantity: 100, averageCost: 10 });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: expect.objectContaining({ source: 'ledger' }),
    });
    expect(remove).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('清仓后重建同一标的会删除旧 Position 并创建新生命周期', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => data);
    const update = vi.fn(async ({ data }: { data: object }) => data);
    const remove = vi.fn(async () => undefined);
    const ledgerEvent = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'buy-1',
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
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'buy-2',
            accountId: '11111111-1111-4111-8111-111111111111',
            type: 'BUY',
            occurredAt: new Date('2025-01-02'),
            symbol: '600519.SH',
            quantity: 80,
            price: 12,
            amount: null,
            fee: 0,
            tax: 0,
          },
        ]),
    };
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'position-old', symbol: '600519.SH' }])
      .mockResolvedValueOnce([{ id: 'position-old', symbol: '600519.SH' }])
      .mockResolvedValueOnce([]);
    const transaction = {
      ledgerEvent,
      position: { findMany, update, delete: remove, create },
    };
    const prisma = {
      ledgerEvent,
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const service = new LedgerService(prisma as never);

    await service.rebuild('11111111-1111-4111-8111-111111111111');
    await service.rebuild('11111111-1111-4111-8111-111111111111');
    await service.rebuild('11111111-1111-4111-8111-111111111111');

    expect(remove).toHaveBeenCalledWith({ where: { id: 'position-old' } });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: '11111111-1111-4111-8111-111111111111',
        symbol: '600519.SH',
        source: 'ledger',
      }),
    });
  });
});
