import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import {
  aiGenerationContracts,
  type AiExecutionSummary,
  type AiResearchPolicyV1,
} from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiResearchSdkExecution } from '../../src/ai/ai-research-sdk-execution.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';

const policy: AiResearchPolicyV1 = {
  version: 'research-policy-v1' as const,
  maxAiCalls: 2,
  maxInputTokens: 100_000,
  maxOutputTokens: 20_000,
  maxDurationSeconds: 300,
  maxCost: '0',
  costCurrency: null,
  paidRoutes: [],
};

const summary = (
  frozenPolicy = policy,
  deadlineAt = new Date(Date.now() + 60_000).toISOString(),
): AiExecutionSummary => ({
  version: 'sdk-execution-v1',
  contract: aiGenerationContracts.research.ref,
  frozenPolicy,
  deadlineAt,
  generationStatus: 'pending',
  usageCompleteness: 'unknown',
  requests: [],
  continuationBlockedReason: null,
});

const writeSse = (response: ServerResponse) => {
  const content = JSON.stringify({
    conclusion: '本地研究结果',
    evidence: [],
    risks: [],
    unknowns: [],
    disclaimer: 'test',
    signals: [],
  });
  const common = {
    id: 'research-fixture',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'fixture-model',
  };
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [],
      usage: { prompt_tokens: 9, completion_tokens: 6, total_tokens: 15 },
    })}\n\n`,
  );
  response.end('data: [DONE]\n\n');
};

const stateStore = (initial: AiExecutionSummary) => {
  let execution = structuredClone(initial);
  const failOwned = vi.fn(async () => true);
  const prepareRequest = vi.fn(async (input: { requestId: string; reservation: never }) => {
    const request = {
      requestId: input.requestId,
      sequence: execution.requests.length + 1,
      state: 'prepared' as const,
      reservation: input.reservation,
      dispatchExecutionAttempt: null,
      preparedAt: new Date().toISOString(),
      dispatchingAt: null,
      completedAt: null,
      outcome: null,
      error: null,
      usageRevisions: [],
      settledRevision: 0,
    };
    execution = { ...execution, requests: [...execution.requests, request] };
    return request;
  });
  const authorizeDispatch = vi.fn(async (_owner: unknown, requestId: string) => {
    execution = {
      ...execution,
      requests: execution.requests.map((request) =>
        request.requestId === requestId
          ? {
              ...request,
              state: 'dispatching' as const,
              dispatchExecutionAttempt: 1,
              dispatchingAt: new Date().toISOString(),
            }
          : request,
      ),
    };
    return true;
  });
  const completeAndSettle = vi.fn(
    async (input: {
      requestId: string;
      revision: AiExecutionSummary['requests'][number]['usageRevisions'][number];
      outcome: AiExecutionSummary['requests'][number]['outcome'];
      error?: AiExecutionSummary['requests'][number]['error'];
      continuationBlockedReason?: AiExecutionSummary['continuationBlockedReason'];
    }) => {
      execution = {
        ...execution,
        generationStatus: input.outcome?.status ?? 'incomplete',
        usageCompleteness: input.revision.usage.status,
        continuationBlockedReason:
          input.continuationBlockedReason ?? execution.continuationBlockedReason,
        requests: execution.requests.map((request) =>
          request.requestId === input.requestId
            ? {
                ...request,
                state: 'completed' as const,
                completedAt: new Date().toISOString(),
                outcome: input.outcome,
                error: input.error ?? null,
                usageRevisions: [input.revision],
                settledRevision: 1,
              }
            : request,
        ),
      };
      return {
        applied: true,
        idempotent: false,
        continuationBlockedReason: execution.continuationBlockedReason,
        execution,
      };
    },
  );
  const markUnknown = vi.fn(async () => {
    execution = { ...execution, generationStatus: 'unknown' };
    return true;
  });
  return {
    store: { prepareRequest, authorizeDispatch, completeAndSettle, markUnknown, failOwned },
    execution: () => execution,
    failOwned,
    markUnknown,
  };
};

describe('Research SDK local HTTP vertical', () => {
  let baseURL = '';
  let requestCount = 0;
  let mode: 'fallback' | 'disconnect' | 'hang' | 'retryAfterDeadline' | 'success' = 'success';
  const server = createServer((request, response) => {
    requestCount += 1;
    if (
      request.url?.startsWith('/primary/') &&
      (mode === 'fallback' || mode === 'retryAfterDeadline')
    ) {
      response.writeHead(429, {
        'content-type': 'application/json',
        'retry-after': mode === 'fallback' ? '0' : '120',
      });
      response.end(JSON.stringify({ error: { message: 'capacity rejected' } }));
      return;
    }
    if (request.url?.startsWith('/primary/') && mode === 'disconnect') {
      response.destroy();
      return;
    }
    if (request.url?.startsWith('/primary/') && mode === 'hang') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(': waiting\n\n');
      return;
    }
    writeSse(response);
  });

  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地研究 Provider 启动失败');
    baseURL = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    requestCount = 0;
    mode = 'success';
  });

  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  const provider = (
    id: string,
    path: string,
    pricing = { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
  ) => ({
    id,
    models: ['fixture-model'],
    metadata: {
      health: 'healthy' as const,
      ...pricing,
    },
    sdkRuntime: () => ({ baseURL: `${baseURL}/${path}/v1`, apiKey: 'secret', timeoutMs: 2_000 }),
  });

  const route = (
    id: string,
    path: string,
    pricing = { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
  ) => ({
    provider: provider(id, path, pricing),
    execution: {
      adapter: 'openai-compatible' as const,
      mode: 'json_validated' as const,
      readiness: { configurationFingerprint: `${id}-fingerprint` },
    },
  });

  const run = (
    execution: AiExecutionSummary,
    frozenPricing?: Record<string, number | string>,
  ) => ({
    provider: 'primary',
    model: 'fixture-model',
    modelMetadata: {
      sdkExecution: execution,
      researchRoutes: [
        {
          provider: 'primary',
          model: 'fixture-model',
          configurationFingerprint: 'primary-fingerprint',
          ...(frozenPricing === undefined ? {} : { pricing: frozenPricing }),
        },
        {
          provider: 'fallback',
          model: 'fixture-model',
          configurationFingerprint: 'fallback-fingerprint',
        },
      ],
    },
  });

  const execute = async (
    execution: AiExecutionSummary,
    signal = new AbortController().signal,
    options: {
      currentPricing?: { costPer1kInput: number; costPer1kOutput: number; costCurrency: string };
      frozenPricing?: Record<string, number | string>;
    } = {},
  ) => {
    const state = stateStore(execution);
    const registry = {
      defaultModel: () => 'fixture-model',
      readyContractCandidates: () => [
        route('primary', 'primary', options.currentPricing),
        route('fallback', 'fallback', options.currentPricing),
      ],
    };
    const service = new AiResearchSdkExecution(
      registry as never,
      new AiSdkGenerationAdapter(),
      state.store as never,
    );
    await service.execute({
      ownership: { runId: '11111111-1111-4111-8111-111111111111', executionAttempt: 1 },
      run: run(execution, options.frozenPricing),
      messages: [{ role: 'user', content: 'Return research JSON.' }],
      startedAt: Date.now(),
      signal,
      buildResult: (output, selectedProvider) => ({ ...output, provider: selectedProvider }),
    });
    return state;
  };

  it('仅对明确的生成前拒绝执行一次同模型 fallback，并分别留痕', async () => {
    mode = 'fallback';
    const state = await execute(summary());
    expect(requestCount).toBe(2);
    expect(state.execution().requests).toHaveLength(2);
    expect(state.execution().requests.map((request) => request.reservation.provider)).toEqual([
      'primary',
      'fallback',
    ]);
    expect(state.execution().requests[0]).toMatchObject({
      state: 'completed',
      error: { code: 'provider_rejected', externalResult: 'rejected_before_generation' },
    });
    expect(state.execution().generationStatus).toBe('complete');
  });

  it('传输结果未知时不 fallback，并保留 unknown 请求事实', async () => {
    mode = 'disconnect';
    const state = await execute(summary());
    expect(requestCount).toBe(1);
    expect(state.markUnknown).toHaveBeenCalledOnce();
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ errorCode: 'research_unknown_outcome' }),
    );
  });

  it('Retry-After 超过剩余绝对期限时终止，不发送 fallback', async () => {
    mode = 'retryAfterDeadline';
    await expect(execute(summary(policy, new Date(Date.now() + 1_000).toISOString()))).rejects.toThrow(
      'Retry-After 超过研究任务剩余期限',
    );
    expect(requestCount).toBe(1);
  });

  it('创建起绝对期限已过时零 Provider 请求', async () => {
    const state = await execute(summary(policy, new Date(Date.now() - 1_000).toISOString()));
    expect(requestCount).toBe(0);
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorCode: 'research_deadline_expired',
        continuationBlockedReason: 'expired',
      }),
    );
  });

  it('用户取消在途流时不 fallback，并释放为 cancelled/unknown 终态', async () => {
    mode = 'hang';
    const controller = new AbortController();
    const pending = execute(summary(), controller.signal);
    await vi.waitFor(() => expect(requestCount).toBe(1));
    controller.abort('user_cancelled');
    const state = await pending;
    expect(requestCount).toBe(1);
    expect(state.markUnknown).toHaveBeenCalledOnce();
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ continuationBlockedReason: 'cancelled' }),
    );
  });

  it('执行时 Provider 价格变化仍使用创建时冻结的模型价格', async () => {
    const frozenPolicy = {
      ...policy,
      maxCost: '10',
      costCurrency: 'USD',
      paidRoutes: [{ provider: 'primary', models: ['fixture-model'] }],
    };
    const state = await execute(summary(frozenPolicy), new AbortController().signal, {
      currentPricing: { costPer1kInput: 9, costPer1kOutput: 9, costCurrency: 'USD' },
      frozenPricing: {
        costPer1kInput: 0.1,
        costPer1kOutput: 0.2,
        costCurrency: 'USD',
        pricingVersion: 'pricing-frozen-v1',
      },
    });

    expect(state.execution().requests[0]?.reservation.cost).toEqual({
      status: 'estimated',
      amount: '2.0013',
      currency: 'USD',
      source: 'frozen_provider_pricing',
      pricingVersion: 'pricing-frozen-v1',
    });
    expect(state.execution().requests[0]?.usageRevisions[0]?.cost).toMatchObject({
      amount: '0.0021',
      pricingVersion: 'pricing-frozen-v1',
    });
  });
});
