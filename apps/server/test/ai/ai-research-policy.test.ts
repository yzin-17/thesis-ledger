import { describe, expect, it } from 'vitest';
import {
  freezeAiResearchRoutes,
  parseAiResearchPolicy,
  researchRoutePaidAuthorized,
} from '../../src/ai/ai-research-policy.js';

describe('AI research policy', () => {
  it('未配置时使用从创建起计时的免费默认策略', () => {
    expect(parseAiResearchPolicy(undefined)).toEqual({
      version: 'research-policy-v1',
      maxAiCalls: 2,
      maxInputTokens: 100_000,
      maxOutputTokens: 20_000,
      maxDurationSeconds: 300,
      maxCost: '0',
      costCurrency: null,
      paidRoutes: [],
    });
  });

  it('付费策略必须同时限制币种和 Provider/模型范围', () => {
    expect(() =>
      parseAiResearchPolicy(JSON.stringify({ maxCost: '1' })),
    ).toThrow();
    const policy = parseAiResearchPolicy(
      JSON.stringify({
        maxCost: '5',
        costCurrency: 'USD',
        paidRoutes: [{ provider: 'paid', models: ['research-model'] }],
      }),
    );
    expect(researchRoutePaidAuthorized(policy, 'paid', 'research-model')).toBe(true);
    expect(researchRoutePaidAuthorized(policy, 'paid', 'other-model')).toBe(false);
  });

  it('拒绝非法 JSON、未知字段和零金额下的付费授权', () => {
    expect(() => parseAiResearchPolicy('{')).toThrow(/JSON/);
    expect(() => parseAiResearchPolicy(JSON.stringify({ unknown: true }))).toThrow();
    expect(() =>
      parseAiResearchPolicy(
        JSON.stringify({
          maxCost: '0',
          costCurrency: 'USD',
          paidRoutes: [{ provider: 'paid', models: ['m'] }],
        }),
      ),
    ).toThrow();
  });

  it('冻结研究候选时按目标模型保存价格快照和版本', () => {
    const provider = {
      id: 'provider-a',
      models: ['model-a'],
      metadata: {
        modelPricing: {
          'model-a': {
            costPer1kInput: 0.1,
            costPer1kOutput: 0.2,
            costCurrency: 'USD',
            pricingVersion: 'pricing-model-a-v1',
          },
        },
      },
    };
    const registry = {
      strictReadyContract: () => ({
        provider,
        execution: {
          adapter: 'openai-compatible-chat' as const,
          mode: 'json_validated' as const,
          readiness: { configurationFingerprint: 'route-v1' },
        },
      }),
    };
    const result = freezeAiResearchRoutes(
      registry as never,
      parseAiResearchPolicy(
        JSON.stringify({
          maxCost: '5',
          costCurrency: 'USD',
          paidRoutes: [{ provider: 'provider-a', models: ['model-a'] }],
        }),
      ),
      { providerId: 'provider-a', model: 'model-a' },
    );

    expect(result.routes).toEqual([
      expect.objectContaining({
        provider: 'provider-a',
        model: 'model-a',
        pricing: {
          costPer1kInput: 0.1,
          costPer1kOutput: 0.2,
          costCurrency: 'USD',
          pricingVersion: 'pricing-model-a-v1',
        },
      }),
    ]);
    expect(result.routes[0]).not.toHaveProperty('pricingVersion');
  });
});
