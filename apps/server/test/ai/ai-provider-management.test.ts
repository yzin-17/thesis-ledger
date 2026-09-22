import { describe, expect, it, vi } from 'vitest';
import {
  encryptProviderCredential,
  decryptProviderCredential,
} from '../../src/platform/credential-security.js';
import { AiProviderService } from '../../src/ai/ai-provider.service.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation.adapter.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { ProviderConfigService } from '../../src/providers/provider-config.service.js';
import { aiGenerationContracts, aiGenerationErrorSchema } from '@thesis-ledger/schemas';

const key = 'test-api-key-not-returned';
const successfulSdk = () => ({
  generate: vi.fn(async (input: unknown) => {
    void input;
    return { output: { ok: true } };
  }),
});
type TestRow = {
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  settings: Record<string, unknown>;
  encryptedCredentials?: Uint8Array;
  health: string;
  updatedAt: Date;
};
type SaveInput = {
  name: string;
  enabled?: boolean;
  priority: number;
  capabilities: string[];
  credentialsRef?: string;
  settings: Record<string, unknown>;
  clearCredentials?: boolean;
};

const validSettings = (baseUrl = 'https://db.example/v1', models = ['db-model']) => ({
  baseUrl,
  models,
  upstreamFormat: 'chat-completions',
  chatImplementation: 'compatible',
});

const createConfigStub = (initial: TestRow[] = []) => {
  let rows = [...initial];
  const service = {
    listStored: vi.fn(async () => rows),
    findStored: vi.fn(async (name: string) => rows.find((row) => row.name === name)),
    readCredential: vi.fn(async (config: { encryptedCredentials?: Uint8Array }) =>
      config.encryptedCredentials
        ? decryptProviderCredential(config.encryptedCredentials).credential
        : '',
    ),
    setEnabled: vi.fn(async (name: string, enabled: boolean) => {
      const row = rows.find((item) => item.name === name);
      if (!row) throw new Error('missing row');
      row.enabled = enabled;
      row.updatedAt = new Date();
      return row;
    }),
    setHealth: vi.fn(async (name: string, health: string) => {
      const row = rows.find((item) => item.name === name);
      if (!row) throw new Error('missing row');
      row.health = health;
      return row;
    }),
    deleteStored: vi.fn(async (name: string) => {
      rows = rows.filter((row) => row.name !== name);
    }),
    saveAi: vi.fn(async (input: SaveInput) => {
      const existing = rows.find((row) => row.name === input.name);
      const saved: TestRow = {
        name: input.name,
        type: 'ai',
        enabled: input.enabled ?? existing?.enabled ?? true,
        priority: input.priority,
        capabilities: input.capabilities,
        settings: input.settings,
        ...(!input.clearCredentials && existing?.encryptedCredentials
          ? { encryptedCredentials: existing.encryptedCredentials }
          : {}),
        health: existing?.health ?? 'unknown',
        updatedAt: new Date(),
      };
      rows = [...rows.filter((row) => row.name !== input.name), saved];
      return saved;
    }),
  };
  return {
    service,
    replace(next: TestRow[]) {
      rows = next;
    },
  };
};

const createHealthStub = () => ({
  record: vi.fn(
    async (
      provider: string,
      success: boolean,
      latencyMs: number,
      _error: string | undefined,
      checkedAt: Date,
    ) => ({
      provider,
      state: success ? 'healthy' : 'degraded',
      latencyMs,
      checkedAt,
    }),
  ),
    recordHistory: vi.fn(
      async (
        provider: string,
        state: string,
        latencyMs: number,
        errorCode: string | undefined,
        checkedAt: Date,
        source: string,
        details: unknown,
      ) => {
        void provider;
        void state;
        void latencyMs;
        void errorCode;
        void checkedAt;
        void source;
        void details;
        return null;
      },
    ),
    get: vi.fn(async () => null),
});

const createDbRow = (name: string, overrides: Partial<TestRow> = {}): TestRow => ({
  name,
  type: 'ai',
  enabled: true,
  priority: 1,
  capabilities: ['chat'],
  settings: validSettings(),
  encryptedCredentials: encryptProviderCredential(`db-key-${name}`),
  health: 'unknown',
  updatedAt: new Date('2026-09-14T00:00:00.000Z'),
  ...overrides,
});

describe('AI Provider 持久化管理', () => {
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
      executionRoutes: [
        {
          model: 'target-model',
          contract: aiGenerationContracts.research.ref,
          mode: 'native_schema',
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
    // json_validated 由应用侧解析文本，探针必须要求纯 JSON 并内联契约 schema。
    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[0]?.content).toContain('只返回一个满足给定 JSON Schema 的 JSON 对象');
    expect(messages[0]?.content).toContain('不要输出 Markdown');
    expect(messages[1]?.content).toContain('"conclusion"');
    // 用途探针要真正产出契约实例，给推理模型保留安全输出预算；探针本身仍保持中性。
    expect(generated).toMatchObject({ maxOutputTokens: 8_192 });
    expect(generated).not.toHaveProperty('reasoningEffort');
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
      { role: 'user', content: 'Return exactly this JSON object: {"ok":true}.' },
    ]);
    expect(generated).toMatchObject({ maxOutputTokens: 1_024 });
    expect(generated).not.toHaveProperty('reasoningEffort');
  });

  it('探针超时报 provider_timeout，不冒充用户取消', async () => {
    const configs = createConfigStub();
    const sdk = {
      generate: vi.fn(async () =>
        Promise.reject(
          new AiSdkGenerationError(
            aiGenerationErrorSchema.parse({
              code: 'cancelled',
              phase: 'cancellation',
              summary: '生成请求已取消',
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
      errorCode: 'provider_timeout',
      message: 'Provider 未在 1500 ms 内返回结果，已按超时中断',
    });
  });

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
        kind: 'ai_provider_test',
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
      generate: vi.fn((input: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          input.signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        })),
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

  it('Provider 保存和生命周期操作拒绝缺失或过期版本', async () => {
    const row = createDbRow('versioned');
    const configs = createConfigStub([row]);
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
    );

    await expect(
      service.save({
        name: 'versioned',
        baseUrl: 'https://db.example/v1',
        models: ['db-model'],
      }),
    ).rejects.toThrow('保存');
    await expect(
      service.setEnabled('versioned', false, {
        expectedRevision: '2026-09-14T00:00:01.000Z',
      }),
    ).rejects.toThrow('变化');
  });

  it('停用研究默认 Provider 时在同一事务清除默认引用，并拒绝无确认操作', async () => {
    const row = createDbRow('default-provider');
    const configs = createConfigStub([row]);
    const settings: {
      id: string;
      researchDefaultProvider: string | null;
      researchDefaultModel: string | null;
      revision: number;
    } = {
      id: 'global',
      researchDefaultProvider: 'default-provider',
      researchDefaultModel: 'db-model',
      revision: 7,
    };
    const transaction = {
      providerConfig: {
        findUnique: vi.fn(async () => row),
        updateMany: vi.fn(async ({ data }: { data: { enabled: boolean } }) => {
          row.enabled = data.enabled;
          row.updatedAt = new Date('2026-09-14T00:00:02.000Z');
          return { count: 1 };
        }),
        deleteMany: vi.fn(),
      },
      aiRoutingSettings: {
        findUnique: vi.fn(async () => settings),
        updateMany: vi.fn(async () => {
          settings.researchDefaultProvider = null;
          settings.researchDefaultModel = null;
          settings.revision += 1;
          return { count: 1 };
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      successfulSdk() as never,
      undefined,
      prisma as never,
    );

    await expect(
      service.setEnabled('default-provider', false, {
        expectedRevision: row.updatedAt.toISOString(),
      }),
    ).rejects.toThrow('默认模型');
    expect(transaction.providerConfig.updateMany).not.toHaveBeenCalled();
    prisma.$transaction.mockClear();

    await service.setEnabled('default-provider', false, {
      expectedRevision: row.updatedAt.toISOString(),
      clearResearchDefault: true,
      expectedSettingsRevision: '7',
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.aiRoutingSettings.updateMany).toHaveBeenCalledOnce();
    expect(transaction.providerConfig.updateMany).toHaveBeenCalledOnce();
    expect(settings).toMatchObject({
      researchDefaultProvider: null,
      researchDefaultModel: null,
      revision: 8,
    });
    expect(row.enabled).toBe(false);
  });

  it('草稿测试不写健康历史，保存后密钥加密且 Registry 即时变化', async () => {
    let row: TestRow | undefined;
    const configs = {
      listStored: vi.fn(async () => (row ? [row] : [])),
      findStored: vi.fn(async () => row),
      readCredential: vi.fn(async (config: { encryptedCredentials?: Uint8Array }) =>
        config.encryptedCredentials
          ? decryptProviderCredential(config.encryptedCredentials).credential
          : '',
      ),
      saveAi: vi.fn(async (input: SaveInput) => {
        const encryptedCredentials = input.credentialsRef
          ? encryptProviderCredential(input.credentialsRef)
          : row?.encryptedCredentials;
        row = {
          ...row,
          ...input,
          type: 'ai',
          enabled: input.enabled ?? true,
          ...(encryptedCredentials ? { encryptedCredentials } : {}),
          health: row?.health ?? 'unknown',
          updatedAt: new Date(),
        };
        return row;
      }),
      setEnabled: vi.fn(async (_name: string, enabled: boolean) => {
        if (!row) throw new Error('missing row');
        row.enabled = enabled;
        return row;
      }),
      setHealth: vi.fn(async (_name: string, health: string) => {
        if (!row) throw new Error('missing row');
        row.health = health;
        return row;
      }),
      deleteStored: vi.fn(async () => {
        row = undefined;
      }),
    };
    const health = {
      record: vi.fn(
        async (
          provider: string,
          success: boolean,
          latencyMs: number,
          _error: string,
          checkedAt: Date,
        ) => ({
          provider,
          state: success ? 'healthy' : 'degraded',
          latencyMs,
          checkedAt,
        }),
      ),
      get: vi.fn(async () => null),
    };
    const registry = new AiProviderRegistry();
    const service = new AiProviderService(
      configs as never,
      health as never,
      registry,
      successfulSdk() as never,
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as { max_tokens?: number };
        expect(request.max_tokens).toBe(1_024);
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: {} }),
        };
      }),
    );
    try {
      const draft = await service.testDraft({
        name: 'openrouter',
        baseUrl: 'https://openrouter.example/v1',
        models: ['free-model'],
        apiKey: key,
        timeoutMs: 12_345,
        costPer1kInput: 0.1,
        costPer1kOutput: 0.2,
        costCurrency: 'USD',
      });
      expect(draft.status).toBe('healthy');
      expect(health.record).not.toHaveBeenCalled();
      expect(JSON.stringify(draft)).not.toContain(key);

      const saved = await service.save({
        name: 'openrouter',
        baseUrl: 'https://openrouter.example/v1',
        models: ['free-model'],
        timeoutMs: 12_345,
        costPer1kInput: 0.1,
        costPer1kOutput: 0.2,
        costCurrency: 'USD',
        connectionTestToken: draft.testToken,
      });
      expect(saved).toMatchObject({
        name: 'openrouter',
        source: 'database',
        credentialConfigured: true,
        timeoutMs: 12_345,
        costPer1kInput: 0.1,
        costPer1kOutput: 0.2,
        costCurrency: 'USD',
      });
      expect(saved).not.toHaveProperty('pricingVersion');
      expect(saved.modelPricing?.['free-model']).toMatchObject({
        source: 'legacy_provider',
        pricingVersion: expect.stringMatching(/^pricing-/u),
      });
      expect(JSON.stringify(saved)).not.toContain(key);
      if (!row?.encryptedCredentials) throw new Error('missing encrypted credentials');
      expect(Buffer.from(row.encryptedCredentials).toString('utf8')).not.toContain(key);
      expect(registry.list().map((provider) => provider.id)).toEqual(['openrouter']);

      const disabledRevision = row.updatedAt.toISOString();
      await service.setEnabled('openrouter', false, { expectedRevision: disabledRevision });
      expect(registry.list()).toEqual([]);
      await service.remove('openrouter', {
        expectedRevision: row.updatedAt.toISOString(),
      });
      expect(registry.list()).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Registry 快照校验失败时保留旧快照', () => {
    const registry = new AiProviderRegistry();
    const provider = {
      id: 'old',
      models: ['old-model'],
      complete: vi.fn(),
    };
    registry.register(provider);
    expect(() => registry.replace([{ id: '', models: [], complete: vi.fn() }])).toThrow();
    expect(() =>
      registry.replace([provider, { id: 'old', models: ['other-model'], complete: vi.fn() }]),
    ).toThrow('重复');
    expect(registry.list().map((item) => item.id)).toEqual(['old']);
  });

  it('连接测试统一通过 SDK adapter 发出单次中性探针', async () => {
    const configs = createConfigStub();
    const sdk = successfulSdk();
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      sdk as never,
    );
    try {
      await service.testDraft({
        name: 'mandatory',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['mandatory-model'],
        modelReasoning: {
          'mandatory-model': { supportedEfforts: [], mandatory: true },
        },
        apiKey: key,
      });
      await service.testDraft({
        name: 'unsupported-none',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['reasoning-model'],
        modelReasoning: {
          'reasoning-model': { supportedEfforts: ['high'] },
        },
        apiKey: key,
      });
      await service.testDraft({
        name: 'optional',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['optional-model'],
        modelReasoning: {
          'optional-model': { supportedEfforts: ['none'] },
        },
        apiKey: key,
      });
      await service.testDraft({
        name: 'unknown',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['unknown-model'],
        apiKey: key,
      });
      expect(sdk.generate).toHaveBeenCalledTimes(4);
      for (const [input] of sdk.generate.mock.calls) {
        expect(input).toMatchObject({
          mode: 'json_validated',
          transport: 'single',
          maxOutputTokens: 1_024,
        });
        expect(input).not.toHaveProperty('reasoningEffort');
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('连接测试失败时不隐式发出第二次请求', async () => {
    const configs = createConfigStub();
    const sdk = { generate: vi.fn(async () => Promise.reject(new Error('reasoning-only'))) };
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      sdk as never,
    );
    try {
      const result = await service.testDraft({
        name: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['nvidia/nemotron-3-super-120b-a12b:free'],
        modelReasoning: {
          'nvidia/nemotron-3-super-120b-a12b:free': {
            supportedEfforts: ['high'],
            mandatory: true,
          },
        },
        apiKey: key,
      });
      expect(result.status).toBe('down');
      expect(sdk.generate).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('统一流程允许同名非 AI Provider 转换为 AI', async () => {
    const existing = createDbRow('shared', { type: 'notification' });
    const configs = createConfigStub([existing]);
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      successfulSdk() as never,
    );

    await service.save({
      name: 'shared',
      baseUrl: 'https://ai.example/v1',
      models: ['model'],
      apiKey: 'new-key',
      expectedRevision: existing.updatedAt.toISOString(),
    });

    const saved = await configs.service.findStored('shared');
    expect(saved?.type).toBe('ai');
    expect(saved?.settings).toMatchObject({
      baseUrl: 'https://ai.example/v1',
      models: ['model'],
    });
    expect(configs.service.saveAi).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'shared', credentialsRef: 'new-key' }),
    );
  });

  it('模型目录支持草稿 Key 与已保存凭据，返回去重排序后的脱敏 ID', async () => {
    const configs = createConfigStub([createDbRow('saved')]);
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
    );
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-b' }] }),
      requestHeaders: init?.headers,
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const draft = await service.models({
        baseUrl: 'https://draft.example/v1/',
        apiKey: 'draft-secret',
        timeoutMs: 4_000,
      });
      const saved = await service.models({
        name: 'saved',
        baseUrl: 'https://db.example/v1',
      });

      expect(draft.models).toEqual(['model-a', 'model-b']);
      expect(saved.models).toEqual(['model-a', 'model-b']);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://draft.example/v1/models');
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { authorization: 'Bearer draft-secret' },
        redirect: 'error',
      });
      expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
        headers: { authorization: 'Bearer db-key-saved' },
      });
      expect(JSON.stringify([draft, saved])).not.toContain('secret');
      expect(JSON.stringify([draft, saved])).not.toContain('db-key-saved');
      await expect(
        service.models({ name: 'saved', baseUrl: 'https://other.example/v1' }),
      ).rejects.toThrow('Base URL 已变化');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('模型目录错误会脱敏且不会改变 Registry', async () => {
    const configs = createConfigStub();
    const registry = new AiProviderRegistry();
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      registry,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'unauthorized api_key=draft-secret' } }),
      })),
    );
    try {
      await expect(
        service.models({ baseUrl: 'https://draft.example/v1', apiKey: 'draft-secret' }),
      ).rejects.toThrow('api_key=[REDACTED]');
      expect(registry.list()).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('草稿令牌绑定完整运行配置，修改后不能复用', async () => {
    const configs = createConfigStub();
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
      successfulSdk() as never,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      })),
    );
    try {
      const draft = await service.testDraft({
        name: 'draft',
        baseUrl: 'https://one.example/v1',
        models: ['one'],
        apiKey: 'draft-key',
        priority: 3,
      });
      await expect(
        service.save({
          name: 'draft',
          baseUrl: 'https://two.example/v1',
          models: ['one'],
          apiKey: 'draft-key',
          priority: 3,
          connectionTestToken: draft.testToken,
        }),
      ).rejects.toThrow('草稿配置已变化');

      const secondDraft = await service.testDraft({
        name: 'draft',
        baseUrl: 'https://one.example/v1',
        models: ['one'],
        apiKey: 'draft-key',
        priority: 3,
      });
      await expect(
        service.save({
          name: 'draft',
          baseUrl: 'https://one.example/v1',
          models: ['one'],
          apiKey: 'different-key',
          priority: 3,
          connectionTestToken: secondDraft.testToken,
        }),
      ).rejects.toThrow('草稿 API Key 已变化');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('数据库来源覆盖环境来源，停用屏蔽且删除后揭示环境来源', async () => {
    const environment = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      DSA_BASE_URL: 'http://localhost:8000',
      THESIS_LEDGER_DSA_TOKEN: 'test-token',
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
      AI_PROVIDER_CONFIGS_JSON: JSON.stringify([
        {
          id: 'shared',
          baseUrl: 'https://env.example/v1',
          apiKey: 'env-key',
          models: ['env-model'],
        },
        {
          id: 'env-only',
          baseUrl: 'https://env-only.example/v1',
          apiKey: 'env-key-2',
          models: ['env-only-model'],
          timeoutMs: 8_000,
          costPer1kInput: 0.03,
          costPer1kOutput: 0.09,
          costCurrency: 'USD',
          pricingVersion: 'env-v1',
          adapter: 'openai-compatible',
          executionRoutes: [
            {
              model: 'env-only-model',
              mode: 'native_schema',
              contract: aiGenerationContracts.research.ref,
              freeEvidence: {
                source: 'controlled_local',
                sourceRef: 'environment-provider',
                sourceVersion: 'env-v1',
              },
            },
          ],
        },
      ]),
    };
    Object.entries(environment).forEach(([name, value]) => vi.stubEnv(name, value));
    try {
      const configs = createConfigStub([
        createDbRow('shared', { settings: validSettings('https://db.example/v1', ['db-model']) }),
      ]);
      const registry = new AiProviderRegistry();
      const service = new AiProviderService(
        configs.service as never,
        createHealthStub() as never,
        registry,
      );
      await service.refreshRegistry();
      expect(
        registry.list().map((provider) => ({ id: provider.id, models: provider.models })),
      ).toEqual([
        { id: 'shared', models: ['db-model'] },
        { id: 'env-only', models: ['env-only-model'] },
      ]);
      expect((await service.list()).find((provider) => provider.name === 'shared')).toMatchObject({
        source: 'database',
      });

      const shared = await configs.service.findStored('shared');
      if (!shared) throw new Error('missing shared provider');
      await service.setEnabled('shared', false, {
        expectedRevision: shared.updatedAt.toISOString(),
      });
      expect(registry.list().map((provider) => provider.id)).toEqual(['env-only']);
      const disabledShared = await configs.service.findStored('shared');
      if (!disabledShared) throw new Error('missing disabled shared provider');
      await service.remove('shared', {
        expectedRevision: disabledShared.updatedAt.toISOString(),
      });
      expect((await service.list()).find((provider) => provider.name === 'shared')).toMatchObject({
        source: 'environment',
        models: ['env-model'],
      });
      expect((await service.list()).find((provider) => provider.name === 'env-only')).toMatchObject(
        {
          timeoutMs: 8_000,
          costPer1kInput: 0.03,
          costPer1kOutput: 0.09,
          costCurrency: 'USD',
          pricingVersion: 'env-v1',
          upstreamFormat: 'chat-completions',
          chatImplementation: 'compatible',
          executionRouteConfigs: [
            expect.objectContaining({
              model: 'env-only-model',
              mode: 'native_schema',
              contract: aiGenerationContracts.research.ref,
            }),
          ],
          executionRoutes: [{ readiness: { state: 'blocked' } }],
        },
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('能力撤销由服务端绑定当前配置指纹并只阻断后续发送', async () => {
    const configuredRoute = {
      model: 'db-model',
      mode: 'native_schema' as const,
      contract: aiGenerationContracts.research.ref,
      freeEvidence: null,
    };
    const configs = createConfigStub([
      createDbRow('ready-provider', {
        health: 'healthy',
        settings: {
          ...validSettings(),
          adapter: 'openai-compatible',
          executionRoutes: [configuredRoute],
        },
      }),
    ]);
    const registry = new AiProviderRegistry();
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      registry,
    );
    await service.refreshRegistry();
    const inFlight = registry.strictReady({
      providerId: 'ready-provider',
      model: 'db-model',
      mode: 'native_schema',
      contract: aiGenerationContracts.research.ref,
      budgetAuthorized: true,
    }).execution;
    await service.revokeCapability({
      providerId: 'ready-provider',
      model: 'db-model',
      mode: 'native_schema',
      contract: aiGenerationContracts.research.ref,
      reason: 'Provider 明确拒绝必需参数',
    });
    expect(inFlight.readiness.state).toBe('ready');
    expect(() =>
      registry.strictReady({
        providerId: 'ready-provider',
        model: 'db-model',
        mode: 'native_schema',
        contract: aiGenerationContracts.research.ref,
        budgetAuthorized: true,
      }),
    ).toThrow('capability_revoked');
  });

  it('坏的数据库记录被跳过但在管理查询中标记配置错误', async () => {
    const configs = createConfigStub([
      createDbRow('broken', { settings: { baseUrl: 'not-a-url', models: [] } }),
    ]);
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      new AiProviderRegistry(),
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await expect(service.list()).resolves.toMatchObject([
      { name: 'broken', configError: '保存的 AI Provider 配置无效' },
    ]);
  });

  it('连接测试只更新健康事实，不授予结构化能力或接入就绪', async () => {
    const configs = createConfigStub([createDbRow('saved')]);
    const health = createHealthStub();
    const registry = new AiProviderRegistry();
    let call = 0;
    const sdk = {
      generate: vi.fn(async () => {
        call += 1;
        if (call > 1)
          throw new Error(`upstream failed api_key=${call === 2 ? 'draft-key' : 'db-key-saved'}`);
        return { output: { ok: true } };
      }),
    };
    const service = new AiProviderService(
      configs.service as never,
      health as never,
      registry,
      sdk as never,
    );
    try {
      await service.testDraft({
        name: 'saved',
        baseUrl: 'https://db.example/v1',
        models: ['db-model'],
        apiKey: 'draft-key',
      });
      const draftFailure = await service.testDraft({
        name: 'saved',
        baseUrl: 'https://db.example/v1',
        models: ['db-model'],
        apiKey: 'draft-key',
      });
      expect(draftFailure.message).not.toContain('draft-key');
      expect(health.record).not.toHaveBeenCalled();

      const savedFailure = await service.testSaved('saved');
      expect(savedFailure.errorCode).toBe('provider_error');
      expect(savedFailure.message).not.toContain('db-key-saved');
      expect(health.record).toHaveBeenCalledTimes(1);
      expect(configs.service.setHealth).toHaveBeenCalledWith('saved', 'degraded');
      expect(registry.readiness('saved', true)).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('保存无需认证模式时清除旧密文且不读取旧 Key', async () => {
    const configs = createConfigStub([createDbRow('saved')]);
    const health = createHealthStub();
    const service = new AiProviderService(
      configs.service as never,
      health as never,
      new AiProviderRegistry(),
    );

    const result = await service.save({
      name: 'saved',
      baseUrl: 'https://db.example/v1',
      models: ['db-model'],
      authMode: 'none',
      expectedRevision: new Date('2026-09-14T00:00:00.000Z').toISOString(),
    });

    expect(result).toMatchObject({ authMode: 'none', credentialConfigured: false });
    expect(configs.service.saveAi).toHaveBeenCalledWith(
      expect.objectContaining({ clearCredentials: true }),
    );
    expect(configs.service.readCredential).not.toHaveBeenCalled();
  });

  it('通用 Provider 保存端点拒绝 AI 类型', async () => {
    const upsert = vi.fn();
    const service = new ProviderConfigService({ providerConfig: { upsert } } as never, {} as never);
    await expect(
      service.save({ name: 'ai', type: 'ai', priority: 1, capabilities: ['chat'] }),
    ).rejects.toThrow('必须使用 /ai/providers 专用接口');
    expect(upsert).not.toHaveBeenCalled();
  });
});
