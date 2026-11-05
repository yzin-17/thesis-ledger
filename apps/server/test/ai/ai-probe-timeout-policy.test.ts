import { describe, expect, it, vi } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { runProviderConnectionTest } from '../../src/ai/provider-connection-test.js';
import { probeTimeoutOverrides } from '../../src/ai/ai-provider-probe-timeout.js';
import { createAiTimeoutPolicy } from '../../src/ai/timeout/ai-timeout-policy.js';

describe('探针统一时限', () => {
  it('迟到的完整探针保留已知usage，不能被判健康或用零替代', async () => {
    const usage = { status: 'reported', inputTokens: 7, outputTokens: 8 };
    const sdk = {
      generate: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { usage };
      }),
    };
    await expect(
      runProviderConnectionTest({
        sdk: sdk as never,
        adapter: 'openai-compatible',
        providerId: 'isolated',
        baseURL: 'http://localhost/v1',
        authMode: 'none',
        apiKey: '',
        model: 'same',
        policy: { ...createAiTimeoutPolicy('connection_probe', 20), cleanupReserveMs: 0 },
        taskDeadlineAt: Date.now() + 20,
      }),
    ).rejects.toMatchObject({
      fact: { code: 'task_budget_exhausted', externalResult: 'complete' },
      usage,
    });
  });
  it('缺省保留为空，显式值记录用途或Provider来源', async () => {
    const baseline = await probe({ purpose: 'research', ...probeTimeoutOverrides({}) });
    expect(baseline.timeoutDecision.first).toMatchObject({ source: 'profile', overrideMs: null });
    const overridden = await probe({
      purpose: 'research',
      ...probeTimeoutOverrides({ firstOutputTimeoutMs: 120000 }, { firstOutputTimeoutMs: 240000 }),
    });
    expect(overridden.timeoutDecision.first).toMatchObject({ source: 'route', overrideMs: 240000 });
  });
  const probe = async (overrides: Record<string, unknown> = {}) => {
    const generate = vi.fn(async () => ({}));
    const result = await runProviderConnectionTest({
      sdk: { generate } as never,
      adapter: 'openai-compatible',
      providerId: 'isolated',
      baseURL: 'http://localhost/v1',
      authMode: 'none',
      apiKey: '',
      model: 'unchanged',
      ...overrides,
    });
    return { ...result, request: generate.mock.calls[0] };
  };
  it('连接探针60秒总预算与旧完成等待分别可查', async () => {
    const { timeoutDecision: d } = await probe({ timeoutMs: 240000 });
    expect(d.profile).toBe('connection_probe');
    expect(d.policy.taskBudgetMs).toBe(60000);
    expect(d.completion).toMatchObject({ overrideMs: 240000, source: 'legacy', clipped: true });
    expect(d.first).toBeNull();
    expect(d.idle).toBeNull();
  });
  it('普通用途使用120秒首输出和60秒空闲，不使用旧总等待', async () => {
    const { timeoutDecision: d } = await probe({
      purpose: aiGenerationContracts.research.ref.id,
      timeoutMs: 10,
    });
    expect(d.policy.taskBudgetMs).toBe(600000);
    expect(d.sdkTimeout).toEqual({ firstChunkMs: 120000, chunkMs: 60000 });
  });
  it('明确推理用途与240秒覆盖保持，父期限始终优先', async () => {
    const { timeoutDecision: d } = await probe({
      purpose: 'research',
      reasoningEnabled: true,
      firstOutputTimeoutMs: 240000,
    });
    expect(d.policy.taskBudgetMs).toBe(1200000);
    expect(d.sdkTimeout).toEqual({ firstChunkMs: 240000, chunkMs: 90000 });
    const clipped = await probe({ purpose: 'research', taskDeadlineAt: Date.now() + 20000 });
    expect(clipped.timeoutDecision.sdkTimeout).toEqual({});
    expect(clipped.timeoutDecision.first?.clipped).toBe(true);
  });
});
