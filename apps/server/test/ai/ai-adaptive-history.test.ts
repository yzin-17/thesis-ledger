import { describe, expect, it, vi } from 'vitest';
import {
  ADAPTIVE_RULE,
  type AdaptiveObservation,
} from '../../src/ai/adaptive/ai-adaptive-policy.js';
import {
  ADAPTIVE_HISTORY_MUTATION,
  MemoryAdaptiveObservationStore,
  RedisAdaptiveObservationStore,
} from '../../src/ai/adaptive/ai-adaptive-history.store.js';

const sample = (
  requestId: string,
  outcome: AdaptiveObservation['outcome'] = 'success',
): AdaptiveObservation => ({
  requestId,
  outcome,
  at: Date.now(),
  firstMs: 45_000,
  maxGapMs: 1000,
  firstCensored: false,
  gapCensored: false,
});
const profile = 'a'.repeat(64);
describe('运行观测与重试配额', () => {
  it('一次拒绝后的额外尝试消耗配额，成功恢复，重复观测不能重复恢复', async () => {
    const store = new MemoryAdaptiveObservationStore();
    await store.record(profile, sample('success-1'));
    expect(await store.takeRetry(profile, 'rejection-1')).toBe(true);
    expect(await store.takeRetry(profile, 'rejection-2')).toBe(false);
    await store.record(profile, sample('success-1'));
    expect(await store.takeRetry(profile, 'rejection-2')).toBe(false);
    await store.record(profile, sample('success-2'));
    expect(await store.takeRetry(profile, 'rejection-1')).toBe(false);
    expect(await store.takeRetry(profile, 'rejection-2')).toBe(true);
  });
  it('并发领取只有一个获准，不同profile相互隔离', async () => {
    const store = new MemoryAdaptiveObservationStore();
    expect(
      await Promise.all([store.takeRetry(profile, 'a'), store.takeRetry(profile, 'b')]),
    ).toEqual([true, false]);
    expect(await store.takeRetry('b'.repeat(64), 'b')).toBe(true);
  });
  it('观测有长度与时间边界，返回值不能修改内部状态', async () => {
    let now = Date.now();
    const store = new MemoryAdaptiveObservationStore(() => now);
    for (let i = 0; i < 520; i++) await store.record(profile, sample(String(i)));
    const history = await store.read(profile);
    expect(history.observations).toHaveLength(ADAPTIVE_RULE.maxObservations);
    history.observations.length = 0;
    expect((await store.read(profile)).observations).toHaveLength(ADAPTIVE_RULE.maxObservations);
    now += ADAPTIVE_RULE.windowMs;
    expect((await store.read(profile)).observations).toEqual([]);
  });
  it('Redis读失败、损坏或非法配额时回到不可用，不学造假样本', async () => {
    for (const raw of ['invalid', JSON.stringify({ observations: [], credit: 99, granted: [] })]) {
      const store = new RedisAdaptiveObservationStore({
        get: vi.fn().mockResolvedValue(raw),
        eval: vi.fn(),
      } as never);
      expect(await store.read(profile)).toEqual({ available: false, observations: [] });
    }
    const store = new RedisAdaptiveObservationStore({
      get: vi.fn().mockRejectedValue(new Error('offline')),
      eval: vi.fn().mockRejectedValue(new Error('offline')),
    } as never);
    expect(await store.read(profile)).toEqual({ available: false, observations: [] });
    expect(await store.takeRetry(profile, 'r')).toBe(false);
    await expect(store.record(profile, sample('r'))).resolves.toBeUndefined();
  });
  it('Redis原子操作共享同一命名空间、TTL与容量，配额失败不能当成功', async () => {
    const evalCommand = vi.fn().mockResolvedValue(0);
    const store = new RedisAdaptiveObservationStore({
      get: vi.fn().mockResolvedValue(null),
      eval: evalCommand,
    } as never);
    expect(await store.read(profile)).toEqual({ available: true, observations: [] });
    expect(await store.takeRetry(profile, 'r')).toBe(false);
    const args = evalCommand.mock.calls[0]!;
    expect(args[0]).toBe(ADAPTIVE_HISTORY_MUTATION);
    expect(args.slice(1, 6)).toEqual([
      2,
      `thesis-ledger:cache:v1:ai-adaptive:v1:${profile}`,
      'thesis-ledger:cache:v1:ai-adaptive:v1:profiles',
      'retry',
      'r',
    ]);
    expect(args.slice(-3)).toEqual([
      String(ADAPTIVE_RULE.windowMs),
      String(ADAPTIVE_RULE.maxObservations),
      String(ADAPTIVE_RULE.maxProfiles),
    ]);
  });
});
