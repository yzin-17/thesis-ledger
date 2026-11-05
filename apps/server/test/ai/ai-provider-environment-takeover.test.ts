import { describe, expect, it, vi } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { AiProviderService } from '../../src/ai/ai-provider.service.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { ProviderConfigService } from '../../src/providers/provider-config.service.js';

const providerId = 'environment-takeover-test';
const model = 'environment-model';
const environmentCredential = 'test-only-environment-credential';
const takeoverCredential = 'test-only-takeover-credential';
const route = {
  model,
  contract: aiGenerationContracts.research.ref,
  mode: 'native_schema' as const,
};

type StoredProvider = {
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  settings: unknown;
  encryptedCredentials?: Uint8Array | null;
  health: string;
  updatedAt: Date;
};

const createIsolatedProviderPrisma = () => {
  const rows: StoredProvider[] = [];
  let revision = Date.parse('2026-10-18T00:00:00.000Z');
  const nextRevision = () => new Date((revision += 1_000));
  const providerConfig = {
    findUnique: vi.fn(
      async ({ where }: { where: { name: string } }) =>
        rows.find((row) => row.name === where.name) ?? null,
    ),
    findMany: vi.fn(async (args?: { where?: { type?: string } }) =>
      rows
        .filter((row) => !args?.where?.type || row.type === args.where.type)
        .sort(
          (left, right) => left.priority - right.priority || left.name.localeCompare(right.name),
        ),
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        ...data,
        health: 'unknown',
        updatedAt: nextRevision(),
      } as unknown as StoredProvider;
      rows.push(row);
      return row;
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { name: string; updatedAt?: Date };
        data: Record<string, unknown>;
      }) => {
        const row = rows.find((candidate) => candidate.name === where.name);
        if (!row || (where.updatedAt && row.updatedAt.getTime() !== where.updatedAt.getTime()))
          return { count: 0 };
        Object.assign(row, data, { updatedAt: nextRevision() });
        return { count: 1 };
      },
    ),
  };
  return { prisma: { providerConfig }, providerConfig, rows };
};

const environmentProvider = {
  id: providerId,
  baseUrl: 'https://environment.example/v1',
  apiKey: environmentCredential,
  models: [model],
  timeoutMs: 18_000,
  costPer1kInput: 0.12,
  costPer1kOutput: 0.24,
  costCurrency: 'USD',
  upstreamFormat: 'chat-completions',
  chatImplementation: 'compatible',
  executionRoutes: [route],
};

const modelPricing = {
  [model]: { costPer1kInput: 0.12, costPer1kOutput: 0.24, costCurrency: 'USD' },
};

const takeoverInput = {
  name: providerId,
  baseUrl: environmentProvider.baseUrl,
  models: [model],
  authMode: 'api_key' as const,
  upstreamFormat: 'chat-completions' as const,
  chatImplementation: 'compatible' as const,
  executionRoutes: [route],
  apiKey: takeoverCredential,
  enabled: true,
  priority: 100,
  capabilities: ['chat'],
  timeoutMs: environmentProvider.timeoutMs,
  costPer1kInput: environmentProvider.costPer1kInput,
  costPer1kOutput: environmentProvider.costPer1kOutput,
  costCurrency: environmentProvider.costCurrency,
  modelPricing,
};

const stubIsolatedEnvironment = () => {
  const environment = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://isolated:test@127.0.0.1:5432/unused',
    REDIS_URL: 'redis://127.0.0.1:6379',
    DSA_BASE_URL: 'http://127.0.0.1:8000',
    THESIS_LEDGER_DSA_TOKEN: 'test-only-token',
    CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
    AI_PROVIDER_CONFIGS_JSON: JSON.stringify([environmentProvider]),
  };
  Object.entries(environment).forEach(([name, value]) => vi.stubEnv(name, value));
};

const createHarness = () => {
  const isolated = createIsolatedProviderPrisma();
  const health = {
    get: vi.fn(async () => null),
    record: vi.fn(),
    recordHistory: vi.fn(),
  };
  const configs = new ProviderConfigService(isolated.prisma as never, health as never);
  const sdk = {
    generate: vi.fn(async () => {
      throw new Error('不应调用模型生成');
    }),
  };
  let researchDefault: { providerId: string; model: string } | null = {
    providerId,
    model,
  };
  const routingSettings = {
    read: vi.fn(async () => ({ researchDefault, revision: 7 })),
    update: vi.fn(),
  };
  const service = new AiProviderService(
    configs,
    health as never,
    new AiProviderRegistry(),
    sdk as never,
    routingSettings as never,
  );
  return {
    ...isolated,
    configs,
    health,
    routingSettings,
    sdk,
    service,
    clearResearchDefault() {
      researchDefault = null;
    },
  };
};

describe('AI Provider 页面配置与数据库持久化', () => {
  it('忽略环境配置，通过真实保存服务新增并保留默认、凭证和版本边界', async () => {
    stubIsolatedEnvironment();
    const fetchStub = vi.fn(async () => {
      throw new Error('保存验收不得发起网络请求');
    });
    vi.stubGlobal('fetch', fetchStub);
    const harness = createHarness();
    try {
      await harness.service.onModuleInit();
      expect(await harness.service.list()).toEqual([]);

      await expect(harness.service.save({ ...takeoverInput, enabled: false })).rejects.toThrow(
        '保存会停用研究默认 Provider',
      );
      expect(harness.rows).toHaveLength(0);

      const saved = await harness.service.save(takeoverInput);
      expect(saved).toMatchObject({
        source: 'database',
        enabled: true,
        baseUrl: environmentProvider.baseUrl,
        models: [model],
        timeoutMs: environmentProvider.timeoutMs,
        modelPricing: {
          [model]: expect.objectContaining({
            costPer1kInput: environmentProvider.costPer1kInput,
            costPer1kOutput: environmentProvider.costPer1kOutput,
            costCurrency: environmentProvider.costCurrency,
          }),
        },
        credentialConfigured: true,
        executionRouteConfigs: [expect.objectContaining({ model, contract: route.contract })],
      });
      expect(harness.routingSettings.update).not.toHaveBeenCalled();
      expect(JSON.stringify(saved)).not.toContain(takeoverCredential);
      expect(JSON.stringify(saved)).not.toContain(environmentCredential);

      const stored = await harness.configs.findStored(providerId);
      if (!stored?.encryptedCredentials) throw new Error('缺少隔离存储凭证');
      expect(
        Buffer.from(stored.encryptedCredentials).includes(Buffer.from(takeoverCredential)),
      ).toBe(false);
      expect(await harness.configs.readCredential(stored)).toBe(takeoverCredential);

      const disableRevision = stored.updatedAt.toISOString();
      await expect(
        harness.service.setEnabled(providerId, false, { expectedRevision: disableRevision }),
      ).rejects.toThrow('该 Provider 是研究默认模型');
      await expect(
        harness.service.save({
          ...takeoverInput,
          executionRoutes: [],
          expectedRevision: disableRevision,
        }),
      ).rejects.toThrow('保存会移除研究默认用途');
      expect((await harness.configs.findStored(providerId))?.updatedAt.toISOString()).toBe(
        disableRevision,
      );

      harness.clearResearchDefault();
      const current = await harness.configs.findStored(providerId);
      if (!current) throw new Error('缺少刚保存的 Provider');
      await harness.service.setEnabled(providerId, false, {
        expectedRevision: current.updatedAt.toISOString(),
      });
      const disabledRow = await harness.configs.findStored(providerId);
      if (!disabledRow) throw new Error('停用后的 Provider 不存在');

      const { apiKey: _apiKey, enabled: _enabled, ...draftWithoutOverrides } = takeoverInput;
      void _apiKey;
      void _enabled;
      const disabledSave = await harness.service.save({
        ...draftWithoutOverrides,
        expectedRevision: disabledRow.updatedAt.toISOString(),
      });
      expect(disabledSave).toMatchObject({ source: 'database', enabled: false });
      expect(
        (await harness.service.list()).filter((provider) => provider.name === providerId),
      ).toHaveLength(1);
      expect(
        await harness.configs.readCredential((await harness.configs.findStored(providerId))!),
      ).toBe(takeoverCredential);

      const staleRevision = disabledSave.updatedAt!;
      const latest = await harness.configs.findStored(providerId);
      if (!latest) throw new Error('缺少已停用的 Provider');
      latest.updatedAt = new Date(Date.parse(staleRevision) + 1_000);
      const writesBeforeStaleSave = harness.providerConfig.updateMany.mock.calls.length;
      await expect(
        harness.service.save({
          ...draftWithoutOverrides,
          expectedRevision: staleRevision,
        }),
      ).rejects.toThrow('Provider 配置已变化');
      expect(harness.providerConfig.updateMany).toHaveBeenCalledTimes(writesBeforeStaleSave);
      expect(harness.sdk.generate).not.toHaveBeenCalled();
      expect(fetchStub).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('新建时必须显式提供凭证，环境凭证不会被复用', async () => {
    stubIsolatedEnvironment();
    const fetchStub = vi.fn(async () => {
      throw new Error('保存验收不得发起网络请求');
    });
    vi.stubGlobal('fetch', fetchStub);
    const harness = createHarness();
    try {
      const { apiKey: _apiKey, ...withoutCredential } = takeoverInput;
      void _apiKey;
      await expect(harness.service.save(withoutCredential)).rejects.toThrow(
        '请填写 API Key',
      );
      expect(harness.rows).toHaveLength(0);
      expect(await harness.service.list()).toEqual([]);
      expect(harness.providerConfig.create).not.toHaveBeenCalled();
      expect(harness.sdk.generate).not.toHaveBeenCalled();
      expect(fetchStub).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
