import { describe, expect, it, vi } from 'vitest';
import { MarketService } from '../../src/market/market.service.js';
import { MarketStorageService } from '../../src/market/market-storage.service.js';
import { DataQualityService } from '../../src/quality/data-quality.service.js';

describe('行情缓存', () => {
  const quote = {
    open: 10,
    high: 11,
    low: 9,
    price: 10,
    previousClose: 10,
    volume: 1,
    amount: 10,
    marketTime: '2025-01-01T00:00:00Z',
    fetchedAt: '2025-01-01T00:00:01Z',
    freshness: 'live',
    stale: false,
    provider: 'dsa-fork',
  };

  it('重复请求命中新鲜缓存且不重复调用 Provider', async () => {
    const values = new Map<string, string>();
    const dsa = { get: vi.fn(async () => quote) };
    const redis = {
      client: {
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        multi: () => {
          const writes: Array<[string, string]> = [];
          const chain = {
            set: (key: string, value: string) => {
              writes.push([key, value]);
              return chain;
            },
            exec: async () => {
              for (const [key, value] of writes) values.set(key, value);
            },
          };
          return chain;
        },
      },
    };
    const service = new MarketService(dsa as never, redis as never);
    await service.getQuote('600519');
    await service.getQuote('600519');
    expect(dsa.get).toHaveBeenCalledTimes(1);
  });
  it('基金净值历史相同范围并发请求只调用一次 DSA 并使用完整锁 key', async () => {
    const points = [
      {
        version: 1,
        symbol: '000001.OF',
        unitNav: 1.1,
        navDate: '2025-01-01T00:00:00Z',
        provider: 'dsa-fork',
        fetchedAt: '2025-01-01T00:00:01Z',
        freshness: 'delayed',
      },
    ];
    const dsa = {
      get: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return points;
      }),
    };
    const lockKeys: string[] = [];
    const redis = {
      client: {
        set: vi.fn(async (key: string) => {
          lockKeys.push(key);
          return 'OK';
        }),
        eval: vi.fn(async () => 0),
      },
    };
    const service = new MarketService(dsa as never, redis as never);
    const range = { start: '2025-01-01', end: '2025-01-31', limit: 5 };

    await Promise.all([
      service.getFundNavHistory('000001.OF', range),
      service.getFundNavHistory('000001.OF', range),
    ]);

    expect(dsa.get).toHaveBeenCalledTimes(1);
    expect(lockKeys).toHaveLength(1);
    expect(lockKeys[0]).toContain('000001.OF');
    expect(lockKeys[0]).toContain('2025-01-01');
    expect(lockKeys[0]).toContain('2025-01-31');
    expect(lockKeys[0]).toContain(':5');
  });
  it('基金净值历史不同范围不会合并 single-flight', async () => {
    const points = [
      {
        version: 1,
        symbol: '000001.OF',
        unitNav: 1.1,
        navDate: '2025-01-01T00:00:00Z',
        provider: 'dsa-fork',
        fetchedAt: '2025-01-01T00:00:01Z',
        freshness: 'delayed',
      },
    ];
    const paths: string[] = [];
    const dsa = {
      get: vi.fn(async (path: string) => {
        paths.push(path);
        return points;
      }),
    };
    const service = new MarketService(dsa as never, {} as never);

    await Promise.all([
      service.getFundNavHistory('000001.OF', { start: '2025-01-01', limit: 5 }),
      service.getFundNavHistory('000001.OF', { start: '2025-02-01', limit: 5 }),
    ]);

    expect(dsa.get).toHaveBeenCalledTimes(2);
    expect(paths[0]).toContain('start=2025-01-01');
    expect(paths[1]).toContain('start=2025-02-01');
  });
  it('把 DSA Bar、Indicator 和 Chip 映射为统一契约', async () => {
    const timestamp = '2025-01-01T00:00:00Z';
    const dsa = {
      get: vi.fn(async (path: string) => {
        if (path.includes('/bars'))
          return [
            {
              timestamp,
              open: 10,
              high: 11,
              low: 9,
              close: 10,
              volume: 1,
              amount: 10,
              provider: 'dsa-fork',
            },
          ];
        if (path.includes('/indicators/'))
          return {
            parameters: { period: 14 },
            timeframe: '1d',
            marketTime: timestamp,
            calculatedAt: timestamp,
            values: { rsi14: 50 },
            engineVersion: 'fixture',
            provider: 'dsa-fork',
          };
        return {
          buckets: [{ price: 10, weight: 1 }],
          averageCost: 10,
          mainPeak: 10,
          profitRatio: 0.5,
          range70: [9, 11],
          range90: [8, 12],
          concentration: 0.4,
          engineVersion: 'fixture',
          provider: 'dsa-fork',
          calculatedAt: timestamp,
        };
      }),
    };
    const service = new MarketService(dsa as never, {} as never);
    await expect(service.getBars('600519', '1d')).resolves.toMatchObject([
      { symbol: '600519.SH', timeframe: '1d', provider: 'dsa-fork' },
    ]);
    await expect(service.getIndicator('600519', 'RSI')).resolves.toMatchObject({
      name: 'RSI',
      provider: 'dsa-fork',
    });
    await expect(service.getChip('600519')).resolves.toMatchObject({
      symbol: '600519.SH',
      provider: 'dsa-fork',
      engineVersion: 'fixture',
    });
  });
});

describe('行情落库与数据质量', () => {
  it('日线 Bar 幂等 upsert 且先建立 Asset Master', async () => {
    const upsertAsset = vi.fn(async () => ({}));
    const upsertBar = vi.fn(async ({ create }: { create: object }) => create);
    const prisma = {
      asset: { upsert: upsertAsset },
      marketBar: { upsert: upsertBar, findFirst: vi.fn() },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const quality = {};
    const service = new MarketStorageService(prisma as never, {} as never, quality as never);
    const bars = [
      {
        version: 1,
        symbol: '600519.SH',
        timeframe: '1d',
        timestamp: '2025-01-01T00:00:00Z',
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        volume: 100,
        amount: 1000,
        provider: 'dsa',
      },
    ];
    await service.saveBars(bars);
    await service.saveBars(bars);
    expect(upsertAsset).toHaveBeenCalledTimes(2);
    expect(upsertBar).toHaveBeenCalledTimes(2);
    expect(upsertBar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ symbol_timeframe_timestamp_provider: expect.any(Object) }),
      }),
    );
  });
  it('增量同步从最新时间继续并过滤已落库 Bar', async () => {
    const upsertBar = vi.fn(async ({ create }: { create: object }) => create);
    const prisma = {
      asset: { upsert: vi.fn(async () => ({})) },
      marketBar: {
        upsert: upsertBar,
        findFirst: vi.fn(async () => ({ timestamp: new Date('2025-01-01T00:00:00Z') })),
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const market = {
      getBars: vi.fn(async () => [
        {
          version: 1,
          symbol: '600519.SH',
          timeframe: '1d',
          timestamp: '2025-01-01T00:00:00Z',
          open: 10,
          high: 11,
          low: 9,
          close: 10,
          volume: 1,
          amount: 10,
          provider: 'dsa',
        },
        {
          version: 1,
          symbol: '600519.SH',
          timeframe: '1d',
          timestamp: '2025-01-02T00:00:00Z',
          open: 10,
          high: 11,
          low: 9,
          close: 10,
          volume: 1,
          amount: 10,
          provider: 'dsa',
        },
      ]),
    };
    const service = new MarketStorageService(prisma as never, market as never, {} as never);
    await expect(
      service.syncBars({ symbol: '600519.SH', timeframe: '1d', mode: 'incremental' }),
    ).resolves.toMatchObject({ count: 1, mode: 'incremental' });
    expect(upsertBar).toHaveBeenCalledTimes(1);
    expect(market.getBars).toHaveBeenCalledWith('600519.SH', '1d', {
      start: '2025-01-01T00:00:00.000Z',
    });
  });
  it('历史回填保存 cursor/progress，可从中断点继续', async () => {
    const state = {
      id: 'backfill',
      symbol: '600519.SH',
      timeframe: '1d',
      start: new Date('2025-01-01'),
      end: new Date('2025-01-03'),
      cursor: null,
      status: 'queued',
      progress: 0,
      attempts: 0,
    };
    const prisma = {
      backfillJob: {
        create: vi.fn(async ({ data }: { data: object }) => ({ id: 'backfill', ...data })),
        findUniqueOrThrow: vi.fn(async () => state),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
          Object.assign(state, data),
        ),
      },
      asset: { upsert: vi.fn(async () => ({})) },
      marketBar: {
        upsert: vi.fn(async ({ create }: { create: object }) => create),
        findFirst: vi.fn(async () => null),
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const market = {
      getBars: vi.fn(async () => [
        {
          version: 1,
          symbol: '600519.SH',
          timeframe: '1d',
          timestamp: '2025-01-02T00:00:00Z',
          open: 10,
          high: 10,
          low: 10,
          close: 10,
          volume: 1,
          amount: 10,
          provider: 'dsa',
        },
      ]),
    };
    const quality = { record: vi.fn() };
    const service = new MarketStorageService(prisma as never, market as never, quality as never);
    await expect(service.runBackfill('backfill')).resolves.toMatchObject({
      status: 'queued',
      progress: 25,
    });
    expect(state.cursor).toBeInstanceOf(Date);
  });
  it('数据质量问题可查询并标记 resolved', async () => {
    const prisma = {
      dataQualityIssue: {
        findMany: vi.fn(async () => [{ id: 'issue', status: 'open' }]),
        findUnique: vi.fn(async () => ({ id: 'issue', status: 'open' })),
        update: vi.fn(async ({ data }: { data: object }) => ({ id: 'issue', ...data })),
        create: vi.fn(),
      },
    };
    const service = new DataQualityService(prisma as never);
    await expect(service.list('open')).resolves.toEqual([{ id: 'issue', status: 'open' }]);
    await expect(service.resolve('issue')).resolves.toMatchObject({ status: 'resolved' });
  });
});
