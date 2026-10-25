import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  aiGenerationContracts,
  aiProviderValidationAuthorizationSchema,
  researchGenerationV2Contract,
  researchGenerationV2Schema,
} from '@thesis-ledger/schemas';
import { aiProviderInputSchema, type AiProviderInput } from '../../src/ai/ai-provider.contracts.js';
import {
  configurationFingerprint,
  type AiProviderRouteSnapshot,
} from '../../src/ai/ai-provider-readiness.js';
import { settingsFromAiProviderInput } from '../../src/ai/ai-provider-readiness.persistence.js';
import { routeValidationFingerprint } from '../../src/ai/ai-provider-validation-policy.js';
import { AiProviderSaveService } from '../../src/ai/ai-provider-save.service.js';
import { freezeAiResearchRoutes, parseAiResearchPolicy } from '../../src/ai/ai-research-policy.js';
import {
  frozenResearchRouteMatches,
  readFrozenResearchReasoning,
} from '../../src/ai/ai-research-reasoning-options.js';
import type { VerifiedRoute } from '../../src/ai/ai-provider-validation-policy.js';

const draftInput = (): AiProviderInput =>
  aiProviderInputSchema.parse({
    name: 'openrouter',
    baseUrl: 'https://example.test/v1',
    models: ['openrouter/free'],
    enabled: true,
    upstreamFormat: 'chat-completions',
    chatImplementation: 'compatible',
    compatibilityExtensionProfile: 'openrouter-v1',
    timeoutMs: 120000,
    modelPricing: {
      'openrouter/free': { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
    },
    executionRoutes: [
      {
        model: 'openrouter/free',
        mode: 'native_schema',
        outputPolicy: 'auto',
        modeOverridden: false,
        enabled: true,
        contract: researchGenerationV2Contract.ref,
      },
      {
        model: 'openrouter/free',
        mode: 'native_schema',
        outputPolicy: 'auto',
        modeOverridden: false,
        contract: aiGenerationContracts.authoringAnalysis.ref,
      },
      {
        model: 'openrouter/free',
        mode: 'native_schema',
        outputPolicy: 'auto',
        enabled: false,
        contract: aiGenerationContracts.strategyDiscovery.ref,
      },
    ],
  });

const fixture = () => {
  let row = {
    name: 'openrouter',
    type: 'ai',
    enabled: true,
    updatedAt: new Date('2026-10-24T00:00:00Z'),
    settings: { ...draftInput() } as unknown,
  };
  const configs = {
    findStored: vi.fn(async () => row),
    readCredential: vi.fn(async () => 'local-secret'),
  };
  const sdk = {
    generate: vi.fn(async (request: unknown) => {
      void request;
      return {
        output: {},
        usage: { status: 'reported', inputTokens: 8, outputTokens: 4 },
        providerCost: '0',
        providerCostCurrency: 'USD',
      };
    }),
  };
  const providers = {
    save: vi.fn(async (value: AiProviderInput, records: VerifiedRoute[]) => {
      row = {
        ...row,
        updatedAt: new Date(row.updatedAt.getTime() + 1000),
        settings: {
          ...settingsFromAiProviderInput(value, row.settings),
          generationValidation: records,
        },
      };
      return { ...value, updatedAt: row.updatedAt.toISOString() };
    }),
  };
  const health = { recordHistory: vi.fn(async () => null) };
  const journal = { passed: vi.fn(async () => []), begin: vi.fn(async () => undefined) };
  const service = new AiProviderSaveService(
    providers as never,
    configs as never,
    sdk as never,
    health as never,
    journal as never,
  );
  const draft = (): AiProviderInput => ({
    ...draftInput(),
    expectedRevision: row.updatedAt.toISOString(),
  });
  const authorization = async (
    value: AiProviderInput,
    maxCalls: number,
    stopOnFirstFailure = true,
  ) => {
    const plan = await service.plan(value);
    return aiProviderValidationAuthorizationSchema.parse({
      operationId: randomUUID(),
      planFingerprint: plan.planFingerprint,
      authorized: true,
      maxCalls,
      stopOnFirstFailure,
    });
  };
  return { sdk, providers, service, draft, authorization, settings: () => row.settings };
};

describe('研究用途显式推理参数接线', () => {
  it('只使研究证明失效，准确 V2 探针传开关，保存／省略继续保留 false', async () => {
    const f = fixture(),
      initial = f.draft();
    await f.service.testAndSave(initial, await f.authorization(initial, 2));
    const initialRecords = f.providers.save.mock.calls.at(-1)![1];
    const value = f.draft();
    value.executionRoutes![0] = { ...value.executionRoutes![0]!, reasoningEnabled: false };
    const plan = await f.service.plan(value);
    expect(plan.maxCalls).toBe(3);
    expect(plan.pending.map((x) => x.purpose)).toEqual(['research']);
    f.sdk.generate.mockClear();
    await f.service.testAndSave(value, await f.authorization(value, 1));
    expect(f.sdk.generate).toHaveBeenCalledTimes(1);
    const request = f.sdk.generate.mock.calls[0]![0];
    expect(request).toMatchObject({
      reasoningEnabled: false,
      contract: researchGenerationV2Contract.ref,
      compatibilityExtensionProfile: 'openrouter-v1',
    });
    const probe = request as { schema: unknown; messages: Array<{ content: string }> };
    expect(probe.schema).toBe(researchGenerationV2Schema);
    expect(probe.messages.at(-1)?.content).toContain('"const":2');
    expect(
      f.providers.save.mock.calls
        .at(-1)![1]
        .find((x) => x.purpose === 'strategy_authoring_analysis'),
    ).toEqual(initialRecords.find((x) => x.purpose === 'strategy_authoring_analysis'));
    expect((f.settings() as { executionRoutes: unknown[] }).executionRoutes[0]).toMatchObject({
      reasoningEnabled: false,
      outputPolicy: 'auto',
      modeOverridden: false,
      enabled: true,
    });
    const omitted = f.draft();
    expect((await f.service.plan(omitted)).pending).toEqual([]);
    await f.service.save(omitted);
    expect(f.sdk.generate).toHaveBeenCalledTimes(1);
    expect((f.settings() as { executionRoutes: unknown[] }).executionRoutes[0]).toHaveProperty(
      'reasoningEnabled',
      false,
    );
  });

  it('不允许普通流程缩小次数、低于用途数、超过计划或错误指纹，调用前拒绝', async () => {
    const f = fixture(),
      value = f.draft();
    const auth = await f.authorization(value, 2);
    for (const invalid of [
      { ...auth, stopOnFirstFailure: false },
      { ...auth, maxCalls: 1 },
      { ...auth, maxCalls: 7 },
      { ...auth, planFingerprint: 'different' },
    ])
      await expect(f.service.testAndSave(value, invalid)).rejects.toThrow('测试范围或费用');
    expect(f.sdk.generate).not.toHaveBeenCalled();
  });

  it('运行指纹和验证指纹只改变研究用途，字段缺省不改变旧键结构', () => {
    const input = draftInput(),
      research = input.executionRoutes![0]!,
      analysis = input.executionRoutes![1]!;
    const snapshot: AiProviderRouteSnapshot = {
      providerId: 'openrouter',
      baseUrl: input.baseUrl,
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
      compatibilityExtensionProfile: 'openrouter-v1',
      adapter: 'openai-compatible-chat',
      models: input.models,
      route: research,
      enabled: true,
      health: 'healthy',
      credentialFingerprint: 'local',
      revocations: [],
    };
    expect(
      configurationFingerprint({ ...snapshot, route: { ...research, reasoningEnabled: false } }),
    ).not.toBe(configurationFingerprint(snapshot));
    expect(
      routeValidationFingerprint(
        input,
        { ...research, reasoningEnabled: false },
        'local',
        'openrouter-v1',
      ),
    ).not.toBe(routeValidationFingerprint(input, research, 'local', 'openrouter-v1'));
    const changed = {
      ...input,
      executionRoutes: [{ ...research, reasoningEnabled: false }, analysis],
    };
    expect(routeValidationFingerprint(changed, analysis, 'local', 'openrouter-v1')).toBe(
      routeValidationFingerprint(input, analysis, 'local', 'openrouter-v1'),
    );
    expect(configurationFingerprint({ ...snapshot, route: analysis })).toBe(
      configurationFingerprint({ ...snapshot, route: { ...analysis } }),
    );
  });

  it('冻结显式 false，派发拒绝字段缺失／值变化，旧缺省仍兼容', () => {
    const execution = {
      adapter: 'openai-compatible-chat',
      mode: 'native_schema',
      reasoningEnabled: false,
      readiness: { configurationFingerprint: 'local' },
    };
    const provider = {
      id: 'openrouter',
      models: ['openrouter/free'],
      metadata: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
    };
    const result = freezeAiResearchRoutes(
      { strictReadyContract: () => ({ provider, execution }) } as never,
      parseAiResearchPolicy(undefined),
      { providerId: 'openrouter', model: 'openrouter/free' },
      researchGenerationV2Contract.ref,
    ).routes[0]!;
    const frozen = { ...result, model: result.model ?? '' };
    expect(frozen.model).toBe('openrouter/free');
    expect(frozen.reasoningEnabled).toBe(false);
    expect(frozenResearchRouteMatches(frozen, 'openrouter', 'openrouter/free', execution)).toBe(
      true,
    );
    const { reasoningEnabled, ...missing } = frozen;
    void reasoningEnabled;
    expect(frozenResearchRouteMatches(missing, 'openrouter', 'openrouter/free', execution)).toBe(
      false,
    );
    expect(
      frozenResearchRouteMatches(frozen, 'openrouter', 'openrouter/free', {
        ...execution,
        reasoningEnabled: true,
      }),
    ).toBe(false);
    const { reasoningEnabled: ignored, ...legacyExecution } = execution;
    void ignored;
    expect(
      frozenResearchRouteMatches(missing, 'openrouter', 'openrouter/free', legacyExecution),
    ).toBe(true);
    expect(() => readFrozenResearchReasoning({ reasoningEnabled: 'false' })).toThrow('冻结');
  });

  it('拒绝 V1／其他用途及非 OpenRouter 的显式开关', () => {
    for (const contract of [
      aiGenerationContracts.research.ref,
      aiGenerationContracts.authoringAnalysis.ref,
    ])
      expect(
        aiProviderInputSchema.safeParse({
          ...draftInput(),
          executionRoutes: [
            { ...draftInput().executionRoutes![0], contract, reasoningEnabled: false },
          ],
        }).success,
      ).toBe(false);
    const value = draftInput();
    value.executionRoutes![0] = { ...value.executionRoutes![0]!, reasoningEnabled: false };
    const { compatibilityExtensionProfile, ...unsupported } = value;
    void compatibilityExtensionProfile;
    expect(() => settingsFromAiProviderInput(unsupported)).toThrow('OpenRouter');
  });
});
