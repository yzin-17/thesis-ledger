import { describe, expect, it, vi } from 'vitest';
import { RiskService } from '../src/risk/risk.service.js';
import { MarketService, resolveEffectiveBars } from '../src/market/market.service.js';
import { classifyEmptyBarRange, MarketStorageService } from '../src/market/market-storage.service.js';
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

describe('Bar provenance and effective projection', () => {
  const timestamp = '2026-08-20T01:00:00Z';
  const bar = (provider: string, close: number, fallbackUsed: boolean) => ({
    version: 1 as const,
    symbol: '600519.SH',
    timeframe: '1d' as const,
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    amount: close,
    provider,
    fetchedAt: '2026-08-20T02:00:00Z',
    freshness: 'live' as const,
    fallbackUsed,
    servedFromCache: false,
  });

  it('chooses one primary bar per timestamp', () => {
    const result = resolveEffectiveBars([bar('fallback', 9, true), bar('primary', 10, false)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ provider: 'primary', close: 10, fallbackUsed: false });
  });

  it('marks database fallback stale and lets strict callers reject it', async () => {
    const dsa = { get: vi.fn(async () => Promise.reject(new Error('provider down'))) };
    const prisma = {
      marketBar: {
        findMany: vi.fn(async () => [
          {
            symbol: '600519.SH',
            timeframe: '1d',
            timestamp: new Date(timestamp),
            open: 10,
            high: 10,
            low: 10,
            close: 10,
            volume: 1,
            amount: 10,
            provider: 'primary',
            fetchedAt: new Date('2026-08-20T02:00:00Z'),
            freshness: 'live',
            fallbackUsed: false,
          },
        ]),
      },
    };
    const service = new MarketService(dsa as never, {} as never, prisma as never);
    await expect(service.getBars('600519.SH', '1d')).resolves.toMatchObject([
      { freshness: 'stale', servedFromCache: true },
    ]);
    await expect(
      service.getBars('600519.SH', '1d', undefined, { allowStale: false }),
    ).rejects.toThrow('陈旧');
  });
});

describe('Backfill outcome and supported markets', () => {
  it('distinguishes legitimate closed-market no-data from incomplete trading-day data', () => {
    expect(classifyEmptyBarRange('2026-08-22T00:00:00Z', '2026-08-23T23:00:00Z')).toBe(
      'no-data',
    );
    expect(classifyEmptyBarRange('2026-08-20T00:00:00Z', '2026-08-20T23:00:00Z')).toBe(
      'incomplete',
    );
  });

  it('does not mark an empty trading-day backfill as 100%', async () => {
    const state = {
      id: 'backfill',
      symbol: '600519.SH',
      timeframe: '1d',
      start: new Date('2026-08-20T00:00:00Z'),
      end: new Date('2026-08-20T23:00:00Z'),
      cursor: null as Date | null,
      status: 'queued',
      progress: 25,
      attempts: 0,
      error: null as string | null,
    };
    const prisma = {
      backfillJob: {
        findUniqueOrThrow: vi.fn(async () => state),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
          Object.assign(state, data),
        ),
      },
      marketBar: { findFirst: vi.fn(async () => null), upsert: vi.fn() },
      asset: { upsert: vi.fn() },
      $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
    };
    const storage = new MarketStorageService(
      prisma as never,
      { getBars: vi.fn(async () => []) } as never,
      { record: vi.fn() } as never,
    );
    await storage.runBackfill('backfill');
    expect(state).toMatchObject({ status: 'queued', progress: 25 });
    expect(state.error).toContain('未返回 Bar');
  });

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
