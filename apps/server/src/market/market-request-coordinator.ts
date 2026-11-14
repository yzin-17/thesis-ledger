import { delay, withTimeout } from 'es-toolkit';
import { redisKey, type RedisService } from '../platform/redis.service.js';

/** es-toolkit 1.51的超时竞速不会自动清理败者，操作结束后只撤销计时器。 */
export function withMarketRequestDeadline<T>(work: () => Promise<T>, ms: number): Promise<T> {
  const timer = new AbortController();
  return withTimeout(work, ms, { signal: timer.signal }).finally(() => timer.abort());
}

/** Market现有请求合并和有界资源锁；不承担来源限频。 */
export class MarketRequestCoordinator {
  private readonly flights = new Map<string, Promise<unknown>>();
  constructor(private readonly redis: RedisService, private readonly timeoutMs: () => number,
    private readonly commandDeadlineMs?: number) {}

  private command<T>(work: () => Promise<T>): Promise<T> {
    return this.commandDeadlineMs === undefined ? work() : withMarketRequestDeadline(work, this.commandDeadlineMs);
  }

  get leaseMs() {
    const configured = Number(this.timeoutMs());
    const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 5_000;
    return timeoutMs * 4 + 5_000;
  }

  singleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.flights.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const pending = work().finally(() => {
      if (this.flights.get(key) === pending) this.flights.delete(key);
    });
    this.flights.set(key, pending);
    return pending;
  }

  async withDistributedLock<T>(key: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (!this.redis?.client) return work();
    const client = this.redis.client;
    if (typeof client.set !== 'function') return work();
    const lockKey = redisKey('lock', `market:${key}`);
    const lockValue = crypto.randomUUID();
    const leaseMs = this.leaseMs;
    let acquired: string | null;
    try {
      acquired = await this.command(() => client.set(lockKey, lockValue, 'PX', leaseMs, 'NX'));
    } catch {
      return work();
    }
    if (acquired !== 'OK') {
      if (typeof client.get !== 'function') return work();
      for (let attempt = 0; attempt < Math.ceil(leaseMs / 200); attempt += 1) {
        signal?.throwIfAborted();
        await delay(200, signal ? { signal } : {});
        let locked;
        try {
          locked = typeof client.get === 'function' && await this.command(() => client.get(lockKey));
        } catch {
          return work();
        }
        if (!locked) break;
      }
      return work();
    }
    try {
      return await work();
    } finally {
      try {
        if (typeof client.eval === 'function')
          await this.command(() => client.eval('if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
            1, lockKey, lockValue));
      } catch {
        // 原有租约负责最终释放；Redis故障不能覆盖业务结果。
      }
    }
  }
}
