import {
  aiGenerationContracts,
  type AiAdapter,
  type AiGenerationContractRef,
  type AiGenerationMode,
} from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { aiProviderInputSchema, type AiProviderExecutionRouteInput } from '../../src/ai/ai-provider.contracts.js';
import {
  configurationFingerprint,
  evaluateAiProviderReadiness,
  inferLegacyAiAdapter,
  type AiProviderRouteSnapshot,
} from '../../src/ai/ai-provider-readiness.js';
import type { AiProvider } from '../../src/ai/contracts.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { AiProviderController } from '../../src/ai/ai-provider.controller.js';

const declaredAt = '2026-09-19T00:00:00.000Z';

const route = (
  overrides: Partial<AiProviderExecutionRouteInput> = {},
): AiProviderExecutionRouteInput => ({
  model: 'model-a',
  mode: 'native_schema',
  contract: aiGenerationContracts.research.ref,
  capabilityDeclaration: {
    source: 'manual',
    sourceRef: 'provider-settings',
    declaredAt,
    declaredBy: 'operator@example.test',
    sourceVersion: 'declaration-v1',
  },
  allowedUpstreams: [],
  freeEvidence: null,
  ...overrides,
});

const snapshot = (
  overrides: Partial<AiProviderRouteSnapshot> = {},
): AiProviderRouteSnapshot => ({
  providerId: 'provider-a',
  baseUrl: 'https://proxy.example.test/v1',
  adapter: 'openai-compatible',
  models: ['model-a', 'model-b'],
  route: route(),
  enabled: true,
  health: 'healthy',
  credentialFingerprint: 'credential-v1',
  revocations: [],
  ...overrides,
});

const provider = (input: {
  baseUrl?: string;
  adapter?: AiAdapter;
  routes?: AiProviderExecutionRouteInput[];
  health?: 'unknown' | 'healthy' | 'degraded' | 'down';
  revocations?: AiProviderRouteSnapshot['revocations'];
} = {}): AiProvider => ({
  id: 'provider-a',
  models: ['model-a', 'model-b'],
  metadata: {
    baseURL: input.baseUrl ?? 'https://proxy.example.test/v1',
    adapter: input.adapter ?? 'openai-compatible',
    executionRoutes: input.routes ?? [route()],
    capabilityRevocations: input.revocations ?? [],
    credentialFingerprint: 'credential-v1',
    health: input.health ?? 'healthy',
  },
  complete: vi.fn(),
});

describe('AI Provider 接入就绪门禁', () => {
  it('拒绝客户端伪造 ready 与本地 adapter 证据', () => {
    const parsed = aiProviderInputSchema.safeParse({
      name: 'provider-a',
      baseUrl: 'https://proxy.example.test/v1',
      models: ['model-a'],
      adapter: 'openai-compatible',
      executionRoutes: [route()],
      ready: true,
      adapterEvidence: { releaseFingerprint: 'forged' },
    });
    expect(parsed.success).toBe(false);
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
      adapter: 'openai-compatible',
      capabilityDeclaration: { source: 'manual' },
      adapterEvidence: {
        sdkVersion: '7.0.95',
        adapterVersion: '3.0.45',
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

    const openrouter = evaluateAiProviderReadiness(
      snapshot({ adapter: 'openrouter' }),
      { budgetAuthorized: true },
    ).adapterEvidence;
    expect(packageJson.dependencies['@openrouter/ai-sdk-provider']).toBe(
      openrouter?.adapterVersion,
    );
  });

  it('普通零价格不能替代免费证据，受控免费证据可以独立授权', () => {
    const paidWithoutAuthorization = evaluateAiProviderReadiness(snapshot(), {
      budgetAuthorized: false,
    });
    expect(paidWithoutAuthorization.readiness.reasons).toContain('budget_not_authorized');

    const controlledFree = evaluateAiProviderReadiness(
      snapshot({
        route: route({
          freeEvidence: {
            source: 'controlled_local',
            sourceRef: 'local-llm-service',
            sourceVersion: '2026-09',
          },
        }),
      }),
      { budgetAuthorized: false },
    );
    expect(controlledFree.readiness.state).toBe('ready');
    expect(controlledFree.freeEvidenceRef).toContain('controlled_local:');
  });

  it('严格推导已知官方主机，自建代理必须显式选择 adapter', () => {
    expect(inferLegacyAiAdapter('https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(inferLegacyAiAdapter('https://api.openai.com/v1')).toBe('openai-compatible');
    expect(inferLegacyAiAdapter('https://openrouter.example.test/v1')).toBeNull();
    const blocked = evaluateAiProviderReadiness(snapshot({ adapter: null }), {
      budgetAuthorized: true,
    });
    expect(blocked.readiness.reasons).toContain('configuration_invalid');

    const disallowedRoute = evaluateAiProviderReadiness(
      snapshot({ route: route({ allowedUpstreams: ['other.example.test'] }) }),
      { budgetAuthorized: true },
    );
    expect(disallowedRoute.readiness.reasons).toContain('route_not_allowed');
  });

  it('health=down 只阻断对应 Provider，混合模型各自保留原因', () => {
    const registry = new AiProviderRegistry();
    registry.replace([
      provider({
        routes: [
          route(),
          route({ model: 'model-b', capabilityDeclaration: null }),
        ],
      }),
    ]);
    const mixed = registry.readiness('provider-a', true);
    expect(mixed).toHaveLength(2);
    expect(mixed.find((entry) => entry.model === 'model-a')?.readiness.state).toBe('ready');
    expect(mixed.find((entry) => entry.model === 'model-b')?.readiness.reasons).toContain(
      'capability_declaration_missing',
    );

    registry.replace([provider({ health: 'down' })]);
    expect(registry.readiness('provider-a', true)[0]?.readiness.reasons).toContain(
      'provider_down',
    );
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
      revokedAt: declaredAt,
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
      revokedAt: declaredAt,
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
    const result = evaluateAiProviderReadiness(
      snapshot({ route: route({ mode, contract }) }),
      { budgetAuthorized: true },
    );
    expect(result.adapterEvidence).toMatchObject({ mode, contract });
  });
});
