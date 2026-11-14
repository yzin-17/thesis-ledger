import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketChartBarsRequestV3, MarketChartBarsResponseV3 } from '@thesis-ledger/schemas';
import { barResultCacheKey } from '../../src/market/market-bar-result-cache-store.js';
import { CacheRedisFixture, catalogBase, deferred, request, response, setup } from './market-chart-result-cache.fixture.js';
import { MarketChartReaderV3 } from '../../src/market/market-chart-reader-v3.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-11T15:35:10Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('交互基础行情60秒缓存', () => {
  it('重复读取保持原始值与获取时间，不因命中重置到期时间', async () => {
    const env = setup();
    const first = await env.read();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(59_000);
    const second = await env.read({ ...request, requestId: 'second' });
    expect(second.cached).toBe(true);
    expect(second.response.requestId).toBe('second');
    expect(second.response.sourcePriceBasis).toEqual(first.response.sourcePriceBasis);
    expect(second.response.inputFingerprint).toBe(first.response.inputFingerprint);
    expect(second.freshUntil).toBe('2026-11-11T15:36:10.000Z');
    expect(env.load).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await env.read()).cached).toBe(false);
    expect(env.load).toHaveBeenCalledTimes(2);
  });

  it('20个并发调用合并一次取数，分别绑定自己的请求ID', async () => {
    const env = setup();
    const values = await Promise.all(Array.from({ length: 20 }, (_, i) => env.read({ ...request, requestId: `r${i}` })));
    expect(env.load).toHaveBeenCalledTimes(1);
    expect(values.map(v => v.response.requestId)).toEqual(Array.from({ length: 20 }, (_, i) => `r${i}`));
  });

  it('手动刷新跳过缓存，同轮刷新仍合并', async () => {
    const env = setup();
    await env.read();
    const refreshed = await Promise.all([env.read(request, { refresh: true }), env.read(request, { refresh: true })]);
    expect(env.load).toHaveBeenCalledTimes(2);
    expect(refreshed.every(v => !v.cached)).toBe(true);
  });

  it('刷新前开始的普通请求晚到，不覆盖刷新结果', async () => {
    const env = setup();
    const began = deferred<void>(); const slow = deferred<MarketChartBarsResponseV3>();
    env.load.mockImplementationOnce(async () => { began.resolve(); return slow.promise; });
    env.load.mockImplementationOnce(async input => response(input, 1.024));
    const older = env.read(); await began.promise;
    expect((await env.read(request, { refresh: true })).response.bars[0]?.close).toBe(1.024);
    slow.resolve(response()); await older;
    expect((await env.read()).response.bars[0]?.close).toBe(1.024);
    expect(env.load).toHaveBeenCalledTimes(2);
  });

  it('条数与控制代次改变时分别重新获取', async () => {
    const env = setup(); await env.read();
    await env.read(request, { limit: 180 });
    env.state.generation = 'b'.repeat(64);
    await env.read();
    expect(env.load).toHaveBeenCalledTimes(3);
  });

  it('已有成功值不能绕过当前控制关闭', async () => {
    const env = setup(); await env.read(); env.state.ready = false;
    await expect(env.read()).rejects.toMatchObject({ code: 'control-rejected' });
    expect(env.load).toHaveBeenCalledTimes(1);
  });

  it.each(['invalid-request', 'unsupported-capability'] as const)('旧DSA以%s拒绝新控制契约时只退回原受控读取', async (code) => {
    const env = setup();
    env.dsa.marketCacheContextV3.mockRejectedValue(new DsaError('old contract', code, 422));
    expect((await env.read()).cached).toBe(false);
    expect((await env.read()).cached).toBe(false);
    expect(env.load).toHaveBeenCalledTimes(2);
    expect(env.redis.rows.size).toBe(0);
  });

  it('读取中控制变化时拒绝结果且不发布成功缓存', async () => {
    const env = setup();
    env.load.mockImplementationOnce(async input => { env.state.generation = 'b'.repeat(64); return response(input); });
    await expect(env.read()).rejects.toMatchObject({ code: 'stale-revision' });
    expect([...env.redis.rows.keys()].filter(k => k.includes('market-base-bar-v1:') && !k.endsWith(':writing'))).toEqual([]);
  });

  it('来源错误不会成为缓存，也不会在刷新失败时返回旧成功值', async () => {
    const env = setup(); const error = new Error('permission_denied');
    env.load.mockRejectedValueOnce(error);
    await expect(env.read()).rejects.toBe(error);
    await env.read();
    env.load.mockRejectedValueOnce(error);
    await expect(env.read(request, { refresh: true })).rejects.toBe(error);
    expect(env.load).toHaveBeenCalledTimes(3);
  });

  it('Redis全部命令失败时仍执行原读取，不吞掉控制拒绝', async () => {
    const env = setup(); env.redis.fail = true;
    expect((await env.read()).cached).toBe(false);
    expect((await env.read()).cached).toBe(false);
    expect(env.load).toHaveBeenCalledTimes(2);
    env.state.ready = false;
    await expect(env.read()).rejects.toMatchObject({ code: 'control-rejected' });
  });

  it('Redis命令没有响应时按时限降级，不无限阻塞来源读取', async () => {
    const env = setup(); env.redis.get.mockImplementation(() => new Promise(() => {}));
    const pending = env.read();
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).cached).toBe(false);
    expect(env.load).toHaveBeenCalledTimes(1);
  });

  it('空成功载荷不发布为有效缓存', async () => {
    const env = setup(); env.load.mockImplementation(async input => {
      const result = response(input); return { ...result, bars: [],
        coverage: { ...result.coverage, actualStart: null, actualEnd: null } };
    });
    await env.read(); await env.read();
    expect(env.load).toHaveBeenCalledTimes(2);
  });

  it('损坏载荷视为未命中而非继续使用原指纹', async () => {
    const env = setup(); await env.read();
    const key = [...env.redis.rows.keys()].find(k => k.includes('market-base-bar-v1:') && !k.endsWith(':writing'))!;
    const item = env.redis.rows.get(key)!; const raw = JSON.parse(item.value);
    raw.body.bars[0].close = 1.024; item.value = JSON.stringify(raw);
    expect((await env.read()).cached).toBe(false);
    expect(env.load).toHaveBeenCalledTimes(2);
  });

  it('来源旧获取时点不会因本次转存重置60秒', async () => {
    const env = setup(); env.load.mockImplementation(async input => response(input, 1.021, Date.now() - 70_000));
    await env.read(); await env.read();
    expect(env.load).toHaveBeenCalledTimes(2);
  });

  it('一个等待者取消不取消其他合并请求', async () => {
    const env = setup(); const began = deferred<void>(); const pending = deferred<MarketChartBarsResponseV3>();
    env.load.mockImplementationOnce(async () => { began.resolve(); return pending.promise; });
    const abort = new AbortController();
    const canceled = env.read(request, { signal: abort.signal });
    const other = env.read({ ...request, requestId: 'other' });
    const canceledAssertion = expect(canceled).rejects.toThrow();
    await began.promise; abort.abort(); pending.resolve(response());
    await canceledAssertion;
    expect((await other).response.requestId).toBe('other');
    expect(env.load).toHaveBeenCalledTimes(1);
  });

  it('缓存和控制阶段不扩展原请求总时限，超时晚到不发布缓存', async () => {
    const env = setup(); const began = deferred<void>(); const slow = deferred<MarketChartBarsResponseV3>();
    env.load.mockImplementationOnce(async () => { began.resolve(); return slow.promise; });
    const result = env.read(); const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' });
    await began.promise; await vi.advanceTimersByTimeAsync(5000); await assertion;
    slow.resolve(response()); await vi.advanceTimersByTimeAsync(0);
    expect([...env.redis.rows.keys()].filter(k => k.includes('market-base-bar-v1:') && !k.endsWith(':writing'))).toEqual([]);
  });

  it('日历未知时不进入新增缓存', async () => {
    const env = setup(); env.sessions.read.mockResolvedValue({ state: 'unknown', date: '2026-11-11' });
    await env.read(); await env.read();
    expect(env.load).toHaveBeenCalledTimes(2);
    expect(env.dsa.marketCacheContextV3).not.toHaveBeenCalled();
  });

  it('已知休市仍仅短复用，不认证已完整收盘或延长原始期限', async () => {
    const env = setup(); env.sessions.read.mockResolvedValue({ state: 'closed', date: '2026-11-11' });
    const first = await env.read();
    const hit = await env.read({ ...request, requestId: 'closed' });
    expect(hit.cached).toBe(true);
    expect(hit.response.bars[0]?.completionStatus).toBe(first.response.bars[0]?.completionStatus);
    expect(hit.freshUntil).toBe(first.freshUntil);
    expect(env.load).toHaveBeenCalledTimes(1);
  });

  it('跨Server实例的旧读取不能覆盖新刷新', async () => {
    const redis = new CacheRedisFixture(); const first = setup(redis); const second = setup(redis);
    const began = deferred<void>(); const slow = deferred<MarketChartBarsResponseV3>();
    first.load.mockImplementationOnce(async () => { began.resolve(); return slow.promise; });
    second.load.mockImplementationOnce(async input => response(input, 1.024));
    const older = first.read(); await began.promise;
    await second.read(request, { refresh: true }); slow.resolve(response()); await older;
    expect((await first.read()).response.bars[0]?.close).toBe(1.024);
  });

  it('两个Server实例共享Redis协调，普通并发只读取一次来源', async () => {
    const redis = new CacheRedisFixture(); const first = setup(redis); const second = setup(redis);
    const began = deferred<void>(); const slow = deferred<MarketChartBarsResponseV3>();
    first.load.mockImplementationOnce(async () => { began.resolve(); return slow.promise; });
    const one = first.read(); await began.promise;
    const two = second.read({ ...request, requestId: 'second' });
    await vi.advanceTimersByTimeAsync(1); slow.resolve(response()); await one;
    await vi.advanceTimersByTimeAsync(200);
    expect((await two).response.requestId).toBe('second');
    expect(second.load).not.toHaveBeenCalled();
  });

  it('实际图表读取在DSA基础调用之前复用，并将来源时点与缓存状态投影给消费者', async () => {
    const env = setup();
    const desired = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'policy', revision: 1,
      enabled: true, routes: [{ key: request.routeKey, targets: [{ providerId: 'futu', upstreamSource: 'futu' }] }] };
    const effective = { ...desired, sourceDesiredRevision: 1, appliedAt: '2026-11-11T14:00:00Z',
      routes: [{ key: request.routeKey, targets: [{ ...request.routeTarget, eligible: true, reason: null }], reason: null }] };
    const dsa = { ...env.dsa, effectiveControlPolicyV3: vi.fn(async () => ({ projection: { effective } })),
      marketRouteCatalogV3: vi.fn(async () => ({ ...catalogBase, entries: [{ key: request.routeKey,
        target: { providerId: 'futu', upstreamSource: 'futu' }, state: 'ready' }] })),
      marketChartBarsV3: env.load };
    const reader = new MarketChartReaderV3({ getPolicy: async () => ({ ...desired, syncState: 'applied', effectiveStale: false }) } as never,
      dsa as never, undefined, undefined, env.cache);
    const input = { identity: { symbol: 'AAPL.US', assetType: 'STOCK' as const, timeframe: '1m' as const, adjustment: 'none' as const },
      acceptance: 'interactive' as const, window: { start: request.start, end: request.end, limit: 90 } };
    const first = await reader.read(input); const second = await reader.read(input);
    expect(env.load).toHaveBeenCalledTimes(1);
    expect(first.provenance.servedFromCache).toBe(false);
    expect(second.provenance).toMatchObject({ servedFromCache: true, cacheStatus: 'redis', fetchedAt: first.provenance.fetchedAt });
    expect(second.chartContextV3).toEqual(first.chartContextV3);
    await reader.read({ ...input, refresh: true }); expect(env.load).toHaveBeenCalledTimes(2);
  });
});

it('稳定键隔离完整身份与来源，不受随机请求ID影响', () => {
  const key = (value: MarketChartBarsRequestV3, generation = 'a', limit = 90) => barResultCacheKey(value, generation, 1, limit);
  const baseline = key(request);
  expect(key({ ...request, requestId: 'other' })).toBe(baseline);
  expect(key({ ...request,
    routeKey: Object.fromEntries(Object.entries(request.routeKey).reverse()) as typeof request.routeKey,
    routeTarget: Object.fromEntries(Object.entries(request.routeTarget).reverse()) as typeof request.routeTarget,
  })).toBe(baseline);
  const variants = [
    { ...request, symbol: 'MSFT.US' }, { ...request, start: '2026-11-10' }, { ...request, end: '2026-11-12' },
    { ...request, routeKey: { ...request.routeKey, timeframe: '5m' as const } },
    { ...request, routeKey: { ...request.routeKey, market: 'HK' as const } },
    { ...request, routeKey: { ...request.routeKey, adjustment: 'qfq' as const } },
    { ...request, routeKey: { ...request.routeKey, assetType: 'ETF' as const } },
    { ...request, routeTarget: { ...request.routeTarget, providerId: 'yfinance' } },
    { ...request, routeTarget: { ...request.routeTarget, upstreamSource: 'other' } },
    { ...request, routeTarget: { ...request.routeTarget, routeIndex: 1 } },
  ];
  expect(variants.every(value => key(value) !== baseline)).toBe(true);
  expect(key(request, 'b')).not.toBe(baseline);
  expect(key(request, 'a', 180)).not.toBe(baseline);
});
