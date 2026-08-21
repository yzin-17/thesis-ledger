import { describe, expect, it, vi } from 'vitest';
import { PerformanceService } from '../../src/performance/performance.service.js';

describe('Ledger Snapshot 与收益摘要', () => {
  it('快照使用行情估值、Ledger 现金和 dataQuality，而不是成本替代市值', async () => {
    const snapshot = vi.fn(async ({ data }: { data: object }) => data);
    const prisma = {
      position: {
        findMany: vi.fn(async () => [
          {
            symbol: '600519.SH',
            quantity: 100,
            costPrice: 10,
            asset: { assetType: 'stock' },
          },
        ]),
      },
      ledgerEvent: {
        findMany: vi.fn(async () => [
          {
            id: 'deposit',
            accountId: 'a',
            type: 'CASH_DEPOSIT',
            occurredAt: new Date('2025-01-01'),
            symbol: null,
            quantity: null,
            price: null,
            amount: 1000,
            fee: null,
            tax: null,
          },
        ]),
      },
      portfolioSnapshot: { findFirst: vi.fn(async () => null), create: snapshot },
    };
    const market = {
      getQuote: vi.fn(async () => ({ price: 12, provider: 'dsa', stale: false })),
    };
    const result = await new PerformanceService(prisma as never, market as never).capture(
      'a',
      new Date('2025-01-02'),
    );
    expect(result).toMatchObject({ marketValue: 1200, costValue: 1000, cashValue: 1000 });
    expect(result.payload).toMatchObject({ dataQuality: { partial: false } });
  });
  it('目标配置按版本保存并拒绝总和不为 100%', async () => {
    const prisma = {
      targetAllocation: {
        updateMany: vi.fn(async () => ({})),
        findFirst: vi.fn(async () => ({ version: 2 })),
        create: vi.fn(async ({ data }: { data: object }) => ({ id: 'target', ...data })),
      },
    };
    const service = new PerformanceService(prisma as never, {} as never);
    await expect(service.saveTargets('portfolio', { 股票: 0.6, ETF: 0.4 })).resolves.toMatchObject({
      version: 3,
    });
    await expect(service.saveTargets('portfolio', { 股票: 0.7 })).rejects.toThrow('100%');
  });
  it('Security/Account/Portfolio 三层使用相同市值和缺失数据语义', async () => {
    const prisma = {
      position: {
        findMany: vi.fn(async () => [
          {
            accountId: 'a',
            symbol: '600519.SH',
            quantity: 100,
            costPrice: 10,
            asset: { assetType: 'stock' },
          },
          {
            accountId: 'b',
            symbol: '510300.SH',
            quantity: 100,
            costPrice: 5,
            asset: { assetType: 'etf' },
          },
        ]),
      },
    };
    const market = {
      getQuote: vi.fn(async (symbol: string) => ({ price: symbol === '600519.SH' ? 12 : 6 })),
    };
    const layers = await new PerformanceService(prisma as never, market as never).layers();
    expect(layers.security).toHaveLength(2);
    expect(layers.account).toMatchObject([
      { accountId: 'a', marketValue: 1200 },
      { accountId: 'b', marketValue: 600 },
    ]);
    expect(layers.portfolio).toMatchObject({ costValue: 1500, marketValue: 1800, partial: false });
  });
});
