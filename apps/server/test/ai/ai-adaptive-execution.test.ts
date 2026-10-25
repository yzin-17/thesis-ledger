import { aiGenerationContracts, type AiExecutionSummary } from '@thesis-ledger/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiAdaptiveExecution } from '../../src/ai/adaptive/ai-adaptive-execution.js';
import { MemoryAdaptiveObservationStore } from '../../src/ai/adaptive/ai-adaptive-history.store.js';
import { adaptiveProfile } from '../../src/ai/adaptive/ai-adaptive-policy.js';
import {
  AiSdkGenerationError,
  type AiSdkGenerationRequest,
} from '../../src/ai/ai-sdk-generation.adapter.js';

const request = (): AiSdkGenerationRequest<unknown> => ({
  requestId: '00000000-0000-4000-8000-000000000001',
  adapter: 'openai-compatible',
  providerId: 'same',
  baseURL: 'http://fixture/v1',
  apiKey: 'private',
  model: 'fixed',
  messages: [{ role: 'user', content: 'test' }],
  contract: aiGenerationContracts.research.ref,
  schema: aiGenerationContracts.research.schema,
  mode: 'json_validated',
  transport: 'stream',
  timeout: { totalMs: 300_000, firstChunkMs: 30_000, chunkMs: 30_000 },
  signal: new AbortController().signal,
});
const sources = {
  configurationFingerprint: 'fp',
  firstOutputTimeoutSource: 'system',
  outputIdleTimeoutSource: 'system',
} as const;
const result = {
  output: {},
  finishReason: 'stop',
  rawFinishReason: 'stop',
  usage: { status: 'reported', inputTokens: 1, outputTokens: 1 },
  actualModel: 'fixed',
  providerCost: '0',
  providerCostCurrency: 'USD',
  timeToFirstEventMs: 45_000,
  timeToFirstTextMs: 45_000,
};
const rejection = new AiSdkGenerationError({
  code: 'provider_rejected',
  externalResult: 'rejected_before_generation',
  phase: 'request',
  requestId: request().requestId,
  summary: 'busy',
  retryAfterMs: 0,
});

describe('自适应执行反馈', () => {
  afterEach(() => vi.useRealTimers());
  it('SDK准备或trace开销不能重新起算冻结的绝对期限', async () => {
    const adapter = {
      generate: vi.fn(async (value: AiSdkGenerationRequest<unknown>) => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        value.signal.throwIfAborted();
        return result;
      }),
    };
    await expect(
      new AiAdaptiveExecution().generate(adapter as never, request(), sources, Date.now() + 30),
    ).rejects.toThrow();
    expect(adapter.generate).toHaveBeenCalledOnce();
    expect(adapter.generate.mock.calls[0]![0].signal.aborted).toBe(true);
  });
  it('只修改SDK等待策略，保持模型／Provider／消息／Schema与SDK单次调用', async () => {
    const input = request(),
      store = new MemoryAdaptiveObservationStore();
    const adapter = { generate: vi.fn().mockResolvedValue(result) };
    const service = new AiAdaptiveExecution(store);
    await service.generate(adapter as never, input, sources, Date.now() + 300_000);
    expect(adapter.generate).toHaveBeenCalledOnce();
    const sent = adapter.generate.mock.calls[0]![0];
    expect(sent).toMatchObject({
      model: 'fixed',
      providerId: 'same',
      messages: input.messages,
      schema: input.schema,
      contract: input.contract,
    });
    expect(sent.timeout.firstChunkMs).toBeGreaterThan(120_000);
    expect(sent.adaptiveExecution.first.source).toBe('cold_start');
    expect((await store.read(adaptiveProfile(input, 'fp'))).observations[0]).toMatchObject({
      firstMs: 45_000,
      firstCensored: false,
      outcome: 'success',
    });
  });
  it('头或heartbeat不算首语义输出，未知失败留下截尾标识', async () => {
    const input = request(),
      store = new MemoryAdaptiveObservationStore();
    const adapter = {
      generate: vi.fn(async (value: AiSdkGenerationRequest<unknown>) => {
        value.onProgress?.({ type: 'heartbeat', at: new Date().toISOString() });
        throw new AiSdkGenerationError({
          ...rejection.fact,
          code: 'transport_unknown',
          externalResult: 'unknown',
        });
      }),
    };
    await expect(
      new AiAdaptiveExecution(store).generate(
        adapter as never,
        input,
        sources,
        Date.now() + 300_000,
      ),
    ).rejects.toThrow();
    expect((await store.read(adaptiveProfile(input, 'fp'))).observations[0]).toMatchObject({
      firstMs: null,
      firstCensored: true,
      outcome: 'unknown',
    });
  });
  it('实际模型不同及动态router不训练固定模型统计', async () => {
    for (const model of ['fixed', 'openrouter/free']) {
      const input = { ...request(), model },
        store = new MemoryAdaptiveObservationStore();
      const adapter = { generate: vi.fn().mockResolvedValue({ ...result, actualModel: 'other' }) };
      await new AiAdaptiveExecution(store).generate(
        adapter as never,
        input,
        sources,
        Date.now() + 300_000,
      );
      expect((await store.read(adaptiveProfile(input, 'fp'))).observations).toEqual([]);
    }
  });
  it('明确拒绝不伪造首输出时间或将其作为超时样本', async () => {
    const input = request(),
      store = new MemoryAdaptiveObservationStore();
    const adapter = { generate: vi.fn().mockRejectedValue(rejection) };
    await expect(
      new AiAdaptiveExecution(store).generate(
        adapter as never,
        input,
        sources,
        Date.now() + 300_000,
      ),
    ).rejects.toThrow();
    expect((await store.read(adaptiveProfile(input, 'fp'))).observations[0]).toMatchObject({
      firstMs: null,
      firstCensored: false,
      gapCensored: false,
      outcome: 'rejected',
    });
  });
  it('取消或缓存读取耗尽期限时不调用派发授权或SDK', async () => {
    const input = request(),
      authorize = vi.fn().mockResolvedValue(true),
      adapter = { generate: vi.fn() };
    const controller = new AbortController();
    controller.abort();
    await expect(
      new AiAdaptiveExecution().generate(
        adapter as never,
        { ...input, signal: controller.signal },
        sources,
        Date.now() + 1000,
        authorize,
      ),
    ).rejects.toMatchObject({ fact: { externalResult: 'not_sent' } });
    await expect(
      new AiAdaptiveExecution().generate(
        adapter as never,
        input,
        sources,
        Date.now() - 1,
        authorize,
      ),
    ).rejects.toMatchObject({ fact: { externalResult: 'not_sent' } });
    expect(authorize).not.toHaveBeenCalled();
    expect(adapter.generate).not.toHaveBeenCalled();
  });
  it('所有权授权失败时不发送，也不生成学习样本', async () => {
    const input = request(),
      store = new MemoryAdaptiveObservationStore(),
      adapter = { generate: vi.fn() };
    expect(
      await new AiAdaptiveExecution(store).generate(
        adapter as never,
        input,
        sources,
        Date.now() + 1000,
        async () => false,
      ),
    ).toBeNull();
    expect(adapter.generate).not.toHaveBeenCalled();
    expect((await store.read(adaptiveProfile(input, 'fp'))).observations).toEqual([]);
  });
  it('缓存接口异常不会掩盖正常SDK结果或扩大重试', async () => {
    const service = new AiAdaptiveExecution({
      read: async () => {
        throw new Error('offline');
      },
      record: async () => {
        throw new Error('offline');
      },
      takeRetry: async () => {
        throw new Error('offline');
      },
    });
    const adapter = { generate: vi.fn().mockResolvedValue(result) };
    expect(
      await service.generate(adapter as never, request(), sources, Date.now() + 300_000),
    ).toEqual(result);
    expect(adapter.generate.mock.calls[0]![0].adaptiveExecution.first.source).toBe('unavailable');
  });
});

describe('重试按剩余预算与运行配额收敛', () => {
  const input = (policyCalls = 2) => ({
    execution: {
      frozenPolicy: { maxAiCalls: policyCalls },
      requests: [
        {
          reservation: { aiCalls: 1, inputTokens: 1, outputTokens: 1, cost: { amount: '0' } },
          usageRevisions: [],
        },
      ],
      continuationBlockedReason: null,
    } as unknown as AiExecutionSummary,
    error: rejection.fact,
    provider: 'same',
    model: 'fixed',
    configurationFingerprint: 'fp',
    messages: request().messages,
    route: { baseURL: request().baseURL, contract: request().contract, mode: request().mode },
    deadline: Date.now() + 300_000,
    signal: new AbortController().signal,
  });
  it('持续故障将额外尝试降到零，成功恢复配额', async () => {
    const store = new MemoryAdaptiveObservationStore(),
      service = new AiAdaptiveExecution(store);
    expect((await service.retry(input())).retry).toBe(true);
    expect(
      await service.retry({
        ...input(),
        error: { ...rejection.fact, requestId: '00000000-0000-4000-8000-000000000002' },
      }),
    ).toMatchObject({ retry: false, reason: 'retry_quota_exhausted' });
  });
  it('单次授权、未知结果、内容错误均不会获得额外发送', async () => {
    const service = new AiAdaptiveExecution();
    expect(await service.retry(input(1))).toMatchObject({
      retry: false,
      reason: 'calls_exhausted',
    });
    expect(
      await service.retry({ ...input(), error: { ...rejection.fact, externalResult: 'unknown' } }),
    ).toMatchObject({ retry: false, reason: 'not_confirmed_rejection' });
    expect(
      await service.retry({
        ...input(),
        error: { ...rejection.fact, code: 'schema_invalid', externalResult: 'complete' },
      }),
    ).toMatchObject({ retry: false, reason: 'not_confirmed_rejection' });
  });
});
