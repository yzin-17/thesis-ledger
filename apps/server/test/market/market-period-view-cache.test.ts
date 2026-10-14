import { describe, expect, it, vi } from 'vitest';
import type { RedisService } from '../../src/platform/redis.service.js';
import { MarketPeriodViewCache } from '../../src/market/market-period-view-cache.js';
import { periodContentFingerprint } from '../../src/market/market-period-source.js';
import { periodViewFixture, refreshSourceFingerprint } from './market-period-view.fixture.js';

function redisFixture() {
  const rows = new Map<string, string>();
  const client = {
    get: vi.fn(async (key: string) => rows.get(key) ?? null),
    set: vi.fn(async (...args: [string, string, ...unknown[]]) => {
      rows.set(args[0], args[1]);
      return 'OK';
    }),
  };
  return { rows, client, redis: { client } as unknown as RedisService };
}

describe('精确时刻的派生视图缓存', () => {
  it('内存和 Redis 命中分别重验，返回内容保持一致且 refresh 重算', async () => {
    const f = periodViewFixture('1w', true);
    const redis = redisFixture();
    const cache = new MarketPeriodViewCache(redis.redis);
    const first = await cache.resolve(f.source, f.window);
    expect(first.status).toBe('miss');
    expect((await cache.resolve(f.source, f.window)).status).toBe('hit');
    const remote = await new MarketPeriodViewCache(redis.redis).resolve(f.source, f.window);
    expect(remote.status).toBe('hit');
    expect(remote.view).toEqual(first.view);
    expect((await cache.resolve(f.source, f.window, true)).status).toBe('miss');
    expect(redis.client.set.mock.calls[0]![2]).toBe('EX');
    expect(redis.client.set.mock.calls[0]![3]).toBe(60);
  });
  it.each(['source', 'basis', 'calendar', 'clock', 'anchor', 'requests'] as const)(
    '%s 变化不复用旧派生结果',
    async (kind) => {
      const f = periodViewFixture('5d');
      const cache = new MarketPeriodViewCache();
      await cache.resolve(f.source, f.window);
      if (kind === 'source') {
        f.source.points[0]!.volume = f.source.points[0]!.volume! + 1;
        refreshSourceFingerprint(f.source);
      }
      if (kind === 'basis')
        f.source.chartContextV3!.sourcePriceBasis.volumeBasis = 'split-adjusted';
      if (kind === 'calendar') f.window.calendar.revision += '-next';
      if (kind === 'clock') f.window.evaluationAsOf = '2026-10-04T00:00:00.000001Z';
      if (kind === 'anchor') f.window.anchorTradingDate = '2026-10-01';
      if (kind === 'requests')
        f.window.indicators = [{ name: 'RSI', parameters: { short: 3, mid: 5, long: 8 } }];
      if (kind === 'anchor') {
        f.source.points = f.source.points.filter(
          (point) => point.timestamp.slice(0, 10) <= '2026-10-01',
        );
        refreshSourceFingerprint(f.source);
      }
      expect((await cache.resolve(f.source, f.window)).status).toBe('miss');
    },
  );
  it('跨周期不复用，跨 Session 结束重新判定缺日状态', async () => {
    const cache = new MarketPeriodViewCache();
    for (const timeframe of ['5d', '1w', '1mo', '1y'] as const) {
      const f = periodViewFixture(timeframe);
      expect((await cache.resolve(f.source, f.window)).status).toBe('miss');
    }
    const f = periodViewFixture();
    f.source.points.pop();
    f.source.chartContextV3!.sourcePriceBasis.observedAt = '2026-10-02T06:59:00Z';
    f.source.provenance.fetchedAt = '2026-10-02T06:59:00Z';
    refreshSourceFingerprint(f.source);
    f.window.evaluationAsOf = '2026-10-02T06:59:00Z';
    const before = await cache.resolve(f.source, f.window);
    expect(before.view.visible.series.points.at(-1)!.completionStatus).toBe('incomplete');
    f.window.evaluationAsOf = '2026-10-02T07:00:00Z';
    const after = await cache.resolve(f.source, f.window);
    expect(after.status).toBe('miss');
    expect(after.view.visible.series.points.at(-1)!.completionStatus).toBe('unknown');
  });
  it.each(['content', 'metadata', 'fingerprint', 'coverage'] as const)(
    'Redis %s 损坏只重算当前事实',
    async (kind) => {
      const f = periodViewFixture();
      const redis = redisFixture();
      await new MarketPeriodViewCache(redis.redis).resolve(f.source, f.window);
      const [key, raw] = [...redis.rows.entries()][0]!;
      const value = JSON.parse(raw);
      if (kind === 'content') value.windows.visible.series.points[0].volume += 1;
      if (kind === 'metadata')
        value.windows.visible.series.derivation.evaluationAsOf = '2026-10-04T00:00:01Z';
      if (kind === 'fingerprint')
        value.windows.visible.periodContext.pointFingerprint = 'f'.repeat(64);
      if (kind === 'coverage')
        value.windows.visible.series.coverage.hasMoreBefore =
          !value.windows.visible.series.coverage.hasMoreBefore;
      if (kind !== 'content')
        value.contentFingerprint = periodContentFingerprint(JSON.stringify(value.windows));
      redis.rows.set(key, JSON.stringify(value));
      expect(
        (await new MarketPeriodViewCache(redis.redis).resolve(f.source, f.window)).status,
      ).toBe('miss');
    },
  );
  it('Redis 读写不可用仍返回当前派生事实，命中前拒绝输入篡改', async () => {
    const f = periodViewFixture();
    const redis = redisFixture();
    redis.client.get.mockRejectedValue(new Error('offline'));
    redis.client.set.mockRejectedValue(new Error('offline'));
    const cache = new MarketPeriodViewCache(redis.redis);
    expect((await cache.resolve(f.source, f.window)).status).toBe('miss');
    f.source.points[0]!.volume = f.source.points[0]!.volume! + 1;
    await expect(cache.resolve(f.source, f.window)).rejects.toThrow();
  });
});
