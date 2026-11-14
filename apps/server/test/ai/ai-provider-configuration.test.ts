import { successfulSdk } from './ai-provider-management.fixtures.js';
import { describe, expect, it, vi } from 'vitest';
import { AiProviderService } from '../../src/ai/ai-provider.service.js';
import { DEFAULT_SLOW_AFTER_MS } from '../../src/providers/provider-health.service.js';
import { AI_GENERATION_SLOW_AFTER_MS } from '../../src/ai/ai-provider.service.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { ProviderConfigService } from '../../src/providers/provider-config.service.js';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import {
  createConfigStub,
  createHealthStub,
  createDbRow,
  validSettings,
} from './ai-provider-management.fixtures.js';

describe('Provider 模型目录及草稿令牌', () => {
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
});

describe('Provider 持久化、热更新与坏配置', () => {
  it('只加载数据库，停用和删除后不会恢复同名环境来源', async () => {
    vi.stubEnv(
      'AI_PROVIDER_CONFIGS_JSON',
      JSON.stringify([
        {
          id: 'shared',
          baseUrl: 'https://env.example/v1',
          apiKey: 'env-key',
          models: ['env-model'],
        },
        {
          id: 'env-only',
          baseUrl: 'https://env.example/v1',
          apiKey: 'env-key',
          models: ['env-only'],
        },
      ]),
    );
    vi.stubEnv('AI_PROVIDER_ID', 'legacy');
    vi.stubEnv('AI_BASE_URL', 'https://legacy.example/v1');
    vi.stubEnv('AI_API_KEY', 'legacy-key');
    vi.stubEnv('AI_MODEL', 'legacy-model');
    vi.stubEnv('AI_FIXTURE_ENABLED', 'true');
    try {
      const configs = createConfigStub([createDbRow('shared')]);
      const registry = new AiProviderRegistry();
      const service = new AiProviderService(
        configs.service as never,
        createHealthStub() as never,
        registry,
      );
      await service.onModuleInit();
      expect(registry.list().map(({ id, models }) => ({ id, models }))).toEqual([
        { id: 'shared', models: ['db-model'] },
      ]);
      expect(await service.list()).toEqual([
        expect.objectContaining({ name: 'shared', source: 'database' }),
      ]);
      await expect(service.setEnabled('env-only', false)).rejects.toThrow('配置不存在');
      await expect(service.remove('env-only')).rejects.toThrow('配置不存在');

      const shared = await configs.service.findStored('shared');
      await service.setEnabled('shared', false, {
        expectedRevision: shared!.updatedAt.toISOString(),
      });
      expect(registry.list()).toEqual([]);
      expect(await service.list()).toEqual([
        expect.objectContaining({ name: 'shared', enabled: false, source: 'database' }),
      ]);
      const disabled = await configs.service.findStored('shared');
      await service.remove('shared', { expectedRevision: disabled!.updatedAt.toISOString() });
      expect(await service.list()).toEqual([]);
      expect(registry.list()).toEqual([]);

      const restarted = new AiProviderService(
        configs.service as never,
        createHealthStub() as never,
        new AiProviderRegistry(),
      );
      expect(await restarted.refreshRegistry()).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('空数据库可启动；查询失败明确报错并保留上一份完整 Registry', async () => {
    const configs = createConfigStub();
    const registry = new AiProviderRegistry();
    const service = new AiProviderService(
      configs.service as never,
      createHealthStub() as never,
      registry,
    );
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(await service.list()).toEqual([]);
    expect(registry.list()).toEqual([]);
    configs.replace([createDbRow('stored')]);
    await service.refreshRegistry();
    const snapshot = registry.list();
    configs.service.listStored.mockRejectedValue(new Error('database unavailable'));
    await expect(service.list()).rejects.toThrow('database unavailable');
    await expect(service.refreshRegistry()).rejects.toThrow('database unavailable');
    await expect(service.onModuleInit()).rejects.toThrow('database unavailable');
    expect(registry.list()).toEqual(snapshot);
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
});

describe('Provider 健康归属及凭据保存', () => {
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

  it('AI 链路按授权预算判慢，不沿用 3 秒的轻量连接测试阈值', async () => {
    const configs = createConfigStub([createDbRow('saved')]);
    const health = createHealthStub();
    const service = new AiProviderService(
      configs.service as never,
      health as never,
      new AiProviderRegistry(),
      successfulSdk() as never,
    );
    try {
      const result = await service.testSaved('saved');
      expect(result.status).toBe('healthy');
      expect(AI_GENERATION_SLOW_AFTER_MS).toBeGreaterThan(DEFAULT_SLOW_AFTER_MS);
      expect(health.record).toHaveBeenCalledWith(
        'saved',
        true,
        expect.any(Number),
        undefined,
        expect.any(Date),
        'manual',
        expect.anything(),
        AI_GENERATION_SLOW_AFTER_MS,
      );
      expect(configs.service.setHealth).toHaveBeenCalledWith('saved', 'healthy');
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
      undefined,
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
