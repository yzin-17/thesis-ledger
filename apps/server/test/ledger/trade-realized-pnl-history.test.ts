import { describe, expect, it, vi } from 'vitest';
import { TradeRealizedPnlHistoryService } from '../../src/ledger/trade-realized-pnl-history.service.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';

const sale = (at: string | null, netRealizedPnl = 10, costEstimated = false) => ({
  occurredAt: at ? new Date(at) : null,
  currency: 'CNY',
  quantity: 1,
  netRealizedPnl,
  costEstimated,
  allocations: [{ originalCost: 100, allocatedBuyCharges: [] }],
});

describe('历史已实现盈亏', () => {
  it('一次批量读取，未来卖出不提前计入且限定账户模式', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([sale('2026-11-02T10:00:00Z', 10), sale('2026-11-03T10:00:00Z', -3)]);
    const service = new TradeRealizedPnlHistoryService({
      tradeCloseSlice: { findMany },
    } as unknown as PrismaService);
    const times = ['2026-11-01', '2026-11-02', '2026-11-03'].map(
      (day) => new Date(`${day}T12:00:00Z`),
    );
    const result = await service.atTimes(['a', 'a', 'b'], 'shadow', times);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]![0].where.trade).toEqual({
      accountId: { in: ['a', 'b'] },
      accountMode: 'shadow',
    });
    expect([...result.values()]).toEqual([
      { complete: true, pnl: [] },
      { complete: true, pnl: [{ currency: 'CNY', amount: 10 }] },
      { complete: true, pnl: [{ currency: 'CNY', amount: 7 }] },
    ]);
  });

  it.each([sale(null), sale('2026-11-01T00:00:00Z', 10, true)])(
    '时间或成本未知时不当作零收益',
    async (slice) => {
      const service = new TradeRealizedPnlHistoryService({
        tradeCloseSlice: { findMany: vi.fn().mockResolvedValue([slice]) },
      } as unknown as PrismaService);
      const at = new Date('2026-11-04T00:00:00Z');
      expect((await service.atTimes(['a'], 'actual', [at])).get(at.getTime())?.complete).toBe(
        false,
      );
    },
  );
});
