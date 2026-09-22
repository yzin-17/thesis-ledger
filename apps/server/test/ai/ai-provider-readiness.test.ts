import {
  aiGenerationContracts,
  type AiAdapter,
  type AiGenerationContractRef,
  type AiGenerationMode,
} from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aiProviderInputSchema,
  type AiProviderExecutionRouteInput,
} from '../../src/ai/ai-provider.contracts.js';
import {
  configurationFingerprint,
  evaluateAiProviderReadiness,
  resolveAiRouteTimeouts,
  type AiProviderRouteSnapshot,
} from '../../src/ai/ai-provider-readiness.js';
import { resolveAiSdkProviderImplementation } from '../../src/ai/ai-provider-upstream.js';
import type { AiProvider } from '../../src/ai/contracts.js';
import { AiProviderRegistry, routeSnapshotsFromProvider } from '../../src/ai/provider-registry.js';
import { AiProviderController } from '../../src/ai/ai-provider.controller.js';

const revokedAt = '2026-09-19T00:00:00.000Z';

const route = (
  overrides: Partial<AiProviderExecutionRouteInput> = {},
): AiProviderExecutionRouteInput => ({
  model: 'model-a',
  mode: 'native_schema',
  contract: aiGenerationContracts.research.ref,
  ...overrides,
});

const snapshot = (overrides: Partial<AiProviderRouteSnapshot> = {}): AiProviderRouteSnapshot => ({
  providerId: 'provider-a',
  baseUrl: 'https://proxy.example.test/v1',
  upstreamFormat: 'chat-completions',
  chatImplementation: 'compatible',
  adapter: 'openai-compatible-chat',
  models: ['model-a', 'model-b'],
  route: route(),
  enabled: true,
  health: 'healthy',
  credentialFingerprint: 'credential-v1',
  revocations: [],
  ...overrides,
});

const provider = (
  input: {
    baseUrl?: string;
    adapter?: AiAdapter;
    routes?: AiProviderExecutionRouteInput[];
    health?: 'unknown' | 'healthy' | 'degraded' | 'down';
    revocations?: AiProviderRouteSnapshot['revocations'];
  } = {},
): AiProvider => ({
  id: 'provider-a',
  models: ['model-a', 'model-b'],
  metadata: {
    baseURL: input.baseUrl ?? 'https://proxy.example.test/v1',
    upstreamFormat: 'chat-completions',
    chatImplementation: 'compatible',
    adapter: input.adapter ?? 'openai-compatible-chat',
    executionRoutes: input.routes ?? [route()],
    capabilityRevocations: input.revocations ?? [],
    credentialFingerprint: 'credential-v1',
    health: input.health ?? 'healthy',
  },
  complete: vi.fn(),
});

describe('AI Provider 接入就绪门禁', () => {
  it('超时按用途覆盖、Provider 默认、系统默认的顺序解析', () => {
    expect(
      resolveAiRouteTimeouts(
        snapshot({ firstOutputTimeoutMs: 20_000, outputIdleTimeoutMs: 25_000 }),
      ),
    ).toEqual({
      firstOutputTimeoutMs: 20_000,
      outputIdleTimeoutMs: 25_000,
      firstOutputTimeoutSource: 'provider',
      outputIdleTimeoutSource: 'provider',
    });
    expect(
      resolveAiRouteTimeouts(
        snapshot({
          firstOutputTimeoutMs: 20_000,
          outputIdleTimeoutMs: 25_000,
          route: route({ firstOutputTimeoutMs: 5_000 }),
        }),
      ),
    ).toMatchObject({
      firstOutputTimeoutMs: 5_000,
      firstOutputTimeoutSource: 'route',
      outputIdleTimeoutMs: 25_000,
      outputIdleTimeoutSource: 'provider',
    });
    expect(resolveAiRouteTimeouts(snapshot())).toMatchObject({
      firstOutputTimeoutMs: 30_000,
      outputIdleTimeoutMs: 30_000,
      firstOutputTimeoutSource: 'system',
      outputIdleTimeoutSource: 'system',
    });
  });

  it('拒绝客户端伪造 ready 与本地 adapter 证据', () => {
    const parsed = aiProviderInputSchema.safeParse({
      name: 'provider-a',
      baseUrl: 'https://proxy.example.test/v1',
      models: ['model-a'],
      adapter: 'openai-compatible-chat',
      executionRoutes: [route()],
      ready: true,
      adapterEvidence: { releaseFingerprint: 'forged' },
    });
    expect(parsed.success).toBe(false);
  });

  it('模型默认输出方式与用途显式覆盖可分别提交，默认不能指向未选择模型', () => {
    const input = {
      name: 'provider-a',
      baseUrl: 'https://proxy.example.test/v1',
      models: ['model-a'],
      modelDefaults: { 'model-a': { mode: 'json_validated' } },
      executionRoutes: [route({ modeOverridden: true })],
    };

    expect(aiProviderInputSchema.parse(input)).toMatchObject({
      modelDefaults: { 'model-a': { mode: 'json_validated' } },
      executionRoutes: [{ modeOverridden: true }],
    });
    expect(
      aiProviderInputSchema.safeParse({
        ...input,
        modelDefaults: { 'missing-model': { mode: 'json_validated' } },
      }).success,
    ).toBe(false);
  });

  it('用途路由兼容历史启用记录，并接受停用后保留的配置', () => {
    const legacy = aiProviderInputSchema.parse({
      name: 'provider-a',
      baseUrl: 'https://proxy.example.test/v1',
      models: ['model-a'],
      executionRoutes: [route()],
    });
    const disabled = aiProviderInputSchema.parse({
      name: 'provider-a',
      baseUrl: 'https://proxy.example.test/v1',
      models: ['model-a'],
      executionRoutes: [route({ enabled: false })],
    });

    expect(legacy.executionRoutes?.[0]?.enabled).toBeUndefined();
    expect(disabled.executionRoutes?.[0]).toMatchObject({ enabled: false, mode: 'native_schema' });
  });

  it('执行候选快照排除停用用途，但保留历史记录的兼容启用语义', () => {
    const snapshots = routeSnapshotsFromProvider(
      provider({
        routes: [
          route(),
          route({ contract: aiGenerationContracts.parameterOptimization.ref, enabled: false }),
        ],
      }),
    );

    expect(snapshots.map((snapshot) => snapshot.route.contract.id)).toEqual(['research']);
  });

  it('管理 API 只读取服务端计算的就绪结果', () => {
    const readiness = vi.fn(() => [{ model: 'model-a' }]);
    const controller = new AiProviderController({ readiness } as never);
    expect(controller.readiness('provider-a')).toEqual([{ model: 'model-a' }]);
    expect(readiness).toHaveBeenCalledWith('provider-a');
  });

  it('由服务端发布证据、配置指纹和预算授权共同计算 ready', () => {
    const result = evaluateAiProviderReadiness(snapshot(), { budgetAuthorized: true });
    expect(result).toMatchObject({
      adapter: 'openai-compatible-chat',
      adapterEvidence: {
        sdkVersion: '7.0.107',
        adapterVersion: '3.0.53',
        mode: 'native_schema',
      },
      readiness: { state: 'ready', reasons: [] },
      liveValidation: { status: 'not_run' },
    });
  });

  it('受控发布证据与 Server 精确依赖版本保持一致', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string> };
    const evidence = evaluateAiProviderReadiness(snapshot(), {
      budgetAuthorized: true,
    }).adapterEvidence;
    expect(packageJson.dependencies.ai).toBe(evidence?.sdkVersion);
    expect(packageJson.dependencies['@ai-sdk/openai-compatible']).toBe(evidence?.adapterVersion);

    const openai = evaluateAiProviderReadiness(snapshot({ adapter: 'openai-responses' }), {
      budgetAuthorized: true,
    }).adapterEvidence;
    expect(packageJson.dependencies['@ai-sdk/openai']).toBe(openai?.adapterVersion);

    const anthropic = evaluateAiProviderReadiness(snapshot({ adapter: 'anthropic-messages' }), {
      budgetAuthorized: true,
    }).adapterEvidence;
    expect(packageJson.dependencies['@ai-sdk/anthropic']).toBe(anthropic?.adapterVersion);
    expect(packageJson.dependencies).not.toHaveProperty('@openrouter/ai-sdk-provider');
  });

  it('用户填写的零费率可以授权零费用路由，其他费用仍需预算授权', () => {
    const missingPricing = evaluateAiProviderReadiness(snapshot(), {
      budgetAuthorized: false,
    });
    expect(missingPricing.readiness.reasons).toContain('budget_not_authorized');

    const userConfiguredZeroCost = evaluateAiProviderReadiness(
      snapshot({
        costPer1kInput: 0,
        costPer1kOutput: 0,
        costCurrency: 'USD',
      }),
      { budgetAuthorized: false },
    );
    expect(userConfiguredZeroCost.readiness.state).toBe('ready');
    expect(userConfiguredZeroCost).not.toHaveProperty('freeEvidenceRef');

    const incompletePricing = evaluateAiProviderReadiness(
      snapshot({ costPer1kInput: 0, costCurrency: 'USD' }),
      { budgetAuthorized: false },
    );
    expect(incompletePricing.readiness.reasons).toContain('budget_not_authorized');
  });

  it('只按显式上游格式和 Chat 实现选择 Provider，base URL 不参与选择', () => {
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
    const blocked = evaluateAiProviderReadiness(snapshot({ adapter: null }), {
      budgetAuthorized: true,
    });
    expect(blocked.readiness.reasons).toContain('configuration_invalid');
  });

  it('health=down 只阻断对应 Provider，混合模型各自保留原因', () => {
    const registry = new AiProviderRegistry();
    registry.replace([
      provider({
        routes: [route(), route({ model: 'model-b' })],
      }),
    ]);
    const mixed = registry.readiness('provider-a', true);
    expect(mixed).toHaveLength(2);
    expect(mixed.find((entry) => entry.model === 'model-a')?.readiness.state).toBe('ready');
    expect(mixed.find((entry) => entry.model === 'model-b')?.readiness.state).toBe('ready');

    registry.replace([provider({ health: 'down' })]);
    expect(registry.readiness('provider-a', true)[0]?.readiness.reasons).toContain('provider_down');
  });

  it('配置热更新不改写已返回快照，旧指纹撤销不污染新配置', () => {
    const registry = new AiProviderRegistry();
    registry.replace([provider()]);
    const first = registry.strictReady({
      providerId: 'provider-a',
      model: 'model-a',
      mode: 'native_schema',
      contract: aiGenerationContracts.research.ref,
      budgetAuthorized: true,
    }).execution;
    const oldSnapshot = snapshot();
    const oldRevocation = {
      model: 'model-a',
      mode: 'native_schema' as const,
      contract: aiGenerationContracts.research.ref,
      configurationFingerprint: configurationFingerprint(oldSnapshot),
      reason: 'upstream rejected json_schema',
      revokedAt,
    };
    registry.replace([
      provider({
        baseUrl: 'https://new-proxy.example.test/v1',
        revocations: [oldRevocation],
      }),
    ]);
    const second = registry.strictReady({
      providerId: 'provider-a',
      model: 'model-a',
      mode: 'native_schema',
      contract: aiGenerationContracts.research.ref,
      budgetAuthorized: true,
    }).execution;
    expect(second.readiness.configurationFingerprint).not.toBe(
      first.readiness.configurationFingerprint,
    );
    expect(first.readiness.state).toBe('ready');
    expect(second.readiness.state).toBe('ready');
  });

  it('明确能力撤销只阻断匹配模型、模式、契约和配置指纹的下一次发送', () => {
    const current = snapshot();
    const revoked = {
      model: current.route.model,
      mode: current.route.mode,
      contract: current.route.contract,
      configurationFingerprint: configurationFingerprint(current),
      reason: 'provider rejected required parameter',
      revokedAt,
    };
    const result = evaluateAiProviderReadiness(
      { ...current, revocations: [revoked] },
      { budgetAuthorized: true },
    );
    expect(result.readiness.reasons).toEqual(['capability_revoked']);

    const otherContract: AiGenerationContractRef = aiGenerationContracts.parameterOptimization.ref;
    const other = evaluateAiProviderReadiness(
      {
        ...current,
        route: route({ contract: otherContract }),
        revocations: [revoked],
      },
      { budgetAuthorized: true },
    );
    expect(other.readiness.state).toBe('ready');
  });

  it('就绪读取不发网络请求，Registry 也不暴露凭证指纹', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const registry = new AiProviderRegistry();
    registry.replace([provider()]);
    expect(registry.readiness('provider-a', true)[0]?.readiness.state).toBe('ready');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(registry.list())).not.toContain('credential-v1');
    fetchSpy.mockRestore();
  });

  it.each<[AiGenerationMode, AiGenerationContractRef]>([
    ['native_schema', aiGenerationContracts.strategyDiscovery.ref],
    ['json_validated', aiGenerationContracts.parameterOptimization.ref],
  ])('发布证据绑定模式与契约：%s', (mode, contract) => {
    const result = evaluateAiProviderReadiness(snapshot({ route: route({ mode, contract }) }), {
      budgetAuthorized: true,
    });
    expect(result.adapterEvidence).toMatchObject({ mode, contract });
  });
});
