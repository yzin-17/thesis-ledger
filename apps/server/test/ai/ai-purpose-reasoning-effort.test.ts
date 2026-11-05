import { describe, expect, it, vi } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import { configurationFingerprint } from '../../src/ai/ai-provider-readiness.js';
import { routeValidationFingerprint } from '../../src/ai/ai-provider-validation-policy.js';
import { runProviderConnectionTest } from '../../src/ai/provider-connection-test.js';
import { buildAiProviderTestRuntime } from '../../src/ai/ai-provider-test-runtime.js';
import { buildOptimizationModelConfig } from '../../src/strategy-optimization/strategy-optimization-model-routing.js';

const input = aiProviderInputSchema.parse({
  name: 'local',
  baseUrl: 'http://127.0.0.1:1234/v1',
  models: ['model'],
  modelReasoning: { model: { supportedEfforts: ['low', 'high'] } },
  executionRoutes: [
    {
      model: 'model',
      contract: aiGenerationContracts.parameterOptimization.ref,
      mode: 'json_validated',
      reasoningEffort: 'high',
    },
  ],
});

describe('用途默认推理强度', () => {
  it('用途探针传强度，连接探针保持中性', async () => {
    const result = { output: {}, usage: { status: 'reported', inputTokens: 1, outputTokens: 1 } } as const;
    const sdk = {
      generate: vi.fn<(input: unknown) => Promise<typeof result>>(() => Promise.resolve(result)),
    };
    const common = {
      sdk: sdk as never,
      adapter: 'openai-compatible-chat' as const,
      providerId: 'local',
      baseURL: input.baseUrl,
      authMode: 'none' as const,
      apiKey: '',
      model: 'model',
      reasoningEffort: 'high' as const,
    };
    await runProviderConnectionTest({ ...common, purpose: 'parameter_optimization' });
    expect(sdk.generate.mock.calls[0]?.[0]).toMatchObject({
      reasoningEffort: 'high',
      transport: 'stream',
    });
    await runProviderConnectionTest(common);
    expect(sdk.generate.mock.calls[1]?.[0]).not.toHaveProperty('reasoningEffort');
  });

  it('改变强度使同一用途的验证和运行指纹失效，缺省保持独立', () => {
    const route = input.executionRoutes![0]!;
    const changed = { ...route, reasoningEffort: 'low' as const };
    expect(routeValidationFingerprint(input, route, 'secret')).not.toBe(
      routeValidationFingerprint(input, changed, 'secret'),
    );
    const snapshot = {
      providerId: 'local',
      baseUrl: input.baseUrl,
      upstreamFormat: input.upstreamFormat,
      adapter: 'openai-compatible-chat' as const,
      models: input.models,
      route,
      enabled: true,
      health: 'healthy',
      credentialFingerprint: 'secret-hash',
      revocations: [],
    };
    expect(configurationFingerprint(snapshot)).not.toBe(
      configurationFingerprint({ ...snapshot, route: changed }),
    );
    expect(
      configurationFingerprint({ ...snapshot, route: { ...route, reasoningEffort: undefined } }),
    ).not.toBe(configurationFingerprint(snapshot));
  });

  it('未声明支持和互斥参数在发送前拒绝', () => {
    expect(() =>
      buildAiProviderTestRuntime({ ...input, modelReasoning: {} }, null, '', 'model', 'generation'),
    ).toThrow('未声明支持');
    expect(
      aiProviderInputSchema.safeParse({
        ...input,
        executionRoutes: [{ ...input.executionRoutes![0], reasoningEnabled: false }],
      }).success,
    ).toBe(false);
  });

  it('创建优化实验时冻结用途默认值，显式实验值优先', () => {
    const providers = {
      strict: () => ({
        metadata: { modelReasoning: input.modelReasoning, executionRoutes: input.executionRoutes },
      }),
    };
    expect(
      buildOptimizationModelConfig([{ provider: 'local', model: 'model' }], providers as never)[0],
    ).toMatchObject({ reasoningEffort: 'high' });
    expect(
      buildOptimizationModelConfig(
        [{ provider: 'local', model: 'model', reasoningEffort: 'low' }],
        providers as never,
      )[0],
    ).toMatchObject({ reasoningEffort: 'low' });
    expect(
      buildOptimizationModelConfig(
        [{ provider: 'local', model: 'model' }],
        providers as never,
        'strategy_discovery',
      )[0],
    ).not.toHaveProperty('reasoningEffort');
  });
});
