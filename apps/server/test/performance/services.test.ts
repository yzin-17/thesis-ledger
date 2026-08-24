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
  it('组合目标不存在时按当前账户资产规模聚合账户目标', async () => {
    const prisma = {
      targetAllocation: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [
          {
            accountId: 'account-a',
            version: 1,
            targets: { stock: 0.5, cash: 0.5 },
          },
          { accountId: 'account-b', version: 2, targets: { etf: 1 } },
        ]),
      },
      account: {
        findMany: vi.fn(async () => [
          { id: 'account-a', currency: 'CNY' },
          { id: 'account-b', currency: 'CNY' },
        ]),
      },
      position: {
        findMany: vi.fn(async () => [
          {
            accountId: 'account-a',
            symbol: '600519.SH',
            quantity: 1,
            costPrice: 100,
            asset: { assetType: 'stock' },
          },
          {
            accountId: 'account-b',
            symbol: '510300.SH',
            quantity: 3,
            costPrice: 100,
            asset: { assetType: 'etf' },
          },
        ]),
      },
      ledgerEvent: { findMany: vi.fn(async () => []) },
    };
    const market = {
      getQuote: vi.fn(async () => ({ price: 100, provider: 'dsa', stale: false })),
    };
    const targets = await new PerformanceService(prisma as never, market as never).targets(
      'portfolio',
    );
    expect(targets).toMatchObject({
      scope: 'portfolio',
      accountId: null,
      source: 'account-aggregate',
      aggregatedAccountCount: 2,
    });
    const aggregated = targets.targets as Record<string, number>;
    expect(aggregated.stock).toBeCloseTo(0.125);
    expect(aggregated.cash).toBeCloseTo(0.125);
    expect(aggregated.etf).toBeCloseTo(0.75);
  });
  it('显式组合目标优先于账户目标聚合', async () => {
    const findAccounts = vi.fn(async () => []);
    const prisma = {
      targetAllocation: {
        findFirst: vi.fn(async () => ({
          scope: 'portfolio',
          accountId: null,
          version: 3,
          targets: { stock: 0.7, etf: 0.3 },
        })),
      },
      account: { findMany: findAccounts },
    };
    await expect(
      new PerformanceService(prisma as never, {} as never).targets('portfolio'),
    ).resolves.toMatchObject({
      source: 'explicit',
      version: 3,
      targets: { stock: 0.7, etf: 0.3 },
    });
    expect(findAccounts).not.toHaveBeenCalled();
  });
  it('没有组合目标和账户目标时返回可解析的空目标对象', async () => {
    const prisma = {
      targetAllocation: { findFirst: vi.fn(async () => null) },
      account: { findMany: vi.fn(async () => []) },
    };
    await expect(
      new PerformanceService(prisma as never, {} as never).targets('portfolio'),
    ).resolves.toEqual({
      scope: 'portfolio',
      accountId: null,
      targets: {},
      source: 'none',
    });
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
  it('layers 将同一模式范围的 Ledger Cash Balance 汇总为现金配置金额', async () => {
    const prisma = {
      position: { findMany: vi.fn(async () => []) },
      ledgerEvent: {
        findMany: vi.fn(async () => [
          {
            id: 'cash',
            accountId: 'a',
            type: 'CASH_DEPOSIT',
            occurredAt: new Date('2025-01-01'),
            symbol: null,
            quantity: null,
            price: null,
            amount: 400,
            fee: null,
            tax: null,
            metadata: null,
          },
        ]),
      },
      account: { findMany: vi.fn(async () => [{ currency: 'CNY' }]) },
    };
    const layers = await new PerformanceService(prisma as never, {} as never).layers();
    expect(layers.account).toMatchObject([{ accountId: 'a', cashValue: 400, marketValue: 0 }]);
    expect(layers.portfolio).toMatchObject({ cashValue: 400, partial: false });
  });

  it('Snapshot capture 保留 cash-balance adjustment 的 metadata', async () => {
    const prisma = {
      position: { findMany: vi.fn(async () => []) },
      ledgerEvent: {
        findMany: vi.fn(async () => [
          {
            id: 'cash-adjustment',
            accountId: 'a',
            type: 'ADJUSTMENT',
            occurredAt: new Date('2025-01-01'),
            symbol: null,
            quantity: null,
            price: null,
            amount: 900,
            fee: null,
            tax: null,
            metadata: { kind: 'cash-balance', amount: 1200 },
          },
        ]),
      },
      portfolioSnapshot: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: object }) => data),
      },
    };
    const snapshot = await new PerformanceService(prisma as never, {} as never).capture(
      'a',
      new Date('2025-01-02'),
    );
    expect(snapshot).toMatchObject({ cashValue: 1200 });
  });

  it('layers 在指定账户时同时隔离实际/影子模式', async () => {
    const positionFindMany = vi.fn(async () => []);
    const ledgerFindMany = vi.fn(async () => []);
    const prisma = {
      position: { findMany: positionFindMany },
      ledgerEvent: { findMany: ledgerFindMany },
    };
    await new PerformanceService(prisma as never, {} as never).layers(
      'account-1',
      undefined,
      'shadow',
    );
    expect(positionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'account-1', account: { mode: 'shadow' } } }),
    );
    expect(ledgerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'account-1', account: { mode: 'shadow' } } }),
    );
  });

  it('partial 配置保留金额但隐藏权重并暂停再平衡', () => {
    const service = new PerformanceService({} as never, {} as never);
    expect(
      service.allocate({
        positions: [{ category: 'stock', marketValue: 100 }],
        targets: { stock: 0.6, index: 0.4 },
        dataQuality: { partial: true, missingSymbols: ['600519.SH'] },
      }),
    ).toMatchObject({
      allocation: [{ category: 'stock', value: 100, weight: null }],
      rebalance: [],
      partial: true,
      missingSymbols: ['600519.SH'],
    });
  });

  it('混合币种的全部账户范围默认按币种分组，不直接合计', async () => {
    const prisma = {
      position: { findMany: vi.fn(async () => []) },
      ledgerEvent: { findMany: vi.fn(async () => []) },
      account: { findMany: vi.fn(async () => [{ currency: 'CNY' }, { currency: 'HKD' }]) },
    };
    const layers = await new PerformanceService(prisma as never, {} as never).layers();
    expect(layers.portfolio).toBeNull();
    expect(layers.fx).toMatchObject({ enabled: false, status: 'disabled' });
  });

  it('开启 FX 合并后按基准币种换算证券与现金', async () => {
    const prisma = {
      position: {
        findMany: vi.fn(async () => [
          {
            accountId: 'cny-account',
            symbol: '600519.SH',
            quantity: 100,
            costPrice: 10,
            asset: { assetType: 'stock' },
          },
          {
            accountId: 'hkd-account',
            symbol: '000001.SZ',
            quantity: 100,
            costPrice: 5,
            asset: { assetType: 'etf' },
          },
        ]),
      },
      ledgerEvent: { findMany: vi.fn(async () => []) },
      account: {
        findMany: vi.fn(async () => [
          { id: 'cny-account', currency: 'CNY' },
          { id: 'hkd-account', currency: 'HKD' },
        ]),
      },
    };
    const market = {
      getQuote: vi.fn(async (symbol: string) => ({ price: symbol === '600519.SH' ? 12 : 6 })),
      getFxRates: vi.fn(async () => ({
        version: 1,
        baseCurrency: 'CNY',
        asOf: '2026-08-24',
        fetchedAt: '2026-08-24T00:00:00.000Z',
        maxAgeDays: 7,
        rates: [
          {
            fromCurrency: 'CNY',
            toCurrency: 'CNY',
            rate: 1,
            rateDate: '2026-08-24',
            provider: 'identity',
            fetchedAt: '2026-08-24T00:00:00.000Z',
            freshness: 'live',
            stale: false,
            ageDays: 0,
            available: true,
          },
          {
            fromCurrency: 'HKD',
            toCurrency: 'CNY',
            rate: 0.92,
            rateDate: '2026-08-24',
            provider: 'fixture',
            fetchedAt: '2026-08-24T00:00:00.000Z',
            freshness: 'live',
            stale: false,
            ageDays: 0,
            available: true,
          },
        ],
      })),
    };
    const layers = await new PerformanceService(prisma as never, market as never).layers(
      undefined,
      undefined,
      'actual',
      { fxMerge: true, baseCurrency: 'CNY' },
    );
    expect(layers.portfolio).toMatchObject({
      currency: 'CNY',
      marketValue: 1752,
      costValue: 1460,
    });
    expect(layers.fx).toMatchObject({ status: 'ready', baseCurrency: 'CNY' });
  });

  it('缺失 FX 时保留分币种金额并阻断合并', async () => {
    const prisma = {
      position: { findMany: vi.fn(async () => []) },
      ledgerEvent: { findMany: vi.fn(async () => []) },
      account: {
        findMany: vi.fn(async () => [
          { id: 'cny-account', currency: 'CNY' },
          { id: 'usd-account', currency: 'USD' },
        ]),
      },
    };
    const market = {
      getFxRates: vi.fn(async () => ({
        version: 1,
        baseCurrency: 'CNY',
        asOf: '2026-08-24',
        fetchedAt: '2026-08-24T00:00:00.000Z',
        maxAgeDays: 7,
        rates: [
          {
            fromCurrency: 'CNY',
            toCurrency: 'CNY',
            rate: 1,
            rateDate: '2026-08-24',
            provider: 'identity',
            fetchedAt: '2026-08-24T00:00:00.000Z',
            freshness: 'live',
            stale: false,
            ageDays: 0,
            available: true,
          },
          {
            fromCurrency: 'USD',
            toCurrency: 'CNY',
            freshness: 'unavailable',
            stale: false,
            ageDays: null,
            available: false,
          },
        ],
      })),
    };
    const layers = await new PerformanceService(prisma as never, market as never).layers(
      undefined,
      undefined,
      'actual',
      { fxMerge: true, baseCurrency: 'CNY' },
    );
    expect(layers.portfolio).toBeNull();
    expect(layers.byCurrency).toHaveLength(2);
    expect(layers.fx).toMatchObject({ status: 'blocked', missingCurrencies: ['USD'] });
  });
});
