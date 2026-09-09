import { redisKey, type RedisService } from '../platform/redis.service.js';

export type MarketCachePolicy = {
  freshSeconds: number;
  lastValidSeconds: number;
};

export const MARKET_CACHE_POLICIES = {
  realtimeQuote: { freshSeconds: 15, lastValidSeconds: 86_400 },
  indicator: { freshSeconds: 60, lastValidSeconds: 86_400 },
  chipSummary: { freshSeconds: 15 * 60, lastValidSeconds: 7 * 86_400 },
  fundNavHistoryLastValidSeconds: 90 * 86_400,
} as const;

export const historicalSeriesFreshSeconds = (end?: string) => {
  const today = new Date().toISOString().slice(0, 10);
  return end && end.slice(0, 10) < today ? 30 * 86_400 : 6 * 60 * 60;
};

export class MarketResultCache {
  constructor(private readonly redis: RedisService) {}

  async readFresh<T>(
    key: string,
    parse: (value: unknown) => T,
    markCached: (value: T) => T,
  ): Promise<T | null> {
    const client = this.redis?.client;
    if (!client) return null;
    try {
      const cached = await client.get(redisKey('cache', `${key}:fresh`));
      return cached ? markCached(parse(JSON.parse(cached))) : null;
    } catch {
      return null;
    }
  }

  async transform<T>(input: {
    key: string;
    refresh: boolean;
    parse: (value: unknown) => T;
    load: () => Promise<T>;
    markCached: (value: T) => T;
    markStale: (value: T) => T;
    policy: MarketCachePolicy;
  }): Promise<T> {
    const client = this.redis?.client;
    if (!client) return input.load();

    if (!input.refresh) {
      const cached = await this.readFresh(input.key, input.parse, input.markCached);
      if (cached) return cached;
    }

    try {
      const value = await input.load();
      try {
        await client
          .multi()
          .set(
            redisKey('cache', `${input.key}:fresh`),
            JSON.stringify(value),
            'EX',
            input.policy.freshSeconds,
          )
          .set(
            redisKey('cache', `${input.key}:last-valid`),
            JSON.stringify(value),
            'EX',
            input.policy.lastValidSeconds,
          )
          .exec();
      } catch {
        // 缓存不可用时仍返回已经取得的有效行情。
      }
      return value;
    } catch (error) {
      try {
        const lastValid = await client.get(redisKey('cache', `${input.key}:last-valid`));
        if (lastValid) return input.markStale(input.parse(JSON.parse(lastValid)));
      } catch {
        // 保留原始上游错误，不让缓存故障覆盖诊断信息。
      }
      throw error;
    }
  }
}
