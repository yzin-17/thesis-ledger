import { describe, expect, it } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import {
  configurationFingerprint,
  evaluateAiProviderReadiness,
  type AiProviderRouteSnapshot,
} from '../../src/ai/ai-provider-readiness.js';
import {
  routeSnapshotsFromProviderRow,
  settingsFromAiProviderInput,
} from '../../src/ai/ai-provider-readiness.persistence.js';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';
import {
  AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
  resolveAiSdkProviderImplementation,
} from '../../src/ai/ai-provider-upstream.js';

const route = {
  model: 'model-a',
  mode: 'json_validated' as const,
  contract: aiGenerationContracts.research.ref,
  freeEvidence: {
    source: 'controlled_local' as const,
    sourceRef: 'fixture',
    sourceVersion: 'v1',
  },
};

const snapshot = (overrides: Partial<AiProviderRouteSnapshot> = {}): AiProviderRouteSnapshot => ({
  providerId: 'provider-a',
  baseUrl: 'https://same.example/v1',
  upstreamFormat: 'chat-completions',
  chatImplementation: 'compatible',
  adapter: 'openai-compatible-chat',
  models: ['model-a'],
  route,
  enabled: true,
  health: 'healthy',
  credentialFingerprint: 'credential-v1',
  revocations: [],
  ...overrides,
});

describe('AI Provider 上游格式路由', () => {
  it('四条执行分支只由显式字段决定', () => {
    expect(
      resolveAiSdkProviderImplementation({
        upstreamFormat: 'chat-completions',
        chatImplementation: 'compatible',
      }),
    ).toBe('openai-compatible-chat');
    expect(
      resolveAiSdkProviderImplementation({
        upstreamFormat: 'chat-completions',
        chatImplementation: 'openai-native',
      }),
    ).toBe('openai-chat');
    expect(resolveAiSdkProviderImplementation({ upstreamFormat: 'responses' })).toBe(
      'openai-responses',
    );
    expect(resolveAiSdkProviderImplementation({ upstreamFormat: 'anthropic-messages' })).toBe(
      'anthropic-messages',
    );
  });

  it('管理输入拒绝内部 adapter 和只读扩展标记', () => {
    const base = {
      name: 'provider-a',
      baseUrl: 'https://provider.example/v1',
      models: ['model-a'],
    };
    expect(aiProviderInputSchema.parse(base)).toMatchObject({
      upstreamFormat: 'chat-completions',
    });
    expect(aiProviderInputSchema.safeParse({ ...base, adapter: 'openrouter' }).success).toBe(false);
    expect(
      aiProviderInputSchema.safeParse({ ...base, pricingVersion: 'client-controlled' }).success,
    ).toBe(false);
    expect(
      aiProviderInputSchema.safeParse({
        ...base,
        compatibilityExtensionProfile: 'openrouter-v1',
      }).success,
    ).toBe(false);
    expect(aiProviderInputSchema.safeParse({ ...base, upstreamFormat: 'responses' }).success).toBe(
      true,
    );
    expect(
      aiProviderInputSchema.safeParse({ ...base, upstreamFormat: 'anthropic-messages' }).success,
    ).toBe(true);
    expect(
      aiProviderInputSchema.safeParse({ ...base, upstreamFormat: 'unknown-format' }).success,
    ).toBe(false);
    expect(
      aiProviderInputSchema.safeParse({
        ...base,
        upstreamFormat: 'responses',
        chatImplementation: 'compatible',
      }).success,
    ).toBe(false);

    expect(aiProviderInputSchema.parse({ ...base, authMode: 'none' })).toMatchObject({
      authMode: 'none',
    });
    expect(
      aiProviderInputSchema.safeParse({ ...base, authMode: 'none', apiKey: 'must-reject' }).success,
    ).toBe(false);
  });

  it('旧 adapter 只在读取边界迁移，OpenRouter 扩展标记跨无关编辑保留', () => {
    const legacyRoute = {
      ...route,
      allowedUpstreams: ['legacy-provider'],
      capabilityDeclaration: {
        source: 'manual',
        sourceRef: 'provider-settings',
        declaredAt: '2026-09-20T00:00:00.000Z',
        declaredBy: 'operator',
        sourceVersion: 'v1',
      },
    };
    const oldOpenRouter = {
      baseUrl: 'https://openrouter.ai/api/v1',
      models: ['model-a'],
      adapter: 'openrouter',
      executionRoutes: [legacyRoute],
    };
    const migrated = parseAiProviderSettings(oldOpenRouter);
    expect(migrated).toMatchObject({
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
      adapter: 'openai-compatible-chat',
      compatibilityExtensionProfile: AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
    });
    expect(migrated?.executionRoutes?.[0]).not.toHaveProperty('capabilityDeclaration');
    expect(migrated?.executionRoutes?.[0]).not.toHaveProperty('allowedUpstreams');
    expect(migrated?.executionRoutes?.[0]).not.toHaveProperty('freeEvidence');

    const input = aiProviderInputSchema.parse({
      name: 'provider-a',
      baseUrl: 'https://renamed-endpoint.example/v1',
      models: ['model-a'],
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
    });
    const saved = settingsFromAiProviderInput(input, oldOpenRouter);
    expect(saved).not.toHaveProperty('adapter');
    expect(saved.executionRoutes?.[0]).not.toHaveProperty('allowedUpstreams');
    expect(saved.executionRoutes?.[0]).not.toHaveProperty('freeEvidence');
    expect(saved).toMatchObject({
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
      compatibilityExtensionProfile: AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
    });
  });

  it('按模型保存费用，并将执行快照绑定到目标模型的价格', () => {
    const input = aiProviderInputSchema.parse({
      name: 'provider-a',
      baseUrl: 'https://provider.example/v1',
      models: ['model-a', 'model-b'],
      modelPricing: {
        'model-a': { costPer1kInput: 0, costPer1kOutput: 0.2, costCurrency: 'USD' },
        'model-b': { costPer1kInput: 0.4, costPer1kOutput: 0.8, costCurrency: 'CNY' },
      },
      executionRoutes: [
        { model: 'model-a', mode: 'json_validated', contract: aiGenerationContracts.research.ref },
        {
          model: 'model-b',
          mode: 'native_schema',
          contract: aiGenerationContracts.parameterOptimization.ref,
        },
      ],
    });
    const saved = settingsFromAiProviderInput(input);

    expect(saved).not.toHaveProperty('costPer1kInput');
    expect(saved.modelPricing).toMatchObject({
      'model-a': {
        costPer1kInput: 0,
        costPer1kOutput: 0.2,
        costCurrency: 'USD',
        source: 'user',
      },
      'model-b': {
        costPer1kInput: 0.4,
        costPer1kOutput: 0.8,
        costCurrency: 'CNY',
        source: 'user',
      },
    });

    const row = {
      name: 'provider-a',
      enabled: true,
      encryptedCredentials: null,
    } as unknown as Parameters<typeof routeSnapshotsFromProviderRow>[0];
    const snapshots = routeSnapshotsFromProviderRow(row, parseAiProviderSettings(saved), 'healthy');
    expect(snapshots.map((snapshot) => [snapshot.route.model, snapshot.costPer1kInput])).toEqual([
      ['model-a', 0],
      ['model-b', 0.4],
    ]);
  });

  it('旧 Provider 级费用迁移到已有模型，新模型保持未知', () => {
    const legacyInput = aiProviderInputSchema.parse({
      name: 'provider-a',
      baseUrl: 'https://provider.example/v1',
      models: ['model-a', 'model-b'],
      costPer1kInput: 0.1,
      costPer1kOutput: 0.2,
      costCurrency: 'USD',
    });
    const migrated = settingsFromAiProviderInput(legacyInput);
    expect(migrated.modelPricing).toMatchObject({
      'model-a': { source: 'legacy_provider', costPer1kInput: 0.1 },
      'model-b': { source: 'legacy_provider', costPer1kInput: 0.1 },
    });

    const explicitModelInput = aiProviderInputSchema.parse({
      name: 'provider-a',
      baseUrl: 'https://provider.example/v1',
      models: ['model-a', 'model-b', 'model-c'],
      modelPricing: {
        'model-a': { costPer1kInput: 0.3, costPer1kOutput: 0.4, costCurrency: 'USD' },
      },
    });
    const updated = settingsFromAiProviderInput(explicitModelInput, migrated);
    expect(updated.modelPricing).toHaveProperty('model-a');
    expect(updated.modelPricing).not.toHaveProperty('model-b');
    expect(updated.modelPricing).not.toHaveProperty('model-c');
  });

  it('同一模型同一业务用途不能通过不同输出模式重复配置', () => {
    const result = aiProviderInputSchema.safeParse({
      name: 'provider-a',
      baseUrl: 'https://provider.example/v1',
      models: ['model-a'],
      executionRoutes: [
        { model: 'model-a', mode: 'json_validated', contract: aiGenerationContracts.research.ref },
        { model: 'model-a', mode: 'native_schema', contract: aiGenerationContracts.research.ref },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: '同一模型、同一业务用途只能配置一条执行路由' }),
      ]),
    );
  });

  it('配置指纹同时绑定地址与显式实现，地址不改写实现', () => {
    const compatible = configurationFingerprint(snapshot());
    const native = configurationFingerprint(
      snapshot({ chatImplementation: 'openai-native', adapter: 'openai-chat' }),
    );
    const moved = configurationFingerprint(snapshot({ baseUrl: 'https://other.example/v1' }));
    expect(native).not.toBe(compatible);
    expect(moved).not.toBe(compatible);
    expect(
      configurationFingerprint(
        snapshot({
          costPer1kInput: 0.1,
          costPer1kOutput: 0.2,
          costCurrency: 'USD',
          pricingVersion: 'pricing-v2',
        }),
      ),
    ).toBe(compatible);
    expect(
      resolveAiSdkProviderImplementation({
        upstreamFormat: snapshot().upstreamFormat,
        chatImplementation: 'compatible',
      }),
    ).toBe('openai-compatible-chat');
  });

  it('T12.2 接通后的显式分支具备独立发布证据', () => {
    const result = evaluateAiProviderReadiness(
      snapshot({
        upstreamFormat: 'responses',
        chatImplementation: undefined,
        adapter: 'openai-responses',
      } as unknown as Partial<AiProviderRouteSnapshot>),
      { budgetAuthorized: true },
    );
    expect(result.readiness.state).toBe('ready');
    expect(result.adapterEvidence).toMatchObject({
      adapter: 'openai-responses',
      adapterVersion: '4.0.71',
    });
  });
});
