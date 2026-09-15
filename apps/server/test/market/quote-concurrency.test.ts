import { describe, expect, it, vi } from 'vitest';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import { MarketService } from '../../src/market/market.service.js';
import { StructuredLogger } from '../../src/platform/structured-logger.js';

const quote = {
  version: 1,
  symbol: '600519.SH',
  open: 10,
  high: 11,
  low: 9,
  price: 10,
  previousClose: 10,
  volume: 1,
  amount: 10,
  marketTime: '2026-09-14T01:00:00Z',
  fetchedAt: '2026-09-14T01:00:01Z',
  freshness: 'live',
  stale: false,
  provider: 'fixture',
};

type SharedRedis = {
  client: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    eval: ReturnType<typeof vi.fn>;
    multi: () => {
      set: (key: string, value: string) => unknown;
      exec: () => Promise<void>;
    };
  };
  values: Map<string, string>;
  ttl: number | undefined;
};

const createSharedRedis = (): SharedRedis => {
  const values = new Map<string, string>();
  const locks = new Map<string, string>();
  const state: SharedRedis = {
    values,
    ttl: undefined,
    client: {
      get: vi.fn(async (key: string) =>
        key.includes(':lock:') ? (locks.get(key) ?? null) : (values.get(key) ?? null),
      ),
      set: vi.fn(async (key: string, value: string, _mode: string, ttl: number) => {
        state.ttl = ttl;
        if (locks.has(key)) return null;
        locks.set(key, value);
        return 'OK';
      }),
      eval: vi.fn(async (_script: string, _keyCount: number, key: string, value: string) => {
        if (locks.get(key) === value) locks.delete(key);
        return 1;
      }),
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
  return state;
};

const createDsa = (implementation: () => Promise<unknown>) => ({
  timeoutMs: 7_000,
  get: vi.fn(implementation),
});

describe('Quote 分布式锁并发保护', () => {
  it('共享 Redis 时只允许一个 DSA 请求，waiter 重读 fresh 且租约随 timeout 派生', async () => {
    const redis = createSharedRedis();
    const dsa = createDsa(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return quote;
    });
    const first = new MarketService(dsa as never, redis as never);
    const second = new MarketService(dsa as never, redis as never);

    const owner = first.getQuote('600519.SH');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const waiter = second.getQuote('600519.SH');
    const [ownerResult, waiterResult] = await Promise.all([owner, waiter]);

    expect(dsa.get).toHaveBeenCalledTimes(1);
    expect(dsa.get).toHaveBeenCalledWith('/api/v1/thesis-ledger/market/quote?symbol=600519.SH', 1);
    expect(redis.ttl).toBe(12_000);
    expect(ownerResult.servedFromCache).toBe(false);
    expect(waiterResult).toMatchObject({ servedFromCache: true, stale: false, freshness: 'live' });
  });

  it('owner 工作超过旧 6 秒语义时仍持有派生租约，waiter 不会接管并重复拉取', async () => {
    vi.useFakeTimers();
    try {
      const redis = createSharedRedis();
      let resolveProvider!: (value: typeof quote) => void;
      const dsa = createDsa(
        () =>
          new Promise<typeof quote>((resolve) => {
            resolveProvider = resolve;
          }),
      );
      const first = new MarketService(dsa as never, redis as never);
      const second = new MarketService(dsa as never, redis as never);

      const owner = first.getQuote('600519.SH');
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
      const waiter = second.getQuote('600519.SH');
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
      expect(dsa.get).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(6_100);
      expect(redis.client.eval).not.toHaveBeenCalled();
      resolveProvider(quote);
      await vi.advanceTimersByTimeAsync(200);
      await expect(Promise.all([owner, waiter])).resolves.toHaveLength(2);
      expect(dsa.get).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('owner 失败时 waiter 只读 last-valid，且不会再次调用 DSA', async () => {
    const redis = createSharedRedis();
    const lastValidKey = 'thesis-ledger:cache:v1:quote:600519.SH:last-valid';
    redis.values.set(lastValidKey, JSON.stringify(quote));
    const dsa = createDsa(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new DsaError('上游不可用', 'unavailable');
    });
    const logs: Array<Record<string, unknown>> = [];
    const logger = vi
      .spyOn(StructuredLogger.prototype, 'log')
      .mockImplementation((record) => logs.push(record as Record<string, unknown>));
    const first = new MarketService(dsa as never, redis as never);
    const second = new MarketService(dsa as never, redis as never);

    const results = await Promise.all([
      first.getQuote('600519.SH', { refresh: true }),
      second.getQuote('600519.SH', { refresh: true }),
    ]);

    expect(dsa.get).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      expect.objectContaining({ stale: true, freshness: 'stale', servedFromCache: true }),
      expect.objectContaining({ stale: true, freshness: 'stale', servedFromCache: true }),
    ]);
    logger.mockRestore();
    expect(
      logs
        .filter((record) => record.operation === 'market.quote' && record.stage === 'dsa-call')
        .map((record) => record.status),
    ).toEqual(expect.arrayContaining(['started', 'failure']));
  });

  it('owner 失败且没有 last-valid 时两方都结构化 unavailable，仍只有一次 DSA', async () => {
    const redis = createSharedRedis();
    const dsa = createDsa(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('provider failure');
    });
    const first = new MarketService(dsa as never, redis as never);
    const second = new MarketService(dsa as never, redis as never);

    const results = await Promise.allSettled([
      first.getQuote('600519.SH', { refresh: true }),
      second.getQuote('600519.SH', { refresh: true }),
    ]);

    expect(dsa.get).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      expect.objectContaining({ status: 'rejected' }),
      expect.objectContaining({ status: 'rejected' }),
    ]);
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({ code: 'unavailable' });
  });

  it('refresh waiter 也只能重读 owner 写入的 fresh，不得绕过锁再次拉取', async () => {
    const redis = createSharedRedis();
    const dsa = createDsa(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return quote;
    });
    const first = new MarketService(dsa as never, redis as never);
    const second = new MarketService(dsa as never, redis as never);

    const owner = first.getQuote('600519.SH');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const refreshWaiter = second.getQuote('600519.SH', { refresh: true });
    const [, waiterResult] = await Promise.all([owner, refreshWaiter]);

    expect(dsa.get).toHaveBeenCalledTimes(1);
    expect(waiterResult).toMatchObject({ servedFromCache: true, stale: false });
  });

  it('锁设施异常时只返回 last-valid，不以异常扩大为 DSA 请求', async () => {
    const values = new Map([
      ['thesis-ledger:cache:v1:quote:600519.SH:last-valid', JSON.stringify(quote)],
    ]);
    const dsa = createDsa(async () => quote);
    const redis = {
      client: {
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        set: vi.fn(async () => {
          throw new Error('redis down');
        }),
      },
    };
    const service = new MarketService(dsa as never, redis as never);

    await expect(service.getQuote('600519.SH')).resolves.toMatchObject({
      stale: true,
      freshness: 'stale',
      servedFromCache: true,
    });
    expect(dsa.get).not.toHaveBeenCalled();
  });

  it('Redis client 缺少 set 时 fail-closed，只返回 last-valid 且不调用 DSA', async () => {
    const values = new Map([
      ['thesis-ledger:cache:v1:quote:600519.SH:last-valid', JSON.stringify(quote)],
    ]);
    const dsa = createDsa(async () => quote);
    const redis = {
      client: {
        get: vi.fn(async (key: string) => values.get(key) ?? null),
      },
    };
    const service = new MarketService(dsa as never, redis as never);

    await expect(service.getQuote('600519.SH')).resolves.toMatchObject({
      stale: true,
      freshness: 'stale',
      servedFromCache: true,
    });
    expect(dsa.get).not.toHaveBeenCalled();
  });

  it('fresh 缓存损坏时继续尝试 last-valid，且不触发 DSA', async () => {
    const redis = createSharedRedis();
    redis.values.set('thesis-ledger:cache:v1:quote:600519.SH:fresh', '{broken-json');
    redis.values.set('thesis-ledger:cache:v1:quote:600519.SH:last-valid', JSON.stringify(quote));
    const dsa = createDsa(async () => quote);
    const logs: Array<Record<string, unknown>> = [];
    const logger = vi
      .spyOn(StructuredLogger.prototype, 'log')
      .mockImplementation((record) => logs.push(record as Record<string, unknown>));
    const service = new MarketService(dsa as never, redis as never);

    await expect(service.getQuote('600519.SH')).resolves.toMatchObject({
      stale: true,
      freshness: 'stale',
      servedFromCache: true,
    });
    logger.mockRestore();
    expect(dsa.get).not.toHaveBeenCalled();
    const quoteStages = logs
      .filter((record) => record.operation === 'market.quote')
      .map((record) => record.stage);
    expect(quoteStages).not.toContain('fresh-hit');
    expect(quoteStages).toContain('last-valid');
  });

  it('阶段日志包含 fresh-hit、lock-acquired、DSA-call 和 lock-wait', async () => {
    const redis = createSharedRedis();
    const dsa = createDsa(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return quote;
    });
    const logs: Array<Record<string, unknown>> = [];
    const logger = vi
      .spyOn(StructuredLogger.prototype, 'log')
      .mockImplementation((record) => logs.push(record as Record<string, unknown>));
    const first = new MarketService(dsa as never, redis as never);
    const second = new MarketService(dsa as never, redis as never);

    await Promise.all([first.getQuote('600519.SH'), second.getQuote('600519.SH')]);

    logger.mockRestore();
    const stages = logs
      .filter((record) => record.operation === 'market.quote')
      .map((record) => record.stage);
    expect(stages).toEqual(
      expect.arrayContaining(['lock-acquired', 'lock-wait', 'dsa-call', 'fresh-hit']),
    );
    expect(logs.filter((record) => record.operation === 'market.quote')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ traceId: 'unknown', symbol: '600519.SH' }),
      ]),
    );
    for (const record of logs.filter((item) => item.operation === 'market.quote'))
      expect(record.durationMs).toEqual(expect.any(Number));
  });
});
