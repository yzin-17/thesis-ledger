import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import type { AiSdkGenerationRequest } from '../../src/ai/ai-sdk-generation.adapter.js';
import { errorFact } from '../../src/ai/ai-sdk-generation-facts.js';
import { AiGenerationTiming } from '../../src/ai/timeout/ai-generation-timing.js';
import { createAiTimeoutPolicy } from '../../src/ai/timeout/ai-timeout-policy.js';
import {
  AiExecutionTimeoutError,
  createAiTimeoutScope,
} from '../../src/ai/timeout/ai-timeout-scope.js';

const epoch = Date.parse('2026-10-27T00:00:00Z');
const input = (signal = new AbortController().signal): AiSdkGenerationRequest<unknown> => ({
  requestId: randomUUID(),
  providerId: 'local',
  adapter: 'openai-compatible-chat',
  baseURL: 'http://localhost/v1',
  apiKey: 'test-only',
  model: 'local-model',
  contract: aiGenerationContracts.research.ref,
  schema: z.object({ value: z.string() }),
  messages: [],
  mode: 'native_schema',
  transport: 'stream',
  timeout: { firstChunkMs: 120_000, chunkMs: 60_000 },
  signal,
});

describe('超时首因及作用域', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
  });
  afterEach(() => vi.useRealTimers());

  it('按锁定SDK原生错误区分首有效输出与空闲', () => {
    const timing = new AiGenerationTiming(input());
    expect(
      timing.interruption(
        new DOMException('First chunk timeout of 120000ms exceeded', 'TimeoutError'),
      ),
    ).toMatchObject({
      code: 'provider_first_output_timeout',
      timeout: { stage: 'first_output', limitMs: 120_000 },
    });
    timing.progress();
    expect(
      timing.interruption(new DOMException('Chunk timeout of 60000ms exceeded', 'TimeoutError')),
    ).toMatchObject({
      code: 'provider_output_idle_timeout',
      timeout: { stage: 'output_idle', lastProgressAt: new Date(epoch).toISOString() },
    });
  });

  it('连接阶段不可观测时不编造起点、阈值或TCP耗时', () => {
    const error = new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
    });
    expect(new AiGenerationTiming(input()).interruption(error)).toMatchObject({
      code: 'provider_connect_timeout',
      timeout: {
        stage: 'connection',
        authority: 'transport',
        startedAt: null,
        elapsedMs: null,
        limitMs: null,
      },
    });
  });

  it('任务到期先携带结构化首因取消，后续取消不覆盖', () => {
    const policy = createAiTimeoutPolicy('research');
    const scope = createAiTimeoutScope({ policy, taskDeadlineAt: epoch + 6_000 });
    vi.advanceTimersByTime(1_000);
    const reason = scope.signal.reason;
    expect(reason).toBeInstanceOf(AiExecutionTimeoutError);
    expect(new AiGenerationTiming(input(scope.signal)).interruption(reason)).toMatchObject({
      code: 'task_budget_exhausted',
      timeout: { stage: 'task_budget', authority: 'task' },
    });
    scope.cancel('cancelled');
    expect(scope.signal.reason).toBe(reason);
    scope.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('上游504先返回，不被随后用户取消改写成本地超时', () => {
    const controller = new AbortController(),
      timing = new AiGenerationTiming(input(controller.signal));
    const upstream = new Error('upstream timeout', {
      cause: Object.assign(new Error('Gateway Timeout'), { statusCode: 504 }),
    });
    controller.abort('cancelled');
    expect(timing.interruption(upstream)).toBeNull();
    expect(errorFact(upstream, randomUUID(), 'response_headers', true)).toMatchObject({
      code: 'upstream_timeout',
      upstreamStatus: 504,
      externalResult: 'unknown',
    });
  });

  it('用户取消与租约丢失分别归因', () => {
    const user = new AbortController();
    user.abort('cancelled');
    expect(
      new AiGenerationTiming(input(user.signal)).interruption(
        new DOMException('aborted', 'AbortError'),
      )?.code,
    ).toBe('cancelled');
    const lease = new AbortController();
    lease.abort('lease_lost');
    expect(
      new AiGenerationTiming(input(lease.signal)).interruption(
        new DOMException('aborted', 'AbortError'),
      )?.code,
    ).toBe('execution_lease_lost');
  });

  it('成功响应处理失败仍保留实际字符串取消cause，其他先发错误不被覆盖', () => {
    const controller = new AbortController();
    controller.abort('user_cancelled');
    const timing = new AiGenerationTiming(input(controller.signal));
    expect(
      timing.interruption(
        new Error('Failed to process successful response', { cause: 'user_cancelled' }),
      )?.code,
    ).toBe('cancelled');
    expect(
      timing.interruption(new Error('原先的网络错误', { cause: new Error('ECONNRESET') })),
    ).toBeNull();
  });

  it('关闭清理定时器与监听器，工具继承同一期限而不重复安装timer', () => {
    const parent = new AbortController(),
      remove = vi.spyOn(parent.signal, 'removeEventListener');
    const policy = createAiTimeoutPolicy('research');
    const task = createAiTimeoutScope({
      policy,
      taskDeadlineAt: epoch + 10_000,
      signal: parent.signal,
    });
    const tool = createAiTimeoutScope({
      policy,
      taskDeadlineAt: epoch + 10_000,
      signal: task.signal,
      stage: 'tool',
      stageLimitMs: 20_000,
    });
    expect(vi.getTimerCount()).toBe(1);
    task.close();
    tool.close();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
