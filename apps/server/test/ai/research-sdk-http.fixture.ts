import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import {
  aiGenerationContracts,
  type AiExecutionSummary,
  type AiResearchPolicyV1,
} from '@thesis-ledger/schemas';
import { vi } from 'vitest';
import { AiResearchSdkExecution } from '../../src/ai/ai-research-sdk-execution.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { createAiTimeoutPolicy } from '../../src/ai/timeout/ai-timeout-policy.js';
import { researchExecutionDeadline } from '../../src/ai/timeout/ai-execution-clock.js';

export const policy: AiResearchPolicyV1 = {
  version: 'research-policy-v1' as const,
  maxAiCalls: 2,
  maxInputTokens: 100_000,
  maxOutputTokens: 20_000,
  maxDurationSeconds: 300,
  maxCost: '0',
  costCurrency: null,
  paidRoutes: [],
};

export const summary = (
  frozenPolicy = policy,
  deadlineAt = new Date(Date.now() + 60_000).toISOString(),
): AiExecutionSummary => ({
  version: 'sdk-execution-v1',
  contract: aiGenerationContracts.research.ref,
  frozenPolicy,
  deadlineAt,
  // 本地HTTP时序按毫秒缩尺；生产初值另由策略合同测试验证。
  timing: {
    policy: {
      ...createAiTimeoutPolicy('research', frozenPolicy.maxDurationSeconds * 1_000),
      cleanupReserveMs: 10,
      firstOutputTimeoutMs: 300,
      outputIdleTimeoutMs: 900,
    },
    queueExpiresAt: deadlineAt,
    firstStartedAt: null,
    taskDeadlineAt: deadlineAt,
    origin: 'legacy_deadline',
  },
  generationStatus: 'pending',
  usageCompleteness: 'unknown',
  requests: [],
  continuationBlockedReason: null,
});

const researchContent = JSON.stringify({
  conclusion: '本地研究结果',
  evidence: [],
  risks: [],
  unknowns: [],
  disclaimer: 'test',
  signals: [],
});

/** 慢流每块的间隔；总时长必然超过用例给出的 Provider 级超时。 */
const SLOW_STREAM_CHUNK_GAP_MS = 400;

const writeSse = (response: ServerResponse, model = 'fixture-model') => {
  const content = researchContent;
  const common = {
    id: 'research-fixture',
    object: 'chat.completion.chunk',
    created: 1,
    model,
  };
  if (!response.headersSent) response.writeHead(200, { 'content-type': 'text/event-stream' });
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
  const recordTimeoutDecision = vi.fn(
    async (
      _owner: unknown,
      requestId: string,
      decision: AiExecutionSummary['requests'][number]['timeoutDecision'],
    ) => {
      execution = {
        ...execution,
        requests: execution.requests.map((request) =>
          request.requestId === requestId ? { ...request, timeoutDecision: decision! } : request,
        ),
      };
      return researchExecutionDeadline(execution) > Date.now();
    },
  );
  return {
    store: {
      prepareRequest,
      authorizeDispatch,
      recordTimeoutDecision,
      completeAndSettle,
      markUnknown,
      failOwned,
    },
    execution: () => execution,
    failOwned,
    markUnknown,
  };
};

export type RouteTimeouts = {
  providerTimeoutMs?: number;
  firstOutputTimeoutMs?: number;
  outputIdleTimeoutMs?: number;
  firstOutputTimeoutSource?: 'system' | 'provider' | 'route';
  outputIdleTimeoutSource?: 'system' | 'provider' | 'route';
};

export class ResearchSdkHttpFixture {
  private baseURL = '';
  requestCount = 0;
  returnedModel = 'fixture-model';
  mode:
    | 'fallback'
    | 'retryOnce'
    | 'lateFirst'
    | 'disconnect'
    | 'hang'
    | 'retryAfterDeadline'
    | 'slowStream'
    | 'success' = 'success';
  private rejects(url: string | undefined) {
    return (
      url?.startsWith('/primary/') &&
      (this.mode === 'fallback' ||
        this.mode === 'retryAfterDeadline' ||
        (this.mode === 'retryOnce' && this.requestCount === 1))
    );
  }
  private readonly server = createServer((request, response) => {
    this.requestCount += 1;
    if (this.rejects(request.url)) {
      response.writeHead(429, {
        'content-type': 'application/json',
        'retry-after': this.mode === 'retryAfterDeadline' ? '120' : '0',
      });
      response.end(JSON.stringify({ error: { message: 'capacity rejected' } }));
      return;
    }
    if (request.url?.startsWith('/primary/') && this.mode === 'disconnect') {
      response.destroy();
      return;
    }
    if (request.url?.startsWith('/primary/') && this.mode === 'hang') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(': waiting\n\n');
      return;
    }
    if (request.url?.startsWith('/primary/') && this.mode === 'lateFirst') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(': waiting\n\n');
      const timer = setTimeout(() => writeSse(response, this.returnedModel), 120);
      response.on('close', () => clearTimeout(timer));
      return;
    }
    // 一直在出字、但总时长必然超过 Provider 级「超时（毫秒）」的慢流：
    // 用来证明判活看的是“还在不在产出”，不是固定总时长。
    if (request.url?.startsWith('/primary/') && this.mode === 'slowStream') {
      response.on('error', () => undefined);
      const common = {
        id: 'slow-stream',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'fixture-model',
      };
      const pieces = researchContent.match(/.{1,24}/gu) ?? [];
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      pieces.forEach((piece, index) => {
        setTimeout(() => {
          response.write(
            `data: ${JSON.stringify({
              ...common,
              choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
            })}\n\n`,
          );
        }, index * SLOW_STREAM_CHUNK_GAP_MS);
      });
      setTimeout(() => {
        response.write(
          `data: ${JSON.stringify({
            ...common,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })}\n\n`,
        );
        response.end('data: [DONE]\n\n');
      }, pieces.length * SLOW_STREAM_CHUNK_GAP_MS);
      return;
    }
    writeSse(response, this.returnedModel);
  });

  async start() {
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('本地研究Provider启动失败');
    this.baseURL = `http://127.0.0.1:${address.port}`;
  }
  reset() {
    this.requestCount = 0;
    this.returnedModel = 'fixture-model';
    this.mode = 'success';
  }
  async stop() {
    this.server.closeAllConnections();
    this.server.close();
    await once(this.server, 'close');
  }
  private provider = (
    id: string,
    path: string,
    pricing = { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
    timeouts: RouteTimeouts = {},
  ) => ({
    id,
    models: ['fixture-model'],
    metadata: {
      health: 'healthy' as const,
      ...pricing,
    },
    sdkRuntime: () => ({
      baseURL: `${this.baseURL}/${path}/v1`,
      apiKey: 'secret',
      timeoutMs: timeouts.providerTimeoutMs ?? 2_000,
    }),
  });

  private route = (
    id: string,
    path: string,
    pricing = { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
    timeouts: RouteTimeouts = {},
  ) => ({
    provider: this.provider(id, path, pricing, timeouts),
    execution: {
      adapter: 'openai-compatible' as const,
      mode: 'json_validated' as const,
      readiness: { configurationFingerprint: `${id}-fingerprint` },
      ...(timeouts.firstOutputTimeoutMs === undefined
        ? {}
        : { firstOutputTimeoutMs: timeouts.firstOutputTimeoutMs }),
      ...(timeouts.outputIdleTimeoutMs === undefined
        ? {}
        : { outputIdleTimeoutMs: timeouts.outputIdleTimeoutMs }),
      firstOutputTimeoutSource: timeouts.firstOutputTimeoutSource,
      outputIdleTimeoutSource: timeouts.outputIdleTimeoutSource,
    },
  });

  private run = (
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

  execute = async (
    execution: AiExecutionSummary,
    signal = new AbortController().signal,
    options: {
      currentPricing?: { costPer1kInput: number; costPer1kOutput: number; costCurrency: string };
      frozenPricing?: Record<string, number | string>;
      timeouts?: RouteTimeouts;
      adapter?: AiSdkGenerationAdapter;
      authorizeDelayMs?: number;
    } = {},
  ) => {
    const state = stateStore(execution);
    if (options.authorizeDelayMs) {
      const authorize = state.store.authorizeDispatch.getMockImplementation()!;
      state.store.authorizeDispatch.mockImplementation(async (...args) => {
        await delay(options.authorizeDelayMs);
        if (Date.now() >= researchExecutionDeadline(state.execution())) return false;
        return authorize(...args);
      });
    }
    const registry = {
      defaultModel: () => 'fixture-model',
      readyContractCandidates: () => [
        this.route('primary', 'primary', options.currentPricing, options.timeouts),
        this.route('fallback', 'fallback', options.currentPricing, options.timeouts),
      ],
    };
    const service = new AiResearchSdkExecution(
      registry as never,
      options.adapter ?? new AiSdkGenerationAdapter(),
      state.store as never,
    );
    await service.execute({
      ownership: { runId: '11111111-1111-4111-8111-111111111111', executionAttempt: 1 },
      run: this.run(execution, options.frozenPricing),
      messages: [{ role: 'user', content: 'Return research JSON.' }],
      startedAt: Date.now(),
      signal,
      buildResult: (output, selectedProvider) => ({ ...output, provider: selectedProvider }),
    });
    return state;
  };
}
