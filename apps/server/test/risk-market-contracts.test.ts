import { describe, expect, it, vi } from 'vitest';
import { RiskService } from '../src/risk/risk.service.js';
import { InstrumentService } from '../src/market/instrument.service.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const baseRule = {
  version: 1,
  severity: 'warning',
  enabled: true,
  sourcePlanId: null,
  parameters: null,
};

describe('Risk scope and mode contracts', () => {
  it('security/account/portfolio each evaluate once per scan', async () => {
    const rules = [
      {
        ...baseRule,
        id: '21111111-1111-4111-8111-111111111111',
        kind: 'price-below',
        scope: 'security',
        threshold: 100,
        symbol: '600519.SH',
        accountId: null,
      },
      {
        ...baseRule,
        id: '31111111-1111-4111-8111-111111111111',
        kind: 'asset-concentration',
        scope: 'account',
        threshold: 0.5,
        symbol: null,
        accountId,
      },
      {
        ...baseRule,
        id: '41111111-1111-4111-8111-111111111111',
        kind: 'asset-concentration',
        scope: 'portfolio',
        threshold: 0.5,
        symbol: null,
        accountId: null,
      },
    ];
    const creates: Array<Record<string, unknown>> = [];
    const prisma = {
      riskRule: { findMany: vi.fn(async () => rules) },
      riskEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
          return { id: `event-${creates.length}`, ...data };
        }),
      },
    };
    const notifications = { enqueue: vi.fn() };
    const service = new RiskService(prisma as never, notifications as never);
    const positions = [
      { symbol: '600519.SH', weight: 0.6, assetType: 'stock' },
      { symbol: '000001.SZ', weight: 0.4, assetType: 'stock' },
    ];

    const result = await service.scan({
      security: [
        {
          symbol: '600519.SH',
          accountId,
          mode: 'shadow',
          price: 110,
          marketTime: '2026-08-20T01:00:00Z',
          dataQuality: {},
        },
        {
          symbol: '600519.SH',
          accountId,
          mode: 'shadow',
          price: 90,
          marketTime: '2026-08-20T02:00:00Z',
          dataQuality: {},
        },
      ],
      accounts: [
        {
          accountId,
          mode: 'shadow',
          positions,
          marketTime: '2026-08-20T02:00:00Z',
          dataQuality: {},
        },
      ],
      portfolio: {
        mode: 'shadow',
        positions,
        marketTime: '2026-08-20T02:00:00Z',
        dataQuality: {},
      },
    });

    expect(result.results).toHaveLength(3);
    expect(creates).toHaveLength(3);
    expect(creates.map((item) => item.mode)).toEqual(['shadow', 'shadow', 'shadow']);
    expect(creates.filter((item) => item.symbol === '600519.SH')).toHaveLength(1);
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('rejects mixed actual/shadow mode in a single scan', async () => {
    const service = new RiskService({} as never, {} as never);
    await expect(
      service.scan({
        security: [
          {
            symbol: '600519.SH',
            mode: 'actual',
            marketTime: '2026-08-20T01:00:00Z',
            dataQuality: {},
          },
        ],
        portfolio: {
          mode: 'shadow',
          marketTime: '2026-08-20T01:00:00Z',
          dataQuality: {},
        },
      }),
    ).rejects.toThrow('不能混合');
  });

  it('evaluates account-bound security rules against the matching account only', async () => {
    const accountB = '22222222-2222-4222-8222-222222222222';
    const rules = [
      {
        ...baseRule,
        id: '61111111-1111-4111-8111-111111111111',
        kind: 'cost-stop',
        scope: 'security',
        threshold: 0.1,
        symbol: '600519.SH',
        accountId,
      },
    ];
    const creates: Array<Record<string, unknown>> = [];
    const prisma = {
      riskRule: { findMany: vi.fn(async () => rules) },
      riskEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
          return { id: `event-${creates.length}`, ...data };
        }),
      },
    };
    const notifications = { enqueue: vi.fn(async () => undefined) };
    const service = new RiskService(prisma as never, notifications as never);

    await service.scan([
      {
        symbol: '600519.SH',
        accountId,
        mode: 'shadow',
        price: 89,
        costPrice: 100,
        marketTime: '2026-08-20T02:00:00Z',
        dataQuality: {},
      },
      {
        symbol: '600519.SH',
        accountId: accountB,
        mode: 'shadow',
        price: 80,
        costPrice: 100,
        marketTime: '2026-08-20T02:00:00Z',
        dataQuality: {},
      },
    ]);

    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ accountId, symbol: '600519.SH' });
  });

  it('maintains a trailing-stop peak per account and triggers after a drawdown', async () => {
    const state = new Map<string, Record<string, unknown>>();
    const stateDelegate = {
      findMany: vi.fn(async () => [...state.values()]),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { accountId_symbol_mode: { accountId: string; symbol: string; mode: string } };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = `${where.accountId_symbol_mode.accountId}:${where.accountId_symbol_mode.symbol}:${where.accountId_symbol_mode.mode}`;
          const next = { ...(state.get(key) ?? create), ...update };
          state.set(key, next);
          return next;
        },
      ),
    };
    const prisma = {
      riskRule: {
        findMany: vi.fn(async () => [
          {
            ...baseRule,
            id: '71111111-1111-4111-8111-111111111111',
            kind: 'trailing-stop',
            scope: 'security',
            threshold: 0.1,
            symbol: '600519.SH',
            accountId,
          },
        ]),
      },
      riskEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'event-trailing',
          ...data,
        })),
      },
      riskPositionState: stateDelegate,
    };
    const service = new RiskService(prisma as never, { enqueue: vi.fn() } as never);
    const context = (price: number) => ({
      symbol: '600519.SH',
      accountId,
      mode: 'actual' as const,
      price,
      costPrice: 100,
      positionUpdatedAt: '2026-08-20T00:00:00Z',
      marketTime: `2026-08-20T0${price === 120 ? '1' : '2'}:00:00Z`,
      dataQuality: {},
    });

    const first = await service.scan([context(120)]);
    const second = await service.scan([context(105)]);

    expect(first.results).toEqual([]);
    expect(second.results).toHaveLength(1);
    expect(prisma.riskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId,
          context: expect.objectContaining({
            accountId,
            inputs: expect.objectContaining({ holdingPeak: 120, price: 105 }),
          }),
        }),
      }),
    );
  });

  it('aggregates an unbound concentration rule across accounts', async () => {
    const creates: Array<Record<string, unknown>> = [];
    const prisma = {
      riskRule: {
        findMany: vi.fn(async () => [
          {
            ...baseRule,
            id: '81111111-1111-4111-8111-111111111111',
            kind: 'position-concentration',
            scope: 'security',
            threshold: 0.7,
            symbol: '600519.SH',
            accountId: null,
          },
        ]),
      },
      riskEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
          return { id: 'event-concentration', ...data };
        }),
      },
    };
    const service = new RiskService(prisma as never, { enqueue: vi.fn() } as never);

    await service.scan([
      {
        symbol: '600519.SH',
        accountId,
        mode: 'shadow',
        price: 100,
        weight: 0.4,
        accountWeight: 0.8,
        marketTime: '2026-08-20T02:00:00Z',
        dataQuality: {},
      },
      {
        symbol: '600519.SH',
        accountId: '22222222-2222-4222-8222-222222222222',
        mode: 'shadow',
        price: 100,
        weight: 0.4,
        accountWeight: 0.9,
        marketTime: '2026-08-20T02:00:00Z',
        dataQuality: {},
      },
    ]);

    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ triggerValue: 0.8, symbol: '600519.SH' });
  });

  it('filters mode and paginates in the database', async () => {
    const findMany = vi.fn(async () => []);
    const service = new RiskService({ riskEvent: { findMany } } as never, {} as never);
    await service.history('shadow', {
      cursor: '51111111-1111-4111-8111-111111111111',
      limit: 20,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { mode: 'shadow' },
      orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
      take: 20,
      cursor: { id: '51111111-1111-4111-8111-111111111111' },
      skip: 1,
    });
  });
});

describe('Supported markets', () => {
  it('keeps HK catalog items searchable but not confirmable', async () => {
    const hk = {
      id: 'instrument-hk',
      instrumentType: 'STOCK',
      market: 'HK',
      canonicalCode: '00700',
      displayName: '腾讯控股',
      pinyin: 'tengxunkonggu',
      pinyinInitials: 'txkg',
      searchAliases: ['腾讯控股', '00700'],
      generation: 1,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      $queryRaw: vi.fn(async () => Promise.reject(new Error('no pg_trgm'))),
      instrument: {
        findMany: vi.fn(async () => [hk]),
        findUnique: vi.fn(async () => hk),
      },
      $transaction: vi.fn(),
    };
    const service = new InstrumentService(prisma as never);
    await expect(service.search('00700')).resolves.toMatchObject([
      { confirmable: false, disabledReason: 'unsupported_market' },
    ]);
    await expect(service.confirm('instrument-hk')).rejects.toThrow('市场');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
