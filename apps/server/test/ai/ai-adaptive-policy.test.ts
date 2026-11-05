import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_RULE,
  adaptiveProfile,
  adaptiveTimeoutDecision,
  adaptiveRetryDecision,
  type AdaptiveObservation,
} from '../../src/ai/adaptive/ai-adaptive-policy.js';
const now = 2_000_000_000;
const sample = (i: number, firstMs = 1000): AdaptiveObservation => ({
  requestId: String(i),
  at: now - 1000,
  firstMs,
  maxGapMs: 200,
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
    remainingMs: 300000,
    configured: { firstChunkMs: 30000, chunkMs: 30000 },
    sources: {
      configurationFingerprint: 'v1',
      firstOutputTimeoutSource: 'system',
      outputIdleTimeoutSource: 'system',
    },
    fixed: true,
    now,
    ...overrides,
  });

describe('有界影子观测', () => {
  it('冷启动直接使用用途基准，样本不成为基础策略前置', () => {
    expect(decide()).toMatchObject({
      version: 'ai-adaptive-v2-shadow',
      mode: 'shadow',
      applied: false,
      timeout: { firstChunkMs: 120000, chunkMs: 60000 },
    });
    expect(decide()).not.toHaveProperty('minimumSamples');
    expect(decide()).not.toHaveProperty('confidence');
  });
  it('少量快速样本不收紧，慢样本只给影子候选', () => {
    expect(decide(Array.from({ length: 10 }, (_, i) => sample(i))).first).toMatchObject({
      samples: 10,
      candidateMs: 120000,
      applied: false,
    });
    const slow = decide([sample(1, 180000)]);
    expect(slow.first).toMatchObject({
      observedMaxMs: 180000,
      candidateMs: 180000,
      applied: false,
    });
    expect(slow.timeout.firstChunkMs).toBe(120000);
  });
  it('截尾分开计数，不把阈值当成完成时间', () => {
    const value = decide([
      { ...sample(1), firstMs: null, firstCensored: true, firstLowerBoundMs: 240000 },
    ]);
    expect(value.first).toMatchObject({
      samples: 0,
      censored: 1,
      observedMaxMs: null,
      applied: false,
    });
    expect(value.timeout.firstChunkMs).toBe(120000);
  });
  it('显式240秒仍受余量裁剪，不设置流式total墙', () => {
    const value = decide([], {
      remainingMs: 150000,
      configured: { firstChunkMs: 240000, chunkMs: 60000 },
      sources: { configurationFingerprint: 'x', firstOutputTimeoutSource: 'route' },
    });
    expect(value.timeout).toEqual({ chunkMs: 60000 });
    expect(() => decide([], { remainingMs: 0 })).toThrow('剩余期限');
  });
  it('14天窗口保留低频阶段，过期和未来样本排除', () => {
    expect(ADAPTIVE_RULE).toMatchObject({
      windowMs: 14 * 86400000,
      maxObservations: 512,
      maxProfiles: 256,
    });
    expect(decide([{ ...sample(1), at: now - 2 * 86400000 }]).first.samples).toBe(1);
    expect(
      decide([
        { ...sample(1), at: now - ADAPTIVE_RULE.windowMs - 1 },
        { ...sample(2), at: now + 1 },
      ]).first.samples,
    ).toBe(0);
  });
  it('必要维度隔离，输入长度不再导致分组爆炸', () => {
    const input = {
      providerId: 'p',
      baseURL: 'http://fixture/v1',
      model: 'fixed',
      contract: { id: 'research', version: 'research-generation-v2' },
      mode: 'native_schema',
      transport: 'stream',
      messages: [],
    } as const;
    const request = { ...input, messages: [...input.messages] },
      key = adaptiveProfile(request, 'v1');
    expect(
      adaptiveProfile(
        { ...request, messages: [{ role: 'user', content: 'x'.repeat(4096) }] },
        'v1',
      ),
    ).toBe(key);
    expect(adaptiveProfile({ ...request, reasoningEnabled: false }, 'v1')).not.toBe(key);
    expect(adaptiveProfile({ ...request, transport: 'single' }, 'v1')).not.toBe(key);
    expect(adaptiveProfile({ ...request, model: 'other' }, 'v1')).not.toBe(key);
    expect(adaptiveProfile(request, 'v2')).not.toBe(key);
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
