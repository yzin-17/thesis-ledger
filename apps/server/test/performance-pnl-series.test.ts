import { describe, expect, it, vi } from 'vitest';
import { PerformancePnlSeriesService } from '../src/performance/performance-pnl-series.service.js';
import {
  projectSnapshotPnl,
  type PnlSnapshot,
} from '../src/performance/performance-pnl-projection.js';
import { TradeRealizedPnlHistoryService } from '../src/ledger/trade-realized-pnl-history.service.js';
import type { PrismaService } from '../src/platform/prisma.service.js';
import type { PerformanceDataService } from '../src/performance/performance-data.service.js';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = (day: string): PnlSnapshot => ({
  id: `snapshot-${day}`,
  accountId: id,
  capturedAt: new Date(`${day}T08:00:00Z`),
  baseCurrency: 'CNY',
  valuationStatus: 'COMPLETE',
  marketValue: 120,
  costValue: 100,
  payload: { accountScopePolicy: 'account-v1', partial: false },
});
const input = {
  accountId: id,
  mode: 'actual' as const,
  range: '1M' as const,
  baseCurrency: 'CNY' as const,
};

describe('累计盈亏历史', () => {
  it('使用冻结市值与成本，只计入该时点之前的卖出，现金流不计收益', async () => {
    const findMany = vi.fn().mockResolvedValue([snapshot('2026-11-03'), snapshot('2026-11-01')]);
    const sales = vi.fn().mockResolvedValue([
      {
        occurredAt: new Date('2026-11-02T00:00:00Z'),
        currency: 'CNY',
        quantity: 1,
        netRealizedPnl: 10,
        costEstimated: false,
        allocations: [{ originalCost: 100, allocatedBuyCharges: [] }],
      },
    ]);
    const prisma = {
      portfolioSnapshot: { findMany },
      tradeCloseSlice: { findMany: sales },
    } as unknown as PrismaService;
    const data = {
      accountCurrencies: vi.fn().mockResolvedValue(new Map([[id, 'CNY']])),
    } as unknown as PerformanceDataService;
    const service = new PerformancePnlSeriesService(
      prisma,
      data,
      new TradeRealizedPnlHistoryService(prisma),
    );
    const result = await service.series(input, new Date('2026-11-04T00:00:00Z'));
    expect(result.points.map((point) => point.value)).toEqual([20, 30]);
    expect(sales).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]![0].where).toMatchObject({
      accountId: id,
      mode: 'actual',
      status: 'VALID',
      supersededBy: null,
    });
    expect(result.basis).toBe('REALIZED_PLUS_UNREALIZED');
  });

  it('当前模式找不到指定账户时拒绝读取历史', async () => {
    const findMany = vi.fn();
    const service = new PerformancePnlSeriesService(
      { portfolioSnapshot: { findMany } } as unknown as PrismaService,
      {
        accountCurrencies: vi.fn().mockResolvedValue(new Map()),
      } as unknown as PerformanceDataService,
      {} as TradeRealizedPnlHistoryService,
    );
    await expect(service.series(input)).rejects.toThrow('当前模式下找不到该账户');
    expect(findMany).not.toHaveBeenCalled();
  });
  it('年初至今按上海时区划分年份', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new PerformancePnlSeriesService(
      { portfolioSnapshot: { findMany } } as unknown as PrismaService,
      {} as PerformanceDataService,
      {} as TradeRealizedPnlHistoryService,
    );
    await service.series(
      { mode: 'actual', baseCurrency: 'CNY', range: 'YTD' },
      new Date('2026-12-31T17:00:00Z'),
    );
    expect(findMany.mock.calls[0]![0].where.capturedAt.gte).toEqual(
      new Date('2026-12-31T16:00:00Z'),
    );
  });

  it('缺行情、缺冻结账户范围或已实现成本未知时保留空点', () => {
    const base = snapshot('2026-11-01');
    const realized = { complete: true, pnl: [] };
    expect(
      projectSnapshotPnl(
        { ...base, valuationStatus: 'UNAVAILABLE', marketValue: 0 },
        realized,
        'CNY',
      ),
    ).toMatchObject({ value: null, reason: 'price_unavailable' });
    expect(projectSnapshotPnl({ ...base, accountId: null }, realized, 'CNY')).toMatchObject({
      value: null,
      reason: 'scope_unavailable',
    });
    expect(projectSnapshotPnl(base, { complete: false, pnl: [] }, 'CNY')).toMatchObject({
      value: null,
      reason: 'realized_unavailable',
    });
  });

  it('冻结历史汇率换算已实现收益，缺汇率时不按当前汇率猜测', () => {
    const base = snapshot('2026-11-01');
    const realized = { complete: true, pnl: [{ currency: 'USD' as const, amount: 10 }] };
    expect(projectSnapshotPnl(base, realized, 'CNY')).toMatchObject({
      value: null,
      reason: 'fx_unavailable',
    });
    const withFx = {
      ...base,
      payload: {
        fx: {
          baseCurrency: 'CNY',
          rates: [
            { fromCurrency: 'USD', toCurrency: 'CNY', rate: 7, available: true, stale: false },
          ],
        },
      },
    };
    expect(projectSnapshotPnl(withFx, realized, 'CNY')).toMatchObject({
      value: 90,
      realizedPnl: 70,
      unrealizedPnl: 20,
      reason: null,
    });
  });

  it('组合仅使用冻结账户集合，盈亏为零仍是有效点', () => {
    const base = {
      ...snapshot('2026-11-01'),
      accountId: null,
      marketValue: 100,
      payload: { accountScopePolicy: 'investment-only-v1', accountIds: [id] },
    };
    expect(projectSnapshotPnl(base, { complete: true, pnl: [] }, 'CNY')).toMatchObject({
      value: 0,
      reason: null,
    });
    expect(
      projectSnapshotPnl(
        { ...base, payload: { accountScopePolicy: 'investment-only-v1', accountIds: ['invalid'] } },
        { complete: true, pnl: [] },
        'CNY',
      ),
    ).toMatchObject({ value: null, reason: 'scope_unavailable' });
  });
  it('累计值按卡片同一精度汇总，明细金额与合计一致', () => {
    const base = { ...snapshot('2026-11-01'), marketValue: '100.005' };
    expect(
      projectSnapshotPnl(
        base,
        { complete: true, pnl: [{ currency: 'CNY', amount: 0.005 }] },
        'CNY',
      ),
    ).toMatchObject({ value: 0.01, realizedPnl: 0.005, unrealizedPnl: 0.005 });
  });
});
