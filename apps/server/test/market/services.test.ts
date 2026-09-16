import { describe, expect, it, vi } from 'vitest';
import { MarketService } from '../../src/market/market.service.js';
import { MarketDataController } from '../../src/market/market-data.controller.js';
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
        set: vi.fn(async () => 'OK'),
        eval: vi.fn(async () => 0),
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
  it('普通请求与显式 refresh 在缓存未命中时共享同一底层 flight', async () => {
    const values = new Map<string, string>();
    let resolveProvider!: (value: typeof quote) => void;
    const dsa = {
      get: vi.fn(
        () =>
          new Promise<typeof quote>((resolve) => {
            resolveProvider = resolve;
          }),
      ),
    };
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
        set: vi.fn(async () => 'OK'),
        eval: vi.fn(async () => 0),
      },
    };
    const service = new MarketService(dsa as never, redis as never);

    const regular = service.getQuote('600519');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const refresh = service.getQuote('600519', { refresh: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dsa.get).toHaveBeenCalledOnce();
    resolveProvider(quote);
    await expect(Promise.all([regular, refresh])).resolves.toHaveLength(2);
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
  it('基金净值历史相同范围的普通请求命中新鲜缓存', async () => {
    const values = new Map<string, string>();
    const ttls = new Map<string, number>();
    const points = [
      {
        version: 1,
        symbol: '000001.OF',
        unitNav: 1.1,
        navDate: '2025-01-01T00:00:00Z',
        provider: 'akshare',
        fetchedAt: '2025-01-01T00:00:01Z',
        freshness: 'delayed',
      },
    ];
    const refreshedPoints = [{ ...points[0]!, unitNav: 1.2 }];
    const dsa = {
      get: vi
        .fn()
        .mockResolvedValueOnce(points)
        .mockResolvedValueOnce(refreshedPoints)
        .mockRejectedValueOnce(new Error('upstream unavailable')),
    };
    const redis = {
      client: {
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        set: vi.fn(async () => 'OK'),
        eval: vi.fn(async () => 0),
        multi: () => {
          const writes: Array<[string, string, number]> = [];
          const chain = {
            set: (key: string, value: string, _mode: string, ttl: number) => {
              writes.push([key, value, ttl]);
              return chain;
            },
            exec: async () => {
              for (const [key, value, ttl] of writes) {
                values.set(key, value);
                ttls.set(key, ttl);
              }
            },
          };
          return chain;
        },
      },
    };
    const service = new MarketService(dsa as never, redis as never);
    const range = { start: '2025-01-01', end: '2025-01-31', limit: 5 };

    const first = await service.getFundNavHistory('000001.OF', range);
    const second = await service.getFundNavHistory('000001.OF', range);
    const refreshed = await service.getFundNavHistory('000001.OF', range, { refresh: true });
    const fallback = await service.getFundNavHistory('000001.OF', range, { refresh: true });

    expect(first[0]?.servedFromCache).not.toBe(true);
    expect(second[0]?.servedFromCache).toBe(true);
    expect(refreshed[0]).toMatchObject({ unitNav: 1.2, servedFromCache: false });
    expect(fallback[0]).toMatchObject({
      unitNav: 1.2,
      freshness: 'stale',
      servedFromCache: true,
    });
    expect(dsa.get).toHaveBeenCalledTimes(3);
    const freshEntry = [...ttls.entries()].find(([key]) => key.endsWith(':fresh'));
    expect(freshEntry?.[1]).toBe(30 * 86_400);
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

  it('筹码摘要在十五分钟窗口内不重复请求 DSA', async () => {
    const values = new Map<string, string>();
    const ttls = new Map<string, number>();
    const timestamp = '2025-01-01T00:00:00Z';
    const dsa = {
      get: vi.fn(async () => ({
        buckets: [{ price: 10, weight: 1 }],
        averageCost: 10,
        mainPeak: 10,
        profitRatio: 0.5,
        range70: [9, 11],
        range90: [8, 12],
        concentration: 0.4,
        engineVersion: 'fixture',
        provider: 'akshare',
        calculatedAt: timestamp,
      })),
    };
    const redis = {
      client: {
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        set: vi.fn(async () => 'OK'),
        eval: vi.fn(async () => 0),
        multi: () => {
          const writes: Array<[string, string, number]> = [];
          const chain = {
            set: (key: string, value: string, _mode: string, ttl: number) => {
              writes.push([key, value, ttl]);
              return chain;
            },
            exec: async () => {
              for (const [key, value, ttl] of writes) {
                values.set(key, value);
                ttls.set(key, ttl);
              }
            },
          };
          return chain;
        },
      },
    };
    const service = new MarketService(dsa as never, redis as never);

    const first = await service.getChip('600519');
    const second = await service.getChip('600519');

    expect(first.servedFromCache).not.toBe(true);
    expect(second.servedFromCache).toBe(true);
    expect(dsa.get).toHaveBeenCalledOnce();
    const freshEntry = [...ttls.entries()].find(([key]) => key.endsWith(':fresh'));
    expect(freshEntry?.[1]).toBe(15 * 60);
  });

  it('Indicator 使用缓存并在 refresh 失败时返回 stale fallback', async () => {
    const values = new Map<string, string>();
    const indicatorRaw = {
      parameters: { period: 14 },
      timeframe: '1d',
      marketTime: '2025-01-01T00:00:00Z',
      calculatedAt: '2025-01-01T00:00:00Z',
      values: { rsi14: 50 },
      engineVersion: 'fixture',
      provider: 'dsa-fork',
    };
    const dsa = { get: vi.fn(async () => indicatorRaw) };
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

    await expect(service.getIndicator('600519', 'RSI')).resolves.toMatchObject({
      provider: 'dsa-fork',
    });
    await service.getIndicator('600519', 'RSI');
    expect(dsa.get).toHaveBeenCalledTimes(1);

    await service.getIndicator('600519', 'RSI', {
      start: '2025-01-01',
      parameters: { period: 14 },
    });
    expect(dsa.get).toHaveBeenCalledTimes(2);

    dsa.get.mockRejectedValueOnce(new Error('offline'));
    await expect(service.getIndicator('600519', 'RSI', { refresh: true })).resolves.toMatchObject({
      fallbackUsed: true,
    });
    expect(dsa.get).toHaveBeenCalledTimes(3);
  });

  it('旧 MarketBar storage/backfill 入口已移除', () => {
    expect('syncBars' in MarketDataController.prototype).toBe(false);
    expect('storedBars' in MarketDataController.prototype).toBe(false);
    expect('dailyBarCacheStatus' in MarketDataController.prototype).toBe(false);
  });
});

describe('数据质量', () => {
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
