import { describe, expect, it } from 'vitest';
import {
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
});
