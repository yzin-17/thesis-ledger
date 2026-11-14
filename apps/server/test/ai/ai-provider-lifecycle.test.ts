import { key, successfulSdk } from './ai-provider-management.fixtures.js';
import { describe, expect, it, vi } from 'vitest';
import {
  encryptProviderCredential,
  decryptProviderCredential,
} from '../../src/platform/credential-security.js';
import { AiProviderService } from '../../src/ai/ai-provider.service.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import {
  createConfigStub,
  createHealthStub,
  createRoutingTransactionFixture,
  createDbRow,
  type TestRow,
  type SaveInput,
} from './ai-provider-management.fixtures.js';

describe('Provider 版本和默认引用', () => {
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
    const { transaction, prisma } = createRoutingTransactionFixture(row, settings);
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
});

describe('Provider 草稿、Registry 与连接探针', () => {
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

});

describe('Provider 连接探针与配置类型', () => {
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
      undefined,
    );
  });
});
