import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import { delay } from 'es-toolkit';
import { startIsolatedNavRedis } from '../backtest/nav-worker-redis.integration-harness.js';
import { MarketChartResultCache } from '../../src/market/market-chart-result-cache.js';
import { redisKey } from '../../src/platform/redis.service.js';
import { barResultCacheKey } from '../../src/market/market-bar-result-cache-store.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import { deferred, request, response } from './market-chart-result-cache.fixture.js';
import type { MarketChartBarsResponseV3 } from '@thesis-ledger/schemas';

describe.skipIf(process.env.E11_BAR_CACHE_REDIS !== '1')('基础K线实际隔离Redis', () => {
  let isolated: Awaited<ReturnType<typeof startIsolatedNavRedis>>;
  let client: Redis;
  beforeAll(async () => {
    isolated = await startIsolatedNavRedis();
    client = new Redis(isolated.redisUrl);
    await client.ping();
  }, 30_000);
  afterAll(async () => { await client?.quit(); await isolated?.cleanup(); }, 30_000);
  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-11T15:35:10Z'));
    await client.flushdb();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  function environment(redis = client) {
    const state = { generation: 'a'.repeat(64), ready: true };
    const dsa = { timeoutMs: 5000, marketCacheContextV3: vi.fn(async (input: object) => ({
      ...input, generation: state.generation, policyRevision: 1, ready: state.ready,
      reason: state.ready ? null : 'disabled',
    })) };
    const sessions = { read: async () => ({ state: 'open', date: request.start }) };
    const cache = new MarketChartResultCache(dsa as never, { client: redis } as never, sessions as never);
    const load = vi.fn(async (input = request) => response(input));
    const read = (id: string, refresh = false) => {
      const input = { ...request, requestId: id };
      return cache.resolve(input, { limit: 90, refresh }, () => load(input));
    };
    return { state, load, read };
  }
  const payloadKey = () => redisKey('cache', barResultCacheKey(request, 'a'.repeat(64), 1, 90));

  it('跨实例普通并发仅加载一次，独立关联请求并保持原始时点', async () => {
    const first = environment(); const second = environment();
    first.load.mockImplementation(async (input) => { await delay(100); return response(input); });
    const reads = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? second : first).read(`request-${i}`)));
    expect(first.load.mock.calls.length + second.load.mock.calls.length).toBe(1);
    expect(reads.map(r => r.response.requestId)).toEqual(Array.from({ length: 12 }, (_, i) => `request-${i}`));
    expect(reads.every(r => r.response.sourcePriceBasis.observedAt === reads[0]!.response.sourcePriceBasis.observedAt)).toBe(true);
    expect((await first.read('later')).cached).toBe(true);
    expect(await client.pttl(payloadKey())).toBeGreaterThan(0);
    expect(await client.pttl(payloadKey())).toBeLessThanOrEqual(60_000);
  });

  it('原始获取时点决定实际剩余TTL，到期后重新加载', async () => {
    const env = environment();
    env.load.mockImplementationOnce(async input => response(input, 1.021, Date.now() - 59_600));
    const first = await env.read('first');
    const ttl = await client.pttl(payloadKey());
    expect(ttl).toBeGreaterThan(0); expect(ttl).toBeLessThanOrEqual(400);
    expect((await env.read('hit')).freshUntil).toBe(first.freshUntil);
    await delay(450);
    expect((await env.read('expired')).cached).toBe(false);
    expect(env.load).toHaveBeenCalledTimes(2);
  });

  it('实际Lua围栏拒绝普通旧请求覆盖较新刷新', async () => {
    const first = environment(); const second = environment();
    const began = deferred<void>(); const slow = deferred<MarketChartBarsResponseV3>();
    first.load.mockImplementationOnce(async () => { began.resolve(); return slow.promise; });
    second.load.mockImplementation(async input => response(input, 1.024));
    const old = first.read('old'); await began.promise;
    await second.read('refresh', true);
    slow.resolve(response({ ...request, requestId: 'old' })); await old;
    expect((await first.read('after')).response.bars[0]?.close).toBe(1.024);
  });

  it('控制代次隔离且关闭后不返回旧成功值', async () => {
    const env = environment(); await env.read('first');
    env.state.generation = 'b'.repeat(64);
    expect((await env.read('new-generation')).cached).toBe(false);
    env.state.ready = false;
    await expect(env.read('disabled')).rejects.toMatchObject({ code: 'control-rejected' });
    expect(env.load).toHaveBeenCalledTimes(2);
  });

  it('来源错误不发布，损坏载荷重新加载', async () => {
    const env = environment(); env.load.mockRejectedValueOnce(new DsaError('fixture denied', 'permission-denied'));
    await expect(env.read('failed')).rejects.toThrow('fixture denied');
    expect(await client.get(payloadKey())).toBeNull();
    await env.read('success');
    await client.set(payloadKey(), '{broken', 'PX', 60_000);
    expect((await env.read('repair')).cached).toBe(false);
    expect(env.load).toHaveBeenCalledTimes(3);
  });

  it('实际Redis客户端断开后降级，控制拒绝仍不放行', async () => {
    const disconnected = new Redis(isolated.redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null });
    try {
      await new Promise<void>((resolve) => disconnected.once('ready', resolve));
      disconnected.disconnect();
      const env = environment(disconnected);
      expect((await env.read('fallback')).cached).toBe(false);
      env.state.ready = false;
      await expect(env.read('denied')).rejects.toMatchObject({ code: 'control-rejected' });
      expect(env.load).toHaveBeenCalledTimes(1);
    } finally { disconnected.disconnect(); }
  });
});
