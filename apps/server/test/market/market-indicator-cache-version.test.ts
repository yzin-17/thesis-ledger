import { describe, expect, it, vi } from 'vitest';
import { MarketIndicatorCache } from '../../src/market/market.controller.js';
import { redisKey } from '../../src/platform/redis.service.js';

describe('现行指标缓存命名空间', () => {
  it('旧 V2 缓存内容不能被现行计算读取，新结果只写入 V3 命名空间', async () => {
    const oldKey = redisKey('cache', 'market-indicators-v2:fingerprint:engine');
    const currentKey = redisKey('cache', 'market-indicators-v3:fingerprint:engine');
    const get = vi.fn(async (key: string) => key === oldKey ? '{"contractVersion":2}' : null);
    const set = vi.fn(async () => 'OK');
    const cache = new MarketIndicatorCache({ client: { get, set } } as never);

    expect(await cache.get('fingerprint:engine')).toBeNull();
    expect(get).toHaveBeenCalledExactlyOnceWith(currentKey);

    const response = { contractVersion: 3, engineVersion: 'dsa-indicator-v3' } as never;
    await cache.set('fingerprint:engine', response, Date.now() + 10_000);
    expect(set).toHaveBeenCalledWith(currentKey, JSON.stringify(response), 'EX', expect.any(Number));
    expect(set).not.toHaveBeenCalledWith(oldKey, expect.anything(), expect.anything(), expect.anything());
  });
});
