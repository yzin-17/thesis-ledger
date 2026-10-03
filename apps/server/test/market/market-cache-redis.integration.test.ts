import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import { startIsolatedNavRedis } from '../backtest/nav-worker-redis.integration-harness.js';
import { MarketQuoteReader } from '../../src/market/market-quote-reader.js';
import { redisKey, type RedisService } from '../../src/platform/redis.service.js';

const quote = {
  version: 3,
  symbol: '600519.SH',
  open: 2,
  high: 2,
  low: 2,
  price: 2,
  previousClose: 2,
  volume: 100,
  amount: 200,
  stale: false,
  provider: 'akshare',
  upstreamSource: 'eastmoney',
  marketTime: '2026-10-01T07:00:00Z',
  fetchedAt: '2026-10-01T07:00:01Z',
  freshness: 'live',
};

describe.skipIf(process.env.E04_CACHE_REDIS !== '1')('当前行情缓存隔离 Redis', () => {
  let isolated: Awaited<ReturnType<typeof startIsolatedNavRedis>>;
  let client: Redis;
  beforeAll(async () => {
    isolated = await startIsolatedNavRedis();
    client = new Redis(isolated.redisUrl);
    await client.ping();
  }, 30_000);
  afterAll(async () => {
    await client?.quit();
    await isolated?.cleanup();
  }, 30_000);
  beforeEach(async () => {
    await client.flushdb();
  });
  const reader = (get: ReturnType<typeof vi.fn>) =>
    new MarketQuoteReader({ get, timeoutMs: 2000 } as never, { client } as RedisService);

  it('跨实例并发只取一次来源，读者共享完整当前缓存', async () => {
    const get = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return quote;
    });
    const readers = [reader(get), reader(get)];
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) => readers[index % 2]!.getQuote('600519.SH')),
    );
    expect(get).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.symbol === quote.symbol && result.version === 3)).toBe(
      true,
    );
    expect(await client.get(redisKey('lock', 'market:quote:3:600519.SH'))).toBeNull();
  });

  it('旧命名空间不读回，当前错配标的及旧载荷不充当缓存事实', async () => {
    const get = vi.fn(async () => quote);
    await client.set(
      redisKey('cache', 'quote:2:600519.SH:fresh'),
      JSON.stringify({ ...quote, version: 2, price: 999 }),
    );
    expect((await reader(get).getQuote('600519.SH')).price).toBe(2);
    for (const invalid of [
      { ...quote, version: 2 },
      { ...quote, symbol: '000001.SZ' },
    ]) {
      await client.set(redisKey('cache', 'quote:3:600519.SH:fresh'), JSON.stringify(invalid));
      await client.set(redisKey('cache', 'quote:3:600519.SH:last-valid'), JSON.stringify(invalid));
      await expect(reader(get).getQuote('600519.SH')).rejects.toThrow();
    }
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('来源故障只允许同身份当前陈旧值，要求新鲜时拒绝', async () => {
    await client.set(redisKey('cache', 'quote:3:600519.SH:last-valid'), JSON.stringify(quote));
    const get = vi.fn(async () => {
      throw new Error('isolated-source-down');
    });
    expect((await reader(get).getQuote('600519.SH', { refresh: true })).stale).toBe(true);
    await expect(
      reader(get).getQuote('600519.SH', { refresh: true, allowStale: false }),
    ).rejects.toThrow('新鲜');
  });
});
