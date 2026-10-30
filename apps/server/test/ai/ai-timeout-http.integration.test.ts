import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
} from '../../src/ai/ai-sdk-generation.adapter.js';
import {
  createAiTimeoutPolicy,
  resolveAiExecutionTimeout,
} from '../../src/ai/timeout/ai-timeout-policy.js';
import { createAiTimeoutScope } from '../../src/ai/timeout/ai-timeout-scope.js';

describe('锁定SDK的真实本地HTTP阶段超时', () => {
  let handler: (response: ServerResponse) => void;
  let baseURL = '',
    calls = 0,
    closed = 0;
  const server = createServer(async (request, response) => {
    for await (const chunk of request) {
      void chunk;
    }
    calls++;
    response.once('close', () => closed++);
    handler(response);
  });
  const adapter = new AiSdkGenerationAdapter();
  const chunk = (delta: object, finish_reason: string | null = null) => ({
    id: 'local-timeout',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'local-model',
    choices: [{ index: 0, delta, finish_reason }],
  });
  const write = (response: ServerResponse, value: object) =>
    response.write('data: ' + JSON.stringify(value) + '\n\n');
  const stream = (response: ServerResponse) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.flushHeaders();
    write(response, chunk({ role: 'assistant', content: '' }));
  };
  const finish = (response: ServerResponse) => {
    write(response, chunk({ content: '{"answer":"ok"}' }));
    write(response, chunk({}, 'stop'));
    response.end('data: [DONE]\n\n');
  };
  const recurring = (response: ServerResponse, callback: () => void, milliseconds: number) => {
    const timer = setInterval(callback, milliseconds);
    response.once('close', () => clearInterval(timer));
    return timer;
  };
  const run = async (
    transport: 'stream' | 'single' = 'stream',
    budget = 1_500,
    completionLimit?: number,
  ) => {
    const policy = {
      ...createAiTimeoutPolicy('research'),
      taskBudgetMs: budget,
      cleanupReserveMs: 20,
      firstOutputTimeoutMs: 150,
      outputIdleTimeoutMs: 150,
    };
    const deadline = Date.now() + budget;
    const decision = resolveAiExecutionTimeout({
      policy,
      taskDeadlineAt: deadline,
      transport,
      ...(completionLimit === undefined
        ? {}
        : { completion: { value: completionLimit, source: 'legacy' as const } }),
    });
    const scope = createAiTimeoutScope({ policy, taskDeadlineAt: deadline });
    try {
      return await adapter.generate({
        requestId: randomUUID(),
        adapter: 'openai-compatible-chat',
        providerId: 'local-only',
        baseURL: baseURL + '/v1',
        apiKey: 'local-only',
        model: 'local-model',
        messages: [{ role: 'user', content: 'local fixture' }],
        contract: aiGenerationContracts.research.ref,
        schema: z.strictObject({ answer: z.string() }),
        mode: 'native_schema',
        transport,
        timeout: decision.sdkTimeout,
        timeoutDecision: decision,
        signal: scope.signal,
      });
    } finally {
      scope.close();
    }
  };
  const failure = async (operation: Promise<unknown>) => {
    try {
      await operation;
      throw new Error('预期阶段失败');
    } catch (error) {
      expect(error).toBeInstanceOf(AiSdkGenerationError);
      return (error as AiSdkGenerationError).fact;
    }
  };

  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('fixture启动失败');
    baseURL = 'http://127.0.0.1:' + address.port;
  });
  beforeEach(() => {
    calls = 0;
    closed = 0;
  });
  afterAll(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  });

  it('HTTP200、空delta及心跳不能解除首有效输出计时', async () => {
    handler = (response) => {
      stream(response);
      recurring(response, () => response.write(': heartbeat\n\n'), 30);
    };
    expect(await failure(run())).toMatchObject({
      code: 'provider_first_output_timeout',
      timeout: { stage: 'first_output', authority: 'sdk', limitMs: 150 },
    });
    await vi.waitFor(() => expect(closed).toBe(1));
    expect(calls).toBe(1);
  });

  it('持续reasoning超过首输出阈值仍可完成合法结果', async () => {
    handler = (response) => {
      stream(response);
      const timer = recurring(
        response,
        () => write(response, chunk({ reasoning: '继续分析' })),
        40,
      );
      const end = setTimeout(() => {
        clearInterval(timer);
        finish(response);
      }, 330);
      response.once('close', () => clearTimeout(end));
    };
    const result = await run();
    expect(result.output).toEqual({ answer: 'ok' });
    expect(result.timeToFirstTextMs).toBeGreaterThan(150);
    expect(result.timing?.firstMs).not.toBeNull();
    expect(calls).toBe(1);
  });

  it('已有正文后只留心跳，明确触发输出空闲超时', async () => {
    handler = (response) => {
      stream(response);
      write(response, chunk({ content: '{"answer":"' }));
      recurring(response, () => response.write(': heartbeat\n\n'), 30);
    };
    expect(await failure(run())).toMatchObject({
      code: 'provider_output_idle_timeout',
      timeout: { stage: 'output_idle', authority: 'sdk' },
    });
    await vi.waitFor(() => expect(closed).toBe(1));
    expect(calls).toBe(1);
  });

  it('持续有效输出只维持判活，原任务预算耗尽仍终止', async () => {
    handler = (response) => {
      stream(response);
      recurring(response, () => write(response, chunk({ reasoning: '继续分析' })), 40);
    };
    expect(await failure(run('stream', 420))).toMatchObject({
      code: 'task_budget_exhausted',
      timeout: { stage: 'task_budget', authority: 'task' },
    });
    await vi.waitFor(() => expect(closed).toBe(1));
    expect(calls).toBe(1);
  });

  it('非流式慢完成不会安装片段判活计时器', async () => {
    handler = (response) => {
      const timer = setTimeout(() => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'single',
            object: 'chat.completion',
            created: 1,
            model: 'local-model',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '{"answer":"ok"}' },
                finish_reason: 'stop',
              },
            ],
          }),
        );
      }, 300);
      response.once('close', () => clearTimeout(timer));
    };
    expect((await run('single')).output).toEqual({ answer: 'ok' });
    expect(calls).toBe(1);
  });

  it('上游主动504与本地超时分开，SDK不自动重试', async () => {
    handler = (response) => {
      response.writeHead(504, { 'content-type': 'application/json' });
      response.end('{"error":{"message":"upstream deadline"}}');
    };
    expect(await failure(run())).toMatchObject({
      code: 'upstream_timeout',
      upstreamStatus: 504,
      externalResult: 'unknown',
    });
    expect(calls).toBe(1);
  });

  it('明确的非流式完成覆盖可单独归因', async () => {
    handler = (response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.flushHeaders();
    };
    expect(await failure(run('single', 1_500, 150))).toMatchObject({
      code: 'provider_completion_timeout',
      phase: 'request',
      timeout: { stage: 'completion', authority: 'sdk', limitMs: 150 },
    });
    await vi.waitFor(() => expect(closed).toBe(1));
    expect(calls).toBe(1);
  });
});
