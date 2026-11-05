import { describe, expect, it, vi } from 'vitest';
import { projectInstrumentSnapshotPnl } from '../src/performance/performance-instrument-pnl.js';
import { PerformancePnlSeriesService } from '../src/performance/performance-pnl-series.service.js';
import { TradeRealizedPnlHistoryService } from '../src/ledger/trade-realized-pnl-history.service.js';
import type { PnlSnapshot } from '../src/performance/performance-pnl-projection.js';

const id = '11111111-1111-4111-8111-111111111111';
const position = (
  symbol = '000001.OF',
  marketValue: number | null = 80,
  nativeCostValue = 100,
) => ({ symbol, marketValue, nativeCostValue, currency: 'CNY' });
const snapshot = (positions: unknown[] | undefined): PnlSnapshot => ({
  id: 'snapshot',
  accountId: id,
  capturedAt: new Date('2026-11-03T08:00:00Z'),
  baseCurrency: 'CNY',
  valuationStatus: 'PARTIAL',
  marketValue: 900,
  costValue: 1000,
  payload: { positions, partial: true },
});
const realized = { complete: true, pnl: [{ currency: 'CNY' as const, amount: 10 }] };
const project = (positions: unknown[] | undefined) =>
  projectInstrumentSnapshotPnl(snapshot(positions), realized, 'CNY', '000001.OF');

describe('标的累计盈亏', () => {
  it('按完整市场代码汇总重复持仓，不受其他标的缺行情影响', () => {
    expect(
      project([position(), position('000001.OF', 40, 50), position('000001.SH', null)]),
    ).toMatchObject({ value: -20, unrealizedPnl: -30, realizedPnl: 10, reason: null });
  });
  it('清仓后未实现为零，仍显示历史已实现收益；旧快照无持仓数组保持未知', () => {
    expect(project([])).toMatchObject({ value: 10, unrealizedPnl: 0, realizedPnl: 10 });
    expect(project(undefined)).toMatchObject({ value: null, reason: 'position_unavailable' });
    expect(project([{}])).toMatchObject({ value: null, reason: 'position_unavailable' });
  });
  it('缺价格或成本、陈旧和已实现依据未知时不补零', () => {
    expect(project([position('000001.OF', null)])).toMatchObject({
      value: null,
      reason: 'price_unavailable',
    });
    expect(project([{ ...position(), nativeCostValue: undefined }])).toMatchObject({
      value: null,
      reason: 'price_unavailable',
    });
    expect(project([{ ...position(), stale: true }])).toMatchObject({
      value: null,
      reason: 'price_unavailable',
    });
    expect(
      projectInstrumentSnapshotPnl(snapshot([]), { complete: false, pnl: [] }, 'CNY', '000001.OF'),
    ).toMatchObject({ value: null, reason: 'realized_unavailable' });
    expect(
      projectInstrumentSnapshotPnl(snapshot([]), { complete: true, pnl: [] }, 'CNY', '000001.OF'),
    ).toMatchObject({ value: 0, reason: null });
  });
  it('仅使用冻结汇率换算该标的，不借用当前汇率', () => {
    const row = { ...position(), currency: 'USD' };
    expect(project([row])).toMatchObject({ value: null, reason: 'fx_unavailable' });
    const withFx = snapshot([row]);
    withFx.payload = {
      positions: [row],
      fx: {
        baseCurrency: 'CNY',
        rates: [{ fromCurrency: 'USD', toCurrency: 'CNY', rate: 7, available: true, stale: false }],
      },
    };
    expect(projectInstrumentSnapshotPnl(withFx, realized, 'CNY', '000001.OF')).toMatchObject({
      value: -130,
      unrealizedPnl: -140,
    });
  });
  it('真实查询投影按账户、模式、标的与截止时间传递，历史和当前使用同一账本算法', async () => {
    const findMany = vi.fn().mockResolvedValue([snapshot([position()])]);
    const sales = vi
      .fn()
      .mockResolvedValue([
        {
          occurredAt: new Date('2026-11-02T00:00:00Z'),
          currency: 'CNY',
          quantity: 1,
          netRealizedPnl: 10,
          costEstimated: false,
          allocations: [{ originalCost: 100, allocatedBuyCharges: [] }],
        },
      ]);
    const prisma = { portfolioSnapshot: { findMany }, tradeCloseSlice: { findMany: sales } };
    const service = new PerformancePnlSeriesService(
      prisma as never,
      { accountCurrencies: vi.fn().mockResolvedValue(new Map([[id, 'CNY']])) } as never,
      new TradeRealizedPnlHistoryService(prisma as never),
    );
    const asOf = '2026-11-04T01:00:00Z';
    const result = await service.series(
      {
        mode: 'shadow',
        accountId: id,
        baseCurrency: 'CNY',
        range: '1M',
        symbol: '000001.OF',
        asOf,
      },
      new Date('2026-11-04T02:00:00Z'),
    );
    expect(result).toMatchObject({
      symbol: '000001.OF',
      asOf,
      currentRealizedPnl: 10,
      points: [{ value: -10, unrealizedPnl: -20, realizedPnl: 10 }],
    });
    expect(findMany.mock.calls[0]![0].where).toMatchObject({
      accountId: id,
      mode: 'shadow',
      capturedAt: { lte: new Date(asOf) },
    });
    expect(
      sales.mock.calls.every(
        ([args]) =>
          args.where.trade.symbol === '000001.OF' && args.where.trade.accountMode === 'shadow',
      ),
    ).toBe(true);
    await expect(
      service.series({
        mode: 'actual',
        baseCurrency: 'CNY',
        range: 'ALL',
        asOf: '2099-01-01T00:00:00Z',
      }),
    ).rejects.toThrow('不能晚于当前时间');
  });
});
