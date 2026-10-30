import { describe, expect, it } from 'vitest';
import {
  aiExecutionClockSchema,
  aiProviderInputSchema as publicProviderInput,
  AI_TIMEOUT_POLICY_VERSION,
} from '@thesis-ledger/schemas';
import { aiProviderInputSchema as serverProviderInput } from '../../src/ai/ai-provider.contracts.js';
import {
  aiTimeoutProfileFor,
  createAiTimeoutPolicy,
  resolveAiExecutionTimeout,
} from '../../src/ai/timeout/ai-timeout-policy.js';

const now = Date.parse('2026-10-27T00:00:00Z');
const resolve = (options: Partial<Parameters<typeof resolveAiExecutionTimeout>[0]> = {}) => {
  const policy = options.policy ?? createAiTimeoutPolicy('research');
  return resolveAiExecutionTimeout({
    policy,
    taskDeadlineAt: now + policy.taskBudgetMs,
    now,
    transport: 'stream',
    ...options,
  });
};

describe('统一 AI 超时策略', () => {
  it.each([
    ['connection_probe', 10_000, 30_000, 20_000, 60_000],
    ['research', 15_000, 120_000, 60_000, 600_000],
    ['deep_research', 15_000, 240_000, 90_000, 1_200_000],
  ] as const)('提供 %s 的独立初始预算', (profile, connection, first, idle, task) => {
    const policy = createAiTimeoutPolicy(profile);
    expect(policy).toMatchObject({
      version: AI_TIMEOUT_POLICY_VERSION,
      connectionTimeoutMs: connection,
      connectionCapability: 'unavailable',
      firstOutputTimeoutMs: first,
      outputIdleTimeoutMs: idle,
      taskBudgetMs: task,
      cleanupReserveMs: 5_000,
    });
  });

  it('只按用途及明确推理配置选择档位', () => {
    expect(aiTimeoutProfileFor({ connectionProbe: true, reasoningEnabled: true })).toBe(
      'connection_probe',
    );
    expect(aiTimeoutProfileFor({})).toBe('research');
    expect(aiTimeoutProfileFor({ reasoningEnabled: true })).toBe('deep_research');
    expect(aiTimeoutProfileFor({ reasoningEffort: 'xhigh' })).toBe('deep_research');
    expect(aiTimeoutProfileFor({ reasoningEnabled: false, reasoningEffort: 'high' })).toBe(
      'research',
    );
  });

  it('缺省阶段值回到用途基准，不退化成整项任务余量', () => {
    const result = resolve({ firstOutput: { value: 30_000, source: 'system' } });
    expect(result.remainingMs).toBe(595_000);
    expect(result.first).toMatchObject({
      source: 'profile',
      baselineMs: 120_000,
      overrideMs: null,
    });
    expect(result.sdkTimeout).toEqual({ firstChunkMs: 120_000, chunkMs: 60_000 });
    expect(result.connection.effectiveMs).toBeNull();
  });

  it('显式覆盖与未知来源旧阶段值可解释，不静默丢弃', () => {
    expect(resolve({ firstOutput: { value: 240_000, source: 'route' } }).first).toMatchObject({
      source: 'route',
      overrideMs: 240_000,
      effectiveMs: 240_000,
    });
    expect(resolve({ outputIdle: { value: 120_000 } }).idle).toMatchObject({
      source: 'legacy',
      overrideMs: 120_000,
    });
  });

  it('任务余量包含收尾预留，裁剪后不再创建重复阶段墙', () => {
    const result = resolve({ taskDeadlineAt: now + 25_000 });
    expect(result.remainingMs).toBe(20_000);
    expect(result.first).toMatchObject({
      clipped: true,
      effectiveMs: 20_000,
      deadlineAt: now + 20_000,
    });
    expect(result.idle?.deadlineAt).toBe(result.executionDeadlineAt);
    expect(result.sdkTimeout).toEqual({});
  });

  it('非流式只有完成等待，不安装首输出或空闲限制', () => {
    const result = resolve({ transport: 'single' });
    expect(result.first).toBeNull();
    expect(result.idle).toBeNull();
    expect(result.completion?.effectiveMs).toBe(595_000);
    expect(result.sdkTimeout).toEqual({});
    expect(
      resolve({ transport: 'single', completion: { value: 120_000, source: 'legacy' } }).sdkTimeout,
    ).toEqual({ totalMs: 120_000 });
  });

  it('剩余预算不足时不允许启动', () => {
    const result = resolve({ taskDeadlineAt: now + 4_000 });
    expect(result.canStart).toBe(false);
    expect(result.remainingMs).toBe(0);
    expect(result.sdkTimeout).toEqual({});
  });

  it('客户端与服务端完整输入均允许240秒而保留旧配置', () => {
    const input = {
      name: 'provider-a',
      baseUrl: 'https://provider.invalid/v1',
      models: ['model-a'],
      timeoutMs: 120_000,
      firstOutputTimeoutMs: 240_000,
      outputIdleTimeoutMs: 90_000,
    };
    for (const schema of [publicProviderInput, serverProviderInput]) {
      expect(schema.parse(input)).toMatchObject(input);
      expect(schema.safeParse({ ...input, firstOutputTimeoutMs: 86_400_001 }).success).toBe(false);
    }
  });

  it('时钟准备与首次执行可序列化，并拒绝错算或单边缺失的截止时间', () => {
    const prepared = {
      policy: createAiTimeoutPolicy('research'),
      queueExpiresAt: new Date(now + 600_000).toISOString(),
      firstStartedAt: null,
      taskDeadlineAt: null,
      origin: 'first_claim',
    };
    expect(aiExecutionClockSchema.safeParse(prepared).success).toBe(true);
    const started = {
      ...prepared,
      firstStartedAt: new Date(now).toISOString(),
      taskDeadlineAt: new Date(now + 600_000).toISOString(),
    };
    expect(aiExecutionClockSchema.safeParse(started).success).toBe(true);
    expect(
      aiExecutionClockSchema.safeParse({
        ...started,
        taskDeadlineAt: new Date(now + 610_000).toISOString(),
      }).success,
    ).toBe(false);
    expect(aiExecutionClockSchema.safeParse({ ...started, taskDeadlineAt: null }).success).toBe(
      false,
    );
  });
});
