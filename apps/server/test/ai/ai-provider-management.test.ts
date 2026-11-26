import { key, successfulSdk } from './ai-provider-management.fixtures.js';
import { describe, expect, it, vi } from 'vitest';
import { AiProviderService } from '../../src/ai/ai-provider.service.js';
import { AI_GENERATION_SLOW_AFTER_MS } from '../../src/ai/ai-provider.service.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation.adapter.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { aiGenerationContracts, aiGenerationErrorSchema } from '@thesis-ledger/schemas';
import {
  createConfigStub,
  createHealthStub,
  createDbRow,
  validSettings,
} from './ai-provider-management.fixtures.js';

describe('Provider 指定模型和用途测试', () => {
  it('指定模型测试只请求目标模型，不回退到模型列表首项', async () => {
    const configs = createConfigStub();
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      successfulSdk() as never,
    );

    const result = await service.testDraft({
      name: 'targeted',
      baseUrl: 'https://provider.example/v1',
      models: ['first-model', 'target-model'],
      model: 'target-model',
      testKind: 'generation',
      modelPricing: {
        'target-model': { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
      },
      apiKey: key,
    });

    expect(result).toMatchObject({
      status: 'healthy',
      model: 'target-model',
      testKind: 'generation',
    });
    await expect(
      service.testDraft({
        name: 'targeted',
        baseUrl: 'https://provider.example/v1',
        models: ['first-model', 'target-model'],
        model: 'missing-model',
        apiKey: key,
      }),
    ).rejects.toThrow('模型未被 Provider 选择');
  });

  it('业务用途测试绑定目标模型、用途和输出方式，不退回最小探针', async () => {
    const configs = createConfigStub();
    const sdk = {
      generate: vi.fn(async (input: Record<string, unknown>) => {
        void input;
        return { output: { ok: true } };
      }),
    };
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      sdk as never,
    );

    const result = await service.testDraft({
      name: 'purpose-test',
      baseUrl: 'https://provider.example/v1',
      models: ['target-model'],
      model: 'target-model',
      testKind: 'generation',
      purpose: 'research',
      mode: 'native_schema',
      modelReasoning: { 'target-model': { supportedEfforts: ['high'] } },
      executionRoutes: [
        {
          model: 'target-model',
          contract: aiGenerationContracts.research.ref,
          mode: 'native_schema',
          reasoningEffort: 'high',
        },
      ],
      modelPricing: {
        'target-model': { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
      },
      apiKey: key,
    });

    expect(result).toMatchObject({
      status: 'healthy',
      model: 'target-model',
      purpose: 'research',
      mode: 'native_schema',
    });
    expect(sdk.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'target-model',
        mode: 'native_schema',
        contract: aiGenerationContracts.research.ref,
      }),
    );
    const generated = sdk.generate.mock.calls[0]?.[0];
    const messages = generated?.messages as Array<{ role: string; content: string }>;
    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[0]?.content).toContain('不增加、删减或修改字段');
    const example = messages[1]!.content.slice(messages[1]!.content.indexOf('{'));
    expect(aiGenerationContracts.research.schema.parse(JSON.parse(example))).toMatchObject({
      version: 'research-report-generation-v1',
      claims: [],
    });
    // 用途探针要真正产出契约实例，给推理模型保留安全输出预算；用途探针复用已选推理强度。
    expect(generated).toMatchObject({ maxOutputTokens: 8_192 });
    expect(generated).toHaveProperty('reasoningEffort', 'high');
  });

  it('连接探针保持单条最小 JSON 指令，不内联业务契约', async () => {
    const configs = createConfigStub();
    const sdk = {
      generate: vi.fn(async (input: Record<string, unknown>) => {
        void input;
        return { output: { ok: true } };
      }),
    };
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      sdk as never,
    );

    const result = await service.testDraft({
      name: 'connection-probe',
      baseUrl: 'https://provider.example/v1',
      models: ['target-model'],
      model: 'target-model',
      testKind: 'connection',
      apiKey: key,
    });

    expect(result).toMatchObject({ status: 'healthy', testKind: 'connection' });
    const generated = sdk.generate.mock.calls[0]?.[0];
    expect(generated?.messages).toEqual([
      {
        role: 'user',
        content: expect.stringContaining('Return exactly this JSON object: {"ok":true}.'),
      },
    ]);
    expect(JSON.stringify(generated?.messages)).not.toContain('conclusion');
    expect(generated).toMatchObject({ maxOutputTokens: 1_024 });
    expect(generated).not.toHaveProperty('reasoningEffort');
  });

  it('探针保留SDK完成等待超时，不冒充用户取消', async () => {
    const configs = createConfigStub();
    const sdk = {
      generate: vi.fn(async () =>
        Promise.reject(
          new AiSdkGenerationError(
            aiGenerationErrorSchema.parse({
              code: 'provider_completion_timeout',
              phase: 'request',
              summary: '非流式完成等待超时',
              externalResult: 'unknown',
              requestId: '3f2f9f7e-8f2f-4f2f-9f2f-2f9f7e8f2f4f',
            }),
          ),
        ),
      ),
    };
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      sdk as never,
    );

    const result = await service.testDraft({
      name: 'timeout-probe',
      baseUrl: 'https://provider.example/v1',
      models: ['target-model'],
      model: 'target-model',
      testKind: 'connection',
      timeoutMs: 1_500,
      apiKey: key,
    });

    expect(result).toMatchObject({
      status: 'down',
      errorCode: 'provider_completion_timeout',
      message: '非流式完成等待超时',
    });
  });
});

describe('Provider 生成费用授权', () => {
  it('指定模型生成测试在费用未知时生成前阻断且不写健康状态', async () => {
    const configs = createConfigStub();
    const health = createHealthStub();
    const sdk = successfulSdk();
    const service = new AiProviderService(
      configs.service as never,
      health as never,
      new AiProviderRegistry(),
      sdk as never,
    );

    const result = await service.testDraft({
      name: 'unknown-pricing',
      baseUrl: 'https://provider.example/v1',
      models: ['target-model'],
      model: 'target-model',
      testKind: 'generation',
      apiKey: key,
    });

    expect(result).toMatchObject({
      status: 'config_error',
      errorCode: 'invalid_config',
      model: 'target-model',
      testKind: 'generation',
    });
    expect(result.message).toContain('费用未知');
    expect(sdk.generate).not.toHaveBeenCalled();
    expect(health.record).not.toHaveBeenCalled();

    const partial = await service.testDraft({
      name: 'partial-pricing',
      baseUrl: 'https://provider.example/v1',
      models: ['target-model'],
      model: 'target-model',
      testKind: 'generation',
      modelPricing: {
        'target-model': { costPer1kInput: 0, costCurrency: 'USD' },
      },
      apiKey: key,
    });
    expect(partial.status).toBe('config_error');
    expect(sdk.generate).not.toHaveBeenCalled();
  });

  it('指定模型非零费率必须显式授权后才发出生成请求', async () => {
    const configs = createConfigStub();
    const sdk = successfulSdk();
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      sdk as never,
    );
    const input = {
      name: 'paid-test',
      baseUrl: 'https://provider.example/v1',
      models: ['paid-model'],
      model: 'paid-model',
      testKind: 'generation' as const,
      modelPricing: {
        'paid-model': { costPer1kInput: 0.1, costPer1kOutput: 0.2, costCurrency: 'USD' },
      },
      apiKey: key,
    };

    const denied = await service.testDraft(input);
    expect(denied).toMatchObject({ status: 'config_error', errorCode: 'invalid_config' });
    expect(denied.message).toContain('明确授权');
    expect(sdk.generate).not.toHaveBeenCalled();

    const allowed = await service.testDraft({ ...input, budgetAuthorized: true });
    expect(allowed).toMatchObject({ status: 'healthy', model: 'paid-model' });
    expect(sdk.generate).toHaveBeenCalledOnce();
  });

  it('生成测试保留上游报告的非零费用，不被用户零费率覆盖', async () => {
    const configs = createConfigStub();
    const sdk = {
      generate: vi.fn(async () => ({
        output: { ok: true },
        usage: { status: 'reported', inputTokens: 10, outputTokens: 20 },
        providerCost: '0.75',
        providerCostCurrency: 'USD',
      })),
    };
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      sdk as never,
    );

    const result = await service.testDraft({
      name: 'reported-cost',
      baseUrl: 'https://provider.example/v1',
      models: ['reported-model'],
      model: 'reported-model',
      testKind: 'generation',
      modelPricing: {
        'reported-model': { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
      },
      apiKey: key,
    });

    expect(result).toMatchObject({
      status: 'healthy',
      usage: { status: 'reported', inputTokens: 10, outputTokens: 20 },
      cost: {
        status: 'known',
        amount: '0.75',
        currency: 'USD',
        source: 'provider_reported',
      },
    });

    const estimateService = new AiProviderService(
      createConfigStub().service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      {
        generate: vi.fn(async () => ({
          output: { ok: true },
          usage: { status: 'reported', inputTokens: 10, outputTokens: 20 },
          providerCost: null,
          providerCostCurrency: null,
        })),
      } as never,
    );
    const estimated = await estimateService.testDraft({
      name: 'estimated-cost',
      baseUrl: 'https://provider.example/v1',
      models: ['estimated-model'],
      model: 'estimated-model',
      testKind: 'generation',
      modelPricing: {
        'estimated-model': { costPer1kInput: 0.1, costPer1kOutput: 0.2, costCurrency: 'USD' },
      },
      budgetAuthorized: true,
      apiKey: key,
    });
    expect(estimated.cost).toMatchObject({
      status: 'estimated',
      amount: '0.005',
      currency: 'USD',
      source: 'configured_model_pricing',
    });
  });
});

describe('Provider 已保存生成与健康历史', () => {
  it('已保存生成测试把用量、费用和配置归因写入健康历史详情', async () => {
    const configs = createConfigStub([
      createDbRow('history-facts', {
        settings: {
          ...validSettings('https://history.example/v1', ['history-model']),
          modelPricing: {
            'history-model': {
              costPer1kInput: 0.1,
              costPer1kOutput: 0.2,
              costCurrency: 'USD',
              pricingVersion: 'history-price-v1',
              updatedAt: '2026-09-21T00:00:00.000Z',
              source: 'user',
            },
          },
        },
      }),
    ]);
    const health = createHealthStub();
    const service = new AiProviderService(
      configs.service as never,
      health as never,
      new AiProviderRegistry(),
      {
        generate: vi.fn(async () => ({
          output: { ok: true },
          usage: { status: 'reported', inputTokens: 12, outputTokens: 8 },
          providerCost: null,
          providerCostCurrency: null,
        })),
      } as never,
    );

    await expect(
      service.testSaved('history-facts', {
        model: 'history-model',
        testKind: 'generation',
        budgetAuthorized: true,
      }),
    ).resolves.toMatchObject({ status: 'healthy', model: 'history-model' });

    expect(health.record).toHaveBeenCalledWith(
      'history-facts',
      true,
      expect.any(Number),
      undefined,
      expect.any(Date),
      'manual',
      expect.objectContaining({
        kind: 'ai_provider_probe',
        testKind: 'generation',
        model: 'history-model',
        usage: { status: 'reported', inputTokens: 12, outputTokens: 8 },
        cost: {
          status: 'estimated',
          amount: '0.0028',
          currency: 'USD',
          pricingVersion: 'history-price-v1',
          source: 'configured_model_pricing',
        },
      }),
      // AI 链路自带「慢」阈值：成功的慢生成不该被 3 秒的默认阈值判成 degraded。
      AI_GENERATION_SLOW_AFTER_MS,
    );
  });

  it('保存的生成测试使用已保存模型价格，并在授权前不写健康状态', async () => {
    const configs = createConfigStub([
      createDbRow('saved-paid', {
        settings: {
          ...validSettings('https://saved.example/v1', ['saved-model']),
          modelPricing: {
            'saved-model': {
              costPer1kInput: 0.1,
              costPer1kOutput: 0.2,
              costCurrency: 'USD',
              pricingVersion: 'frozen-v1',
              updatedAt: '2026-09-21T00:00:00.000Z',
              source: 'user',
            },
          },
        },
      }),
    ]);
    const health = createHealthStub();
    const sdk = successfulSdk();
    const service = new AiProviderService(
      configs.service as never,
      health as never,
      new AiProviderRegistry(),
      sdk as never,
    );

    const denied = await service.testSaved('saved-paid', {
      model: 'saved-model',
      testKind: 'generation',
    });
    expect(denied.status).toBe('config_error');
    expect(sdk.generate).not.toHaveBeenCalled();
    expect(health.record).not.toHaveBeenCalled();

    const allowed = await service.testSaved('saved-paid', {
      model: 'saved-model',
      testKind: 'generation',
      budgetAuthorized: true,
    });
    expect(allowed).toMatchObject({ status: 'healthy', model: 'saved-model' });
    expect(sdk.generate).toHaveBeenCalledOnce();
  });

  it('取消已保存测试时保留历史和已知事实，不更新 Provider 健康状态', async () => {
    const configs = createConfigStub([createDbRow('cancelled-test')]);
    const health = createHealthStub();
    const sdk = {
      generate: vi.fn(
        (input: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            input.signal.addEventListener('abort', () => reject(input.signal.reason), {
              once: true,
            });
          }),
      ),
    };
    const service = new AiProviderService(
      configs.service as never,
      health as never,
      new AiProviderRegistry(),
      sdk as never,
    );
    const requestId = '7f8d8c0e-b6b8-4a5f-a2f2-2e1b7d2f6f77';
    const pending = service.testSaved('cancelled-test', {
      requestId,
      testKind: 'connection',
    });
    await vi.waitFor(() => expect(sdk.generate).toHaveBeenCalledOnce());

    expect(service.cancelTest('cancelled-test', requestId)).toEqual({
      name: 'cancelled-test',
      requestId,
      cancelled: true,
    });
    await expect(pending).resolves.toMatchObject({
      status: 'cancelled',
      errorCode: 'cancelled',
      requestId,
      usage: { status: 'unknown' },
      cost: { status: 'unknown', amount: null, currency: null },
    });
    expect(health.record).not.toHaveBeenCalled();
    expect(health.recordHistory).toHaveBeenCalledOnce();
    const historyCall = health.recordHistory.mock.calls[0];
    expect(historyCall?.slice(0, 2)).toEqual(['cancelled-test', 'degraded']);
    expect(typeof historyCall?.[2]).toBe('number');
    expect(historyCall?.[3]).toBe('cancelled');
    expect(historyCall?.[4]).toBeInstanceOf(Date);
    expect(historyCall?.[5]).toBe('manual');
    expect(historyCall?.[6]).toMatchObject({
      status: 'cancelled',
      errorCode: 'cancelled',
      cost: { status: 'unknown', amount: null, currency: null },
    });
  });
});
