import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { TradeChartQueryService } from '../../src/ledger/trade-chart-query.service.js';

const request = {
  accountId: '90000000-0000-4000-8000-000000000001',
  mode: 'actual' as const,
  symbol: 'SPY.US',
  start: '2026-11-04',
  end: '2026-11-04',
};
const row = (id: string, occurredAt = '2026-11-04T15:00:00Z') => ({
  id,
  eventId: `event-${id}`,
  factId: `fact-${id}`,
  occurredAt: new Date(occurredAt),
  currency: 'USD',
  price: new Prisma.Decimal('100.125'),
  quantity: new Prisma.Decimal('2'),
  trade: { projectionGeneration: 2n },
});
function setup() {
  const tx = {
    account: { findUnique: vi.fn(async () => ({ mode: 'actual' })) },
    accountLedgerState: {
      findUnique: vi.fn(async () => ({ ledgerRevision: 4n, projectionGeneration: 2n })),
    },
    tradeEntryLeg: {
      findMany: vi.fn<(input: unknown) => Promise<ReturnType<typeof row>[]>>(() => Promise.resolve([row('buy')])),
      count: vi.fn(async () => 0),
    },
    tradeCloseSlice: { findMany: vi.fn(async () => [row('sell')]), count: vi.fn(async () => 0) },
    ledgerEvent: {
      findMany: vi.fn(async () => [
        { id: 'event-buy', timePrecision: 'INSTANT' },
        { id: 'event-sell', timePrecision: 'INSTANT' },
      ]),
    },
  };
  const prisma = { $transaction: vi.fn(async (read: (client: typeof tx) => unknown) => read(tx)) };
  return { service: new TradeChartQueryService(prisma as never), tx, prisma };
}

describe('成交图表只读投影', () => {
  it('场外基金按完整代码、账户模式和净值日期窗口读取原始成交', async () => {
    const { service, tx } = setup();
    tx.tradeEntryLeg.findMany.mockResolvedValue([{ ...row('buy', '2026-11-04T02:00:00Z'), currency: 'CNY' }]);
    tx.tradeCloseSlice.findMany.mockResolvedValue([]);
    const result = await service.read({ ...request, symbol: '000001.OF' });
    expect(result).toMatchObject({ status: 'ready', symbol: '000001.OF', markers: [{ tradingDate: '2026-11-04', currency: 'CNY', price: '100.125', quantity: '2' }] });
    expect(tx.tradeEntryLeg.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ trade: expect.objectContaining({ accountId: request.accountId, accountMode: 'actual', symbol: '000001.OF' }) }) }));
  });
  it('账户／模式、代次和原始成交值在同一一致事务内绑定', async () => {
    const { service, tx, prisma } = setup();
    const result = await service.read(request);
    expect(result).toMatchObject({
      status: 'ready',
      ...request,
      ledgerRevision: '4',
      projectionGeneration: '2',
      markers: [
        {
          side: 'buy',
          price: '100.125',
          quantity: '2',
          currency: 'USD',
          tradingDate: '2026-11-04',
        },
        { side: 'sell', price: '100.125', quantity: '2' },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(tx.tradeEntryLeg.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1001,
        where: expect.objectContaining({
          trade: expect.objectContaining({
            accountId: request.accountId,
            accountMode: 'actual',
            symbol: 'SPY.US',
          }),
        }),
      }),
    );
  });

  it('DATE保留账本日期标签，INSTANT按市场时区，未知精度不补成成交', async () => {
    const { service, tx } = setup();
    tx.tradeEntryLeg.findMany.mockResolvedValue([
      row('date', '2026-11-04T00:00:00Z'),
      row('unknown'),
    ]);
    tx.ledgerEvent.findMany.mockResolvedValue([
      { id: 'event-date', timePrecision: 'DATE' },
      { id: 'event-unknown', timePrecision: 'UNKNOWN' },
      { id: 'event-sell', timePrecision: 'INSTANT' },
    ]);
    tx.tradeEntryLeg.count.mockResolvedValue(2);
    const result = await service.read(request);
    expect(result).toMatchObject({
      status: 'ready',
      omittedCount: 1,
      unplacedCount: 2,
      unplacedCountScope: 'symbol-all-dates',
      markers: [
        expect.objectContaining({ timePrecision: 'DATE', tradingDate: '2026-11-04' }),
        expect.objectContaining({ side: 'sell' }),
      ],
    });
    expect(tx.tradeEntryLeg.findMany.mock.calls[0]![0]).toMatchObject({
      where: {
        occurredAt: {
          gte: new Date('2026-11-04T00:00:00Z'),
          lt: new Date('2026-11-05T05:00:00Z'),
        },
      },
    });
  });

  it('账户模式不匹配不读其他模式的成交', async () => {
    const { service, tx } = setup();
    expect(await service.read({ ...request, mode: 'shadow' })).toMatchObject({
      status: 'unavailable',
      reason: 'account_scope_unavailable',
    });
    expect(tx.tradeEntryLeg.findMany).not.toHaveBeenCalled();
  });

  it('超过预算不返回截断marker，也不继续读取事实元数据', async () => {
    const { service, tx } = setup();
    tx.tradeEntryLeg.findMany.mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) => row(String(index))),
    );
    expect(await service.read(request)).toMatchObject({
      status: 'unavailable',
      reason: 'marker_budget_exceeded',
    });
    expect(tx.ledgerEvent.findMany).not.toHaveBeenCalled();
  });

  it('投影代次不一致不拼成一份成交图', async () => {
    const { service, tx } = setup();
    tx.tradeEntryLeg.findMany.mockResolvedValue([
      { ...row('buy'), trade: { projectionGeneration: 1n } },
    ]);
    expect(await service.read(request)).toMatchObject({
      status: 'unavailable',
      reason: 'projection_inconsistent',
    });
  });

  it('无效身份和倒序窗口在事务前拒绝', async () => {
    const { service, prisma } = setup();
    await expect(service.read({ ...request, end: '2026-11-03' })).rejects.toThrow();
    await expect(service.read({ ...request, accountId: 'all' })).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
