import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AiProviderSaveService } from '../../src/ai/ai-provider-save.service.js';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { runProviderConnectionTest } from '../../src/ai/provider-connection-test.js';
import * as validationPolicy from '../../src/ai/ai-provider-validation-policy.js';
import { createAiTimeoutPolicy } from '../../src/ai/timeout/ai-timeout-policy.js';

const report = {
  conclusion: '样例',
  evidence: [],
  risks: [],
  unknowns: [],
  disclaimer: '格式验证',
};
const frame = (response: ServerResponse, content: string, finishReason: string | null = null) =>
  response.write(
    `data: ${JSON.stringify({
      id: 'lifecycle',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'model',
      choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
    })}\n\n`,
  );

const continuous = (response: ServerResponse) => {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.flushHeaders();
  const text = JSON.stringify(report);
  let offset = 0;
  const timer = setInterval(() => {
    if (offset < text.length) {
      frame(response, text.slice(offset, offset + 8));
      offset += 8;
      return;
    }
    frame(response, '', 'stop');
    response.write(
      `data: ${JSON.stringify({
        id: 'lifecycle',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'model',
        choices: [],
        usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
      })}\n\n`,
    );
    response.end('data: [DONE]\n\n');
    clearInterval(timer);
  }, 15);
  response.on('close', () => clearInterval(timer));
};

describe('用途验证真实 HTTP/SSE 超时与取消', () => {
  let baseUrl = '';
  let requests = 0;
  let handle = continuous;
  let received: () => void = () => undefined;
  const server = createServer(async (request, response) => {
    for await (const chunk of request) void chunk;
    requests += 1;
    received();
    handle(response);
  });
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('隔离 HTTP 地址缺失');
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    received = () => undefined;
  });
  afterAll(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  });

  const fixture = (first = 100, idle = 100, budgetSeconds = 600) => {
    requests = 0;
    const saved = { save: vi.fn(async () => ({ name: 'local-lifecycle' })) };
    const health = {
      recordHistory: vi.fn(async (...args: unknown[]) => {
        void args;
        return null;
      }),
    };
    const service = new AiProviderSaveService(
      saved as never,
      { findStored: async () => null } as never,
      new AiSdkGenerationAdapter(),
      health as never,
      { begin: async () => undefined, passed: async () => [] } as never,
    );
    const input = aiProviderInputSchema.parse({
      name: 'local-lifecycle',
      baseUrl,
      authMode: 'none',
      models: ['model'],
      timeoutMs: 10,
      firstOutputTimeoutMs: first,
      outputIdleTimeoutMs: idle,
      executionRoutes: [
        {
          model: 'model',
          mode: 'native_schema',
          outputPolicy: 'auto',
          contract: aiGenerationContracts.research.ref,
        },
      ],
      modelPricing: { model: { costPer1kInput: 1, costPer1kOutput: 1, costCurrency: 'USD' } },
    });
    const operationId = randomUUID();
    const run = async () => {
      const plan = await service.plan(input);
      expect(plan.maxDurationSeconds).toBe(budgetSeconds);
      return service.testAndSave(input, {
        operationId,
        authorized: true,
        allowTextFallback: false,
        planFingerprint: plan.planFingerprint,
        maxCalls: plan.maxCalls,
      });
    };
    return { saved, health, service, input, operationId, run };
  };

  it('持续输出超过 Provider timeout 仍保存，传输恰好一次并保留用量', async () => {
    handle = continuous;
    const f = fixture();
    const start = Date.now();
    await f.run();
    expect(Date.now() - start).toBeGreaterThan(f.input.timeoutMs!);
    expect(requests).toBe(1);
    expect(f.saved.save).toHaveBeenCalledTimes(1);
    expect(f.health.recordHistory.mock.calls.at(-1)?.[6]).toMatchObject({
      status: 'passed',
      usage: { status: 'reported', inputTokens: 12, outputTokens: 9 },
    });
  });

  it.each(['首输出', '输出间隔'])('%s 停顿按超时失败，不继续格式回退或保存', async (kind) => {
    handle = (response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      if (kind === '输出间隔') frame(response, '{"conclusion":');
    };
    const f = fixture(kind === '首输出' ? 35 : 500, kind === '输出间隔' ? 35 : 500);
    await expect(f.run()).rejects.toThrow('超时');
    expect(requests).toBe(1);
    expect(f.saved.save).not.toHaveBeenCalled();
    expect(f.health.recordHistory.mock.calls.at(-1)?.[3]).toBe(
      kind === '首输出' ? 'provider_first_output_timeout' : 'provider_output_idle_timeout',
    );
    expect(f.health.recordHistory.mock.calls.at(-1)?.[6]).toMatchObject({
      status: 'failed',
      usage: { status: 'unknown', inputTokens: null, outputTokens: null },
    });
  });

  it('计划和执行共享任务预算，持续输出也不能延长截止', async () => {
    vi.spyOn(validationPolicy, 'validationTimeoutPolicy').mockReturnValue({
      ...createAiTimeoutPolicy('research'),
      taskBudgetMs: 6000,
    });
    handle = (response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const timer = setInterval(() => frame(response, 'x'), 15);
      response.on('close', () => clearInterval(timer));
    };
    const f = fixture(100, 100, 6);
    await expect(f.run()).rejects.toThrow('预算');
    expect(requests).toBe(1);
    expect(f.saved.save).not.toHaveBeenCalled();
    expect(f.health.recordHistory.mock.calls.at(-1)?.[3]).toBe('task_budget_exhausted');
  });

  it('用户主动取消与操作超时分开，未知用量不补零且不保存', async () => {
    handle = continuous;
    const f = fixture();
    const started = new Promise<void>((resolve) => {
      received = resolve;
    });
    const result = f.run().catch((error: unknown) => error);
    await started;
    expect(f.service.cancel(f.input.name, f.operationId)).toEqual({ cancelled: true });
    expect(((await result) as Error).message).toContain('取消');
    expect(requests).toBe(1);
    expect(f.saved.save).not.toHaveBeenCalled();
    expect(f.health.recordHistory.mock.calls.at(-1)?.[3]).toBe('validation_cancelled');
  });

  it('非流式连接仍受 Provider 总超时约束', async () => {
    handle = () => undefined;
    requests = 0;
    await expect(
      runProviderConnectionTest({
        sdk: new AiSdkGenerationAdapter(),
        adapter: 'openai-compatible',
        providerId: 'local-lifecycle',
        baseURL: baseUrl,
        authMode: 'none',
        apiKey: '',
        model: 'model',
        timeoutMs: 35,
      }),
    ).rejects.toThrow();
    expect(requests).toBe(1);
  });
});
