import { describe, expect, it } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import {
  configurationFingerprint,
  evaluateAiProviderReadiness,
  type AiProviderRouteSnapshot,
} from '../../src/ai/ai-provider-readiness.js';
import { settingsFromAiProviderInput } from '../../src/ai/ai-provider-readiness.persistence.js';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';
import {
  AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
  resolveAiSdkProviderImplementation,
} from '../../src/ai/ai-provider-upstream.js';

const route = {
  model: 'model-a',
  mode: 'json_validated' as const,
  contract: aiGenerationContracts.research.ref,
  capabilityDeclaration: {
    source: 'manual' as const,
    sourceRef: 'provider-settings',
    declaredAt: '2026-09-20T00:00:00.000Z',
    declaredBy: 'operator',
    sourceVersion: 'v1',
  },
  allowedUpstreams: ['provider-a'],
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
  });

  it('旧 adapter 只在读取边界迁移，OpenRouter 扩展标记跨无关编辑保留', () => {
    const oldOpenRouter = {
      baseUrl: 'https://openrouter.ai/api/v1',
      models: ['model-a'],
      adapter: 'openrouter',
      executionRoutes: [route],
    };
    const migrated = parseAiProviderSettings(oldOpenRouter);
    expect(migrated).toMatchObject({
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
      adapter: 'openai-compatible-chat',
      compatibilityExtensionProfile: AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
    });

    const input = aiProviderInputSchema.parse({
      name: 'provider-a',
      baseUrl: 'https://renamed-endpoint.example/v1',
      models: ['model-a'],
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
    });
    const saved = settingsFromAiProviderInput(input, oldOpenRouter);
    expect(saved).not.toHaveProperty('adapter');
    expect(saved).toMatchObject({
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
      compatibilityExtensionProfile: AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
    });
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
        route: { ...route, allowedUpstreams: [] },
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
