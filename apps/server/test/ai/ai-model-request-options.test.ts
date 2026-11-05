import { describe, expect, it } from 'vitest';
import {
  aiGenerationContracts,
  aiProviderInputSchema as sharedInput,
} from '@thesis-ledger/schemas';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';
import { settingsFromAiProviderInput } from '../../src/ai/ai-provider-readiness.persistence.js';
import {
  configurationFingerprint,
  evaluateAiProviderReadiness,
  type AiProviderRouteSnapshot,
} from '../../src/ai/ai-provider-readiness.js';
import { routeValidationFingerprint } from '../../src/ai/ai-provider-validation-policy.js';
import { modelRequestOptionsIssue } from '../../src/ai/ai-model-request-options.js';
import { buildAiProviderTestRuntime } from '../../src/ai/ai-provider-test-runtime.js';
import { routeSnapshotsFromProvider } from '../../src/ai/provider-registry.js';

const options = { body: { custom: { enabled: false } }, outputTokenLimit: 'upstream' as const };
const pricing = { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' };
const raw = {
  name: 'p',
  baseUrl: 'https://example.test/v1',
  models: ['m'],
  modelDefaults: { m: { mode: 'json_mode', requestOptions: options } },
  modelPricing: { m: pricing },
};
const route = {
  model: 'm',
  mode: 'json_mode' as const,
  contract: aiGenerationContracts.research.ref,
};
const snapshot = (): AiProviderRouteSnapshot => ({
  providerId: 'p',
  baseUrl: raw.baseUrl,
  upstreamFormat: 'chat-completions',
  adapter: 'openai-compatible-chat',
  models: ['m'],
  route,
  enabled: true,
  health: 'healthy',
  credentialFingerprint: 'key-fingerprint',
  revocations: [],
  ...pricing,
});

describe('通用参数的配置与就绪', () => {
  it('共享与Server合同一致，保存和重读不丢参数', () => {
    const input = aiProviderInputSchema.parse(raw);
    expect(sharedInput.parse(raw)).toEqual(input);
    const settings = settingsFromAiProviderInput(input);
    expect(parseAiProviderSettings(settings)?.modelDefaults?.m?.requestOptions).toEqual(options);
    expect(
      aiProviderInputSchema.safeParse({
        ...raw,
        modelDefaults: { m: { mode: 'json_mode', requestOptions: { body: { messages: [] } } } },
      }).success,
    ).toBe(false);
  });

  it('显式上游默认上限拒绝未知和非零价格及必填上限协议', () => {
    for (const costs of [
      {},
      { costPer1kInput: 1, costPer1kOutput: 0, costCurrency: 'USD' },
      { costPer1kInput: 0, costPer1kOutput: 0 },
    ]) {
      expect(modelRequestOptionsIssue(options, 'openai-compatible-chat', costs)).toBeTruthy();
      expect(
        evaluateAiProviderReadiness(
          {
            ...snapshot(),
            ...costs,
            costPer1kInput: costs.costPer1kInput,
            costPer1kOutput: costs.costPer1kOutput,
            costCurrency: costs.costCurrency,
            requestOptions: options,
          } as AiProviderRouteSnapshot,
          { budgetAuthorized: true },
        ).readiness.reasons,
      ).toContain('configuration_invalid');
    }
    expect(modelRequestOptionsIssue(options, 'anthropic-messages', pricing)).toBeTruthy();
    expect(modelRequestOptionsIssue(options, 'openai-compatible-chat', pricing)).toBeUndefined();
    expect(() =>
      settingsFromAiProviderInput(
        aiProviderInputSchema.parse({
          ...raw,
          modelPricing: { m: { ...pricing, costPer1kOutput: 1 } },
        }),
      ),
    ).toThrow('零价格');
  });

  it('参数进入就绪和用途验证指纹，旧配置指纹保持稳定', () => {
    const old = snapshot();
    const first = { ...old, requestOptions: options };
    expect(configurationFingerprint(first)).not.toBe(configurationFingerprint(old));
    expect(
      configurationFingerprint({
        ...first,
        requestOptions: { ...options, body: { custom: { enabled: true } } },
      }),
    ).not.toBe(configurationFingerprint(first));
    expect(evaluateAiProviderReadiness(first, { budgetAuthorized: false })).toMatchObject({
      requestOptions: options,
      readiness: { state: 'ready' },
    });
    const input = aiProviderInputSchema.parse(raw);
    const previous = aiProviderInputSchema.parse({ ...raw, modelDefaults: undefined });
    expect(routeValidationFingerprint(input, route, 'key')).not.toBe(
      routeValidationFingerprint(previous, route, 'key'),
    );
  });

  it('Provider注册快照按模型继承参数，不引入其他模型参数', () => {
    const snapshots = routeSnapshotsFromProvider({
      id: 'p',
      models: ['m', 'other'],
      metadata: {
        baseURL: raw.baseUrl,
        upstreamFormat: 'chat-completions',
        adapter: 'openai-compatible-chat',
        executionRoutes: [route, { ...route, model: 'other' }],
        modelDefaults: { m: { mode: 'json_mode', requestOptions: options } },
      },
    });
    expect(snapshots[0]?.requestOptions).toEqual(options);
    expect(snapshots[1]).not.toHaveProperty('requestOptions');
  });

  it('旧客户端省略参数保留，显式空对象清除，非法存量不静默执行', () => {
    const first = settingsFromAiProviderInput(aiProviderInputSchema.parse(raw));
    const oldClient = aiProviderInputSchema.parse({
      ...raw,
      modelDefaults: { m: { mode: 'json_mode' } },
    });
    expect(settingsFromAiProviderInput(oldClient, first).modelDefaults?.m?.requestOptions).toEqual(
      options,
    );
    const clear = aiProviderInputSchema.parse({
      ...raw,
      modelDefaults: { m: { mode: 'json_mode', requestOptions: {} } },
    });
    expect(settingsFromAiProviderInput(clear, first).modelDefaults?.m?.requestOptions).toEqual({});
    expect(
      parseAiProviderSettings({
        ...first,
        modelDefaults: { m: { mode: 'json_mode', requestOptions: { body: { messages: [] } } } },
      }),
    ).toBeNull();
  });

  it('移除带上游默认参数的模型后，剩余非零价格模型可正常保存', () => {
    const first = settingsFromAiProviderInput(aiProviderInputSchema.parse(raw));
    const next = aiProviderInputSchema.parse({
      ...raw,
      models: ['other'],
      executionRoutes: [],
      modelDefaults: undefined,
      modelPricing: { other: { ...pricing, costPer1kInput: 1 } },
    });
    const settings = settingsFromAiProviderInput(next, first);
    expect(settings.modelDefaults).toEqual({});
    expect(settings.modelPricing.other?.costPer1kInput).toBe(1);
    expect(parseAiProviderSettings(settings)?.modelDefaults).toBeUndefined();
    expect(
      buildAiProviderTestRuntime(next, { enabled: false, settings: first }, 'controlled')
        .modelDefaults,
    ).toEqual({});
    const retained = aiProviderInputSchema.parse({ ...raw, modelDefaults: undefined });
    expect(
      buildAiProviderTestRuntime(retained, { enabled: false, settings: first }, 'controlled')
        .modelDefaults?.m?.requestOptions,
    ).toEqual(options);
  });
});
