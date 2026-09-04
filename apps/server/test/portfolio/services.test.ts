import { describe, expect, it, vi } from 'vitest';
import { ImportService } from '../../src/imports/import.service.js';
import { AssetMatcherService } from '../../src/imports/asset-matcher.service.js';
import { ImportCommitService } from '../../src/imports/import-commit.service.js';
import { ImportDraftService } from '../../src/imports/import-draft.service.js';
import {
  createCoreTools,
  runRiskExplanation,
  validateGroundedAnalysis,
} from '../../src/ai/ai.service.js';
import { AccountsService } from '../../src/portfolio/accounts.service.js';
import { PortfolioService } from '../../src/portfolio/portfolio.service.js';
import { RiskService } from '../../src/risk/risk.service.js';
import { cashFlowEvent, fixtureUuid } from '../ledger/ledger-event-fixtures.js';

const fxResponse = (asOf: string) => ({
  version: 1 as const,
  baseCurrency: 'CNY' as const,
  asOf,
  fetchedAt: `${asOf}T00:00:00.000Z`,
  maxAgeDays: 7,
  rates: [
    {
      fromCurrency: 'CNY' as const,
      toCurrency: 'CNY' as const,
      rate: 1,
      rateDate: asOf,
      provider: 'identity',
      fetchedAt: `${asOf}T00:00:00.000Z`,
      freshness: 'live' as const,
      stale: false,
      ageDays: 0,
      available: true,
    },
    {
      fromCurrency: 'HKD' as const,
      toCurrency: 'CNY' as const,
      rate: 0.92,
      rateDate: asOf,
      provider: 'fixture',
      fetchedAt: `${asOf}T00:00:00.000Z`,
      freshness: 'live' as const,
      stale: false,
      ageDays: 0,
      available: true,
    },
  ],
});

const accountA = fixtureUuid('account-a');

describe('V0.1 核心 E2E', () => {
  it('账户→截图 Review/Commit→Portfolio→Risk→通知→AI Explain 可一键执行', async () => {
    const accountId = '00000000-0000-4000-8000-000000000001';
    const asset = {
      symbol: '600519.SH',
      name: '贵州茅台',
      market: 'CN',
      assetType: 'stock',
      currency: 'CNY',
    };
    const ledgerEvents: Array<Record<string, unknown>> = [];
    const positions: Array<Record<string, unknown>> = [];
    type DraftRecord = { id?: string; [key: string]: unknown };
    let draft: DraftRecord | null = null;
    let draftRevision: Record<string, unknown> | null = null;
    type E2ePrisma = {
      [key: string]: unknown;
      $transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
    };
    const prisma: E2ePrisma = {
      account: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: accountId,
          active: true,
          ...data,
        })),
      },
      asset: {
        findUnique: vi.fn(async () => asset),
        findMany: vi.fn(async () => [asset]),
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => create),
      },
      position: { findMany: vi.fn(async () => positions) },
      importDraft: {
        findUnique: vi.fn(
          async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => {
            if (where.id && draft?.id === where.id) return draft;
            return null;
          },
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          draft = data;
          return data;
        }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          draft = { ...draft, ...data };
          return draft;
        }),
      },
      importDraftRevision: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          draftRevision = { createdAt: new Date('2026-08-26T01:00:00.000Z'), ...data };
          return draftRevision;
        }),
        findUnique: vi.fn(async () => draftRevision),
      },
      accountLedgerState: { findUnique: vi.fn(async () => ({ ledgerRevision: 0n })) },
      ledgerEvent: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          ledgerEvents.push(data);
          return data;
        }),
      },
      riskRule: {
        findMany: vi.fn(async () => [
          {
            id: 'risk-1',
            version: 1,
            kind: 'price-below',
            scope: 'security',
            severity: 'warning',
            threshold: 100,
            enabled: true,
            symbol: '600519.SH',
            accountId: null,
            effectiveAt: new Date(Date.now() - 1000),
          },
        ]),
      },
      riskEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'risk-event-1',
          ...data,
        })),
      },
      $transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(prisma),
    };
    const account = await new AccountsService(prisma as never).create({
      name: 'E2E 账户',
      source: 'manual',
      type: 'securities',
      currency: 'CNY',
    });
    expect(account).toMatchObject({ id: accountId });

    const baselineImport = {
      commitReviewedImport: vi.fn(async () => {
        ledgerEvents.push({ type: 'POSITION_BASELINE_OBSERVATION', symbol: '600519.SH' });
        positions.splice(0, positions.length, {
          accountId,
          symbol: '600519.SH',
          quantity: 100,
          costPrice: 1000,
          asset,
        });
        draft = { ...draft, status: 'committed' };
        return draft;
      }),
    };
    const matcher = new AssetMatcherService(prisma as never);
    const drafts = new ImportDraftService(prisma as never, matcher);
    const commits = new ImportCommitService(baselineImport as never);
    const imports = new ImportService(matcher, drafts, commits, {} as never);
    const createdDraft = await imports.createDraftFromProvider(
      accountId,
      new Uint8Array([1, 2, 3]),
      'broker',
      {
        id: 'fixture-vision',
        extract: async () => [
          {
            symbol: '600519.SH',
            quantity: '100',
            costPrice: '1000',
            marketPrice: '1100',
            marketValue: '110000',
            profit: '10000',
            profitRate: '0.1',
            confidence: 0.99,
          },
        ],
      },
    );
    expect(createdDraft.status).toBe('pending');
    await imports.commit(createdDraft.id, createdDraft.rows as unknown as unknown[]);
    expect(ledgerEvents).toHaveLength(1);
    expect(ledgerEvents[0]).toMatchObject({
      type: 'POSITION_BASELINE_OBSERVATION',
      symbol: '600519.SH',
    });

    const portfolio = await new PortfolioService(
      prisma as never,
      { getQuote: async () => ({ price: 1100, stale: false }) } as never,
    ).value(accountId);
    expect(portfolio).toMatchObject({ totalMarketValue: 110_000, partial: false });

    const notifications = { enqueue: vi.fn(async () => [{ id: 'delivery-1' }]) };
    const risk = await new RiskService(prisma as never, notifications as never).scan([
      {
        symbol: '600519.SH',
        price: 90,
        costPrice: 1000,
        marketTime: '2025-01-02T01:30:00Z',
        dataQuality: { quote: 'fresh' },
      },
    ]);
    expect(risk.results).toEqual([{ ruleId: 'risk-1', eventId: 'risk-event-1' }]);
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'risk-event',
        id: 'risk-event-1',
        dedupKey: expect.any(String),
      }),
      expect.objectContaining({
        title: '风险提醒',
        body: '600519.SH · 贵州茅台 · 价格低于 100 已触发',
        severity: 'warning',
        traceId: expect.any(String),
      }),
      expect.objectContaining({
        cooldownMinutes: 30,
        maxAttempts: 3,
        criticalBypassCooldown: true,
      }),
    );

    const analysis = await runRiskExplanation(
      createCoreTools({
        getRisk: async () => ({ sourceId: 'risk-event-1', provider: 'fixture' }),
        getPortfolio: async () => portfolio,
        getPositions: async () => portfolio.positions,
        getQuote: async () => ({ price: 90 }),
        getBars: async () => [],
        getIndicators: async () => ({}),
        getChipDistribution: async () => ({}),
      }),
      { ruleId: 'risk-1', threshold: 100, triggerValue: 90 },
      new Set(['risk:read']),
    );
    expect(validateGroundedAnalysis(analysis).conclusion).toContain('触发值 90');
  });
});

describe('账户与组合', () => {
  it('组合范围排除独立现金账户，显式账户查询仍保留', async () => {
    const positionFindMany = vi.fn(async () => []);
    const ledgerFindMany = vi.fn(async () => []);
    const accountFindMany = vi.fn(async () => []);
    const service = new PortfolioService(
      {
        position: { findMany: positionFindMany },
        ledgerEvent: { findMany: ledgerFindMany },
        account: { findMany: accountFindMany },
      } as never,
      {} as never,
    );

    await service.value(undefined, 'actual');
    expect(positionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          account: { mode: 'actual', active: true, type: { in: ['securities', 'fund'] } },
        },
      }),
    );
    expect(ledgerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          account: { mode: 'actual', active: true, type: { in: ['securities', 'fund'] } },
        },
      }),
    );

    await service.value(accountA, 'actual');
    expect(positionFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { accountId: accountA, account: { mode: 'actual' } } }),
    );
    expect(ledgerFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { accountId: accountA, account: { mode: 'actual' } } }),
    );
  });

  it('允许同名账户、拒绝非法币种和有持仓账户停用', async () => {
    const prisma = {
      account: {
        findUnique: vi.fn(async () => ({ id: 'with-position', positions: [{}] })),
        create: vi.fn(async ({ data }: { data: object }) => data),
        update: vi.fn(),
      },
    };
    const service = new AccountsService(prisma as never);
    await expect(
      service.create({ name: '证券', type: 'securities', mode: 'actual', currency: 'CNY' }),
    ).resolves.toMatchObject({ name: '证券' });
    await expect(
      service.create({ name: '港股', type: 'securities', mode: 'actual', currency: 'HKD' }),
    ).resolves.toMatchObject({ name: '港股', currency: 'HKD' });
    await expect(
      service.create({ name: '证券', type: 'securities', mode: 'actual', currency: 'CNY' }),
    ).resolves.toMatchObject({ name: '证券' });
    await expect(
      service.create({ name: '非法', type: 'securities', mode: 'actual', currency: 'EUR' }),
    ).rejects.toThrow();
    await expect(service.deactivate('with-position')).rejects.toThrow('仍有持仓');
  });

  it('停用账户时不同币种的现金余额不能互相抵消', async () => {
    const update = vi.fn();
    const prisma = {
      account: {
        findUnique: vi.fn(async () => ({ id: accountA, currency: 'CNY', positions: [] })),
        update,
      },
      ledgerEvent: {
        findMany: vi.fn(async () => [
          cashFlowEvent({
            id: 'cash-cny',
            accountId: accountA,
            amount: 100,
            currency: 'CNY',
            direction: 'INFLOW',
            category: 'DEPOSIT',
          }),
          cashFlowEvent({
            id: 'cash-hkd',
            accountId: accountA,
            amount: 100,
            currency: 'HKD',
            direction: 'OUTFLOW',
            category: 'WITHDRAWAL',
            occurredAt: '2025-01-02T00:00:00.000Z',
          }),
        ]),
      },
    };
    await expect(new AccountsService(prisma as never).deactivate(accountA)).rejects.toThrow(
      '现金余额',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('用三持仓 fixture 计算部分估值和盈亏', async () => {
    const positions = [
      { id: '1', symbol: '600519.SH', quantity: 100, costPrice: 10, asset: { name: 'A' } },
      { id: '2', symbol: '000001.SZ', quantity: 200, costPrice: 5, asset: { name: 'B' } },
      { id: '3', symbol: '510300.SH', quantity: 100, costPrice: 4, asset: { name: 'C' } },
    ];
    const prisma = { position: { findMany: vi.fn(async () => positions) } };
    const market = {
      getQuote: vi.fn(async (symbol: string) => {
        if (symbol === '510300.SH') throw new Error('missing');
        return { price: symbol === '600519.SH' ? 12 : 4, stale: false };
      }),
    };
    const result = await new PortfolioService(prisma as never, market as never).value();
    expect(result).toMatchObject({
      totalCost: 2400,
      totalMarketValue: 2000,
      totalPnl: 0,
      partial: true,
    });
    expect(result.positions[2]).toMatchObject({ marketValue: null, stale: true });
  });

  it('组合估值不直接相加不同币种现金，并可通过 FX View 汇总', async () => {
    const prisma = {
      position: { findMany: vi.fn(async () => []) },
      ledgerEvent: {
        findMany: vi.fn(async () => [
          cashFlowEvent({
            id: 'cash-cny',
            accountId: accountA,
            amount: 100,
            currency: 'CNY',
            direction: 'INFLOW',
            category: 'DEPOSIT',
          }),
          cashFlowEvent({
            id: 'cash-future',
            accountId: accountA,
            amount: 500,
            currency: 'CNY',
            direction: 'INFLOW',
            category: 'DEPOSIT',
            settledAt: '2099-01-01T00:00:00.000Z',
          }),
          cashFlowEvent({
            id: 'cash-hkd',
            accountId: accountA,
            amount: 100,
            currency: 'HKD',
            direction: 'INFLOW',
            category: 'DEPOSIT',
          }),
        ]),
      },
      account: {
        findMany: vi.fn(async () => [{ id: accountA, currency: 'CNY' }]),
      },
    };
    const market = {
      getFxRates: vi.fn(async ({ asOf }: { asOf: string }) => fxResponse(asOf)),
    };
    const service = new PortfolioService(prisma as never, market as never);
    const native = await service.value(accountA, 'actual', {
      fxMerge: false,
      baseCurrency: 'CNY',
    });
    expect(native).toMatchObject({ cashValue: 0, totalMarketValue: 0, partial: true });
    expect(native.cashByCurrency).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'CNY', amount: 100 }),
        expect.objectContaining({ currency: 'HKD', amount: 100 }),
      ]),
    );
    expect(native.cashByCurrency).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ currency: 'CNY', amount: 600 })]),
    );

    const merged = await service.value(accountA, 'actual', {
      fxMerge: true,
      baseCurrency: 'CNY',
    });
    expect(merged).toMatchObject({
      cashValue: 192,
      totalMarketValue: 192,
      partial: false,
      baseCurrency: 'CNY',
    });
    expect(merged.cashByAccount).toMatchObject([
      { accountId: accountA, amount: 192, currency: 'CNY' },
    ]);
  });

  it('缺少 FX 时保留原币现金，并将本位币汇总标记为部分可用', async () => {
    const prisma = {
      position: { findMany: vi.fn(async () => []) },
      ledgerEvent: {
        findMany: vi.fn(async () => [
          cashFlowEvent({
            id: 'cash-cny',
            accountId: accountA,
            amount: 100,
            currency: 'CNY',
            direction: 'INFLOW',
            category: 'DEPOSIT',
          }),
          cashFlowEvent({
            id: 'cash-usd',
            accountId: accountA,
            amount: 100,
            currency: 'USD',
            direction: 'INFLOW',
            category: 'DEPOSIT',
          }),
        ]),
      },
      account: {
        findMany: vi.fn(async () => [{ id: accountA, currency: 'CNY' }]),
      },
    };
    const market = {
      getFxRates: vi.fn(async ({ asOf }: { asOf: string }) => ({
        ...fxResponse(asOf),
        rates: [fxResponse(asOf).rates[0]],
      })),
    };
    const result = await new PortfolioService(prisma as never, market as never).value(
      accountA,
      'actual',
      { fxMerge: true, baseCurrency: 'CNY' },
    );
    expect(result).toMatchObject({
      cashValue: 100,
      totalMarketValue: 100,
      partial: true,
      fx: { status: 'blocked', missingCurrencies: ['USD'] },
    });
    expect(result.cashByCurrency).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'CNY', amount: 100, convertedAmount: 100 }),
        expect.objectContaining({ currency: 'USD', amount: 100, convertedAmount: null }),
      ]),
    );
  });
  it('编辑持仓可同时修正账户、数量和成本', async () => {
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'position',
        accountId: '11111111-1111-4111-8111-111111111111',
        symbol: '600519.SH',
        quantity: 100,
        costPrice: 10,
      })
      .mockResolvedValueOnce({ id: 'position', symbol: '600519.SH', quantity: 200, costPrice: 12 });
    const setPosition = vi.fn(async () => ({}));
    const service = new PortfolioService(
      { position: { findUniqueOrThrow } } as never,
      {} as never,
      { setPosition } as never,
    );
    await service.updatePosition('position', {
      accountId: '11111111-1111-4111-8111-111111111111',
      quantity: '200',
      costPrice: '12',
    });
    expect(setPosition).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '600519.SH',
      '200',
      '12',
      'manual',
      '手工修改持仓',
    );
    await expect(service.updatePosition('position', { quantity: '0' })).rejects.toThrow();
  });
  it('目录未命中时允许使用名称和类型手动录入持仓', async () => {
    const setPosition = vi.fn(async () => ({}));
    const findUniqueOrThrow = vi.fn(async () => ({
      id: 'position',
      accountId: '11111111-1111-4111-8111-111111111111',
      symbol: '600519.SH',
      quantity: '20',
      costPrice: '100',
      asset: { name: '自定义标的', assetType: 'stock' },
    }));
    const service = new PortfolioService(
      { position: { findUniqueOrThrow } } as never,
      {} as never,
      { setPosition } as never,
    );

    await service.upsertPosition({
      accountId: '11111111-1111-4111-8111-111111111111',
      symbol: '600519.SH',
      quantity: '20',
      costPrice: '100',
      source: 'manual',
      assetName: '自定义标的',
      assetType: 'stock',
    });

    expect(setPosition).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '600519.SH',
      '20',
      '100',
      'manual',
      '保存当前持仓',
      { assetName: '自定义标的', assetType: 'stock' },
    );
    await expect(
      service.upsertPosition({
        accountId: '11111111-1111-4111-8111-111111111111',
        symbol: '600519.SH',
        quantity: '20',
        costPrice: '100',
        source: 'manual',
      }),
    ).rejects.toThrow('未找到目录标的时需要补充名称和类型');
  });
});
