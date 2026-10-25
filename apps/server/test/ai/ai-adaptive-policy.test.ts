import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_RULE,
  adaptiveMinimumSamples,
  adaptiveProfile,
  adaptiveTimeoutDecision,
  adaptiveRetryDecision,
  type AdaptiveObservation,
} from '../../src/ai/adaptive/ai-adaptive-policy.js';

const now = 1_000_000_000;
const sample = (index: number): AdaptiveObservation => ({
  requestId: String(index),
  at: now - 1000,
  firstMs: 45_000 + index,
  maxGapMs: 2000,
  firstCensored: false,
  gapCensored: false,
  outcome: 'success',
});
const decide = (
  observations: AdaptiveObservation[] = [],
  overrides: Record<string, unknown> = {},
) =>
  adaptiveTimeoutDecision({
    profile: 'profile',
    history: { available: true, observations },
    remainingMs: 300_000,
    configured: { totalMs: 300_000, firstChunkMs: 30_000, chunkMs: 30_000 },
    sources: {
      configurationFingerprint: 'revision-1',
      firstOutputTimeoutSource: 'system',
      outputIdleTimeoutSource: 'system',
    },
    fixed: true,
    now,
    ...overrides,
  });

describe('研究自适应等待预算', () => {
  it('冷启动使用剩余冻结期限，不把30秒或120秒当研究上限', () => {
    expect(decide().timeout).toEqual({ totalMs: 300_000, firstChunkMs: 300_000, chunkMs: 300_000 });
    expect(decide().first.source).toBe('cold_start');
  });
  it('299项门槛来自99%覆盖与95%置信的单侧容忍界', () => {
    expect(adaptiveMinimumSamples()).toBe(299);
    expect(decide(Array.from({ length: 298 }, (_, i) => sample(i))).first.source).toBe(
      'cold_start',
    );
    const result = decide(Array.from({ length: 299 }, (_, i) => sample(i)));
    expect(result.first.source).toBe('tolerance_bound');
    expect(result.timeout.firstChunkMs).toBe(45_299);
    expect(result.timeout.chunkMs).toBe(2001);
  });
  it('保留显式Provider／用途设置以及旧数据缺少source的设置', () => {
    expect(
      decide([], {
        sources: {
          configurationFingerprint: 'x',
          firstOutputTimeoutSource: 'route',
          outputIdleTimeoutSource: 'provider',
        },
      }).timeout,
    ).toMatchObject({ firstChunkMs: 30_000, chunkMs: 30_000 });
    expect(decide([], { sources: { configurationFingerprint: 'x' } }).first.source).toBe(
      'explicit',
    );
  });
  it('所有超时受剩余绝对期限约束', () => {
    expect(decide([], { remainingMs: 500 }).timeout).toEqual({
      totalMs: 500,
      firstChunkMs: 500,
      chunkMs: 500,
    });
    expect(() => decide([], { remainingMs: 0 })).toThrow('剩余期限');
    const capped = decide(
      Array.from({ length: 299 }, (_, i) => sample(i)),
      { remainingMs: 500 },
    );
    expect(capped.first).toMatchObject({
      source: 'tolerance_bound',
      deadlineLimited: true,
      requestedMs: 45_299,
    });
  });
  it('相关右截尾使该维度回到保守预算，不能仅学习成功的快样本', () => {
    const observations = Array.from({ length: 299 }, (_, i) => sample(i));
    observations.push({ ...sample(300), firstMs: null, firstCensored: true, maxGapMs: null });
    const result = decide(observations);
    expect(result.first.source).toBe('censored');
    expect(result.timeout.firstChunkMs).toBe(300_000);
    expect(result.gap.source).toBe('tolerance_bound');
  });
  it('过期、未来样本和动态router不会形成固定模型学习结论', () => {
    const old = Array.from({ length: 299 }, (_, i) => ({
      ...sample(i),
      at: now - ADAPTIVE_RULE.windowMs - 1,
    }));
    expect(decide(old).first.samples).toBe(0);
    expect(decide([{ ...sample(1), at: now + 1 }]).first.samples).toBe(0);
    expect(
      decide(
        Array.from({ length: 299 }, (_, i) => sample(i)),
        { fixed: false },
      ).first.source,
    ).toBe('cold_start');
    expect(decide([], { history: { available: false, observations: [] } }).first.source).toBe(
      'unavailable',
    );
  });
  it('profile隔离模式、推理、输入规模、配置和实际请求模型', () => {
    const input = {
      providerId: 'p',
      baseURL: 'http://fixture/v1',
      model: 'fixed',
      contract: { id: 'research', version: 'research-generation-v2' },
      mode: 'native_schema',
      transport: 'stream',
      messages: [{ role: 'user', content: 'x' }],
    } as const;
    const request = { ...input, messages: [...input.messages] };
    const key = adaptiveProfile(request, 'v1');
    expect(adaptiveProfile({ ...request, reasoningEnabled: false }, 'v1')).not.toBe(key);
    expect(adaptiveProfile({ ...request, mode: 'json_validated' }, 'v1')).not.toBe(key);
    expect(adaptiveProfile({ ...request, model: 'other' }, 'v1')).not.toBe(key);
    expect(
      adaptiveProfile(
        { ...request, messages: [{ role: 'user', content: 'x'.repeat(4096) }] },
        'v1',
      ),
    ).not.toBe(key);
    expect(adaptiveProfile(request, 'v2')).not.toBe(key);
    expect(key).not.toContain('fixture');
  });
});

describe('同Provider／模型的逐次重试决策', () => {
  const base = {
    error: {
      code: 'provider_rejected',
      phase: 'request',
      summary: 'rejected',
      externalResult: 'rejected_before_generation',
      requestId: '00000000-0000-4000-8000-000000000001',
      retryAfterMs: 1000,
    },
    remainingCalls: 1,
    remainingMs: 30_000,
    expectedFirstMs: 10_000,
    blocked: false,
    cancelled: false,
    random: 0.5,
  } as const;
  it('遵守Retry-After下限并加有限抖动', () => {
    expect(adaptiveRetryDecision(base)).toEqual({
      retry: true,
      reason: 'confirmed_rejection',
      delayMs: 1500,
    });
  });
  it.each([
    [{ remainingCalls: 0 }, 'calls_exhausted'],
    [{ cancelled: true }, 'cancelled'],
    [{ blocked: true }, 'continuation_blocked'],
    [{ remainingMs: 1000 }, 'insufficient_time'],
    [{ error: { ...base.error, externalResult: 'unknown' } }, 'not_confirmed_rejection'],
    [
      { error: { ...base.error, code: 'schema_invalid', externalResult: 'complete' } },
      'not_confirmed_rejection',
    ],
    [{ error: { ...base.error, retryAfterMs: undefined } }, 'retry_after_unknown'],
  ])('授权、时间或结果不满足时停止：%s', (override, reason) => {
    expect(
      adaptiveRetryDecision({ ...base, ...override } as Parameters<
        typeof adaptiveRetryDecision
      >[0]),
    ).toMatchObject({ retry: false, reason });
  });
});
