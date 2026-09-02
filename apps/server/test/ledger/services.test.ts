import { describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../../src/ledger/ledger.service.js';
import { projectCashBalances } from '../../src/ledger/cash-projection.js';
import { executionEvent } from './ledger-event-fixtures.js';

describe('Ledger Service', () => {
  it('rebuild 更新现有投影时保留 Position ID', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => data);
    const update = vi.fn(async ({ data }: { data: object }) => data);
    const remove = vi.fn(async () => undefined);
    const ledgerEvent = {
      findMany: vi.fn(async () => [
        executionEvent({ id: 'buy', type: 'BUY_EXECUTION', quantity: '100', price: '10' }),
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
    const result = await new LedgerService(prisma as never, {} as never).rebuild(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result[0]).toMatchObject({ quantity: '100', averageCost: '10' });
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
          executionEvent({ id: 'buy-1', type: 'BUY_EXECUTION', quantity: '100', price: '10' }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          executionEvent({ id: 'buy-2', type: 'BUY_EXECUTION', quantity: '80', price: '12' }),
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
    const service = new LedgerService(prisma as never, {} as never);

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

  it('现金读取使用 V2 事件并保留十进制精度', () => {
    const balances = projectCashBalances([
      {
        id: '33333333-3333-4333-8333-333333333333',
        accountId: '11111111-1111-4111-8111-111111111111',
        type: 'CASH_FLOW',
        factId: '22222222-2222-4222-8222-222222222222',
        ledgerRevision: 1n,
        occurredAt: new Date('2026-08-20T01:00:00.000Z'),
        timePrecision: 'INSTANT',
        sourceTimezone: 'UTC',
        economicOrderKey: 'cash-flow:1',
        recordedAt: new Date('2026-08-20T01:00:01.000Z'),
        payloadVersion: 1,
        payload: {
          direction: 'INFLOW',
          category: 'DEPOSIT',
          amount: '9007199254740993.12345678',
          currency: 'USD',
        },
        sourceCategory: 'MANUAL',
        sourceChannel: 'manual',
        externalId: null,
        actorId: 'user-1',
        revisionAction: 'CREATE',
        supersedesEventId: null,
        reason: null,
      },
    ]);

    expect(balances.get('11111111-1111-4111-8111-111111111111')?.get('USD')?.toString()).toBe(
      '9007199254740993.12345678',
    );
  });

  it('现金余额写入保留显式原币种', async () => {
    const appendRevision = vi.fn(async (_context: unknown, event: unknown) => event);
    const withAccountWrite = vi.fn(
      async (_accountId: string, callback: (context: unknown) => unknown) =>
        callback({
          transaction: {
            account: {
              findUnique: vi.fn(async () => ({ active: true, currency: 'HKD', type: 'cash' })),
            },
          },
          nextLedgerRevision: 1n,
          nextProjectionGeneration: 1n,
        }),
    );
    const service = new LedgerService({} as never, { appendRevision, withAccountWrite } as never);
    vi.spyOn(service as never, 'rebuildWithClient' as never).mockResolvedValue(undefined);

    await service.setCashBalance('account-1', '12.50', 'manual', 'HKD');

    expect(appendRevision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'CASH_BALANCE_OBSERVATION',
        payload: { currency: 'HKD', amount: '12.50', capturedAt: expect.any(String) },
      }),
    );
  });
});
