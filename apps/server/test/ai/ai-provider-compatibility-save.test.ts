import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  aiGenerationContracts,
  aiProviderValidationAuthorizationSchema,
} from '@thesis-ledger/schemas';
import { AiProviderSaveService } from '../../src/ai/ai-provider-save.service.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation.adapter.js';
import { aiProviderInputSchema, type AiProviderInput } from '../../src/ai/ai-provider.contracts.js';
import { resolveCompatibilityProfile } from '../../src/ai/ai-provider-summary.js';
import { settingsFromAiProviderInput } from '../../src/ai/ai-provider-readiness.persistence.js';
import type { VerifiedRoute } from '../../src/ai/ai-provider-validation-policy.js';

const input = (): AiProviderInput =>
  aiProviderInputSchema.parse({
    name: 'openrouter',
    baseUrl: 'https://example.test/v1',
    models: ['openrouter/free'],
    authMode: 'api_key',
    upstreamFormat: 'chat-completions',
    chatImplementation: 'compatible',
    enabled: true,
    timeoutMs: 120000,
    modelPricing: {
      'openrouter/free': { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
    },
    executionRoutes: [
      {
        model: 'openrouter/free',
        mode: 'native_schema',
        outputPolicy: 'auto',
        contract: aiGenerationContracts.research.ref,
      },
      {
        model: 'openrouter/free',
        mode: 'native_schema',
        outputPolicy: 'auto',
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
    ...input(),
    name: 'openrouter',
    type: 'ai',
    enabled: true,
    updatedAt: new Date('2026-10-23T00:00:00Z'),
    settings: { ...input() } as unknown,
  };
  const configs = {
    findStored: vi.fn(async () => row),
    readCredential: vi.fn(async () => 'stored-secret'),
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
        ...value,
        enabled: value.enabled ?? row.enabled,
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
  const draft = () => ({ ...input(), expectedRevision: row.updatedAt.toISOString() });
  const authorize = async (value: AiProviderInput) => {
    const plan = await service.plan(value);
    return aiProviderValidationAuthorizationSchema.parse({
      operationId: randomUUID(),
      planFingerprint: plan.planFingerprint,
      authorized: true,
      maxCalls: plan.maxCalls,
      stopOnFirstFailure: true,
    });
  };
  return { configs, sdk, providers, health, service, draft, authorize };
};

describe('显式兼容扩展保存', () => {
  it('仅接受兼容 Chat Completions 的已知显式扩展', () => {
    const value = { ...input(), compatibilityExtensionProfile: 'openrouter-v1' };
    expect(aiProviderInputSchema.parse(value).compatibilityExtensionProfile).toBe('openrouter-v1');
    const saved = settingsFromAiProviderInput(aiProviderInputSchema.parse(value), input());
    expect(saved.compatibilityExtensionProfile).toBe('openrouter-v1');
    expect(settingsFromAiProviderInput(input(), saved).compatibilityExtensionProfile).toBe(
      'openrouter-v1',
    );
    for (const overrides of [
      { upstreamFormat: 'responses', chatImplementation: undefined },
      { chatImplementation: 'openai-native' },
      { compatibilityExtensionProfile: 'unknown' },
    ]) {
      expect(aiProviderInputSchema.safeParse({ ...value, ...overrides }).success).toBe(false);
    }
    expect(resolveCompatibilityProfile(input(), undefined)).toBeUndefined();
    expect(
      resolveCompatibilityProfile({ compatibilityExtensionProfile: 'openrouter-v1' }, input()),
    ).toBe('openrouter-v1');
    expect(
      resolveCompatibilityProfile(
        {},
        { ...input(), compatibilityExtensionProfile: 'openrouter-v1' },
      ),
    ).toBe('openrouter-v1');
  });

  it('旧证明不验证新扩展；两条用途通过后保存，省略扩展时继续保留', async () => {
    const f = fixture();
    const old = f.draft();
    await f.service.testAndSave(old, await f.authorize(old));
    const changed: AiProviderInput = {
      ...f.draft(),
      compatibilityExtensionProfile: 'openrouter-v1',
    };
    const plan = await f.service.plan(changed);
    expect(plan.pending.map((item) => item.purpose)).toEqual([
      'research',
      'strategy_authoring_analysis',
    ]);
    await expect(f.service.save(changed)).rejects.toThrow('测试并保存');
    f.sdk.generate.mockClear();
    await f.service.testAndSave(changed, await f.authorize(changed));
    expect(f.sdk.generate).toHaveBeenCalledTimes(2);
    for (const [request] of f.sdk.generate.mock.calls)
      expect(request).toMatchObject({
        compatibilityExtensionProfile: 'openrouter-v1',
        apiKey: 'stored-secret',
        adapter: 'openai-compatible-chat',
        mode: 'native_schema',
        transport: 'stream',
      });
    expect(f.providers.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        compatibilityExtensionProfile: 'openrouter-v1',
        enabled: true,
        executionRoutes: changed.executionRoutes,
      }),
      expect.arrayContaining([
        expect.objectContaining({ purpose: 'research' }),
        expect.objectContaining({ purpose: 'strategy_authoring_analysis' }),
      ]),
    );
    expect((await f.service.plan(f.draft())).pending).toEqual([]);
    await f.service.save(f.draft());
    expect(f.sdk.generate).toHaveBeenCalledTimes(2);
    expect(f.providers.save.mock.calls.at(-1)?.[0].compatibilityExtensionProfile).toBe(
      'openrouter-v1',
    );
  });

  it('明确的格式不支持也在首次失败停止，不保存或继续下一用途', async () => {
    const f = fixture();
    const value: AiProviderInput = { ...f.draft(), compatibilityExtensionProfile: 'openrouter-v1' };
    f.sdk.generate.mockRejectedValueOnce(
      new AiSdkGenerationError(
        {
          code: 'transport_unknown',
          phase: 'request',
          summary: 'unsupported',
          externalResult: 'unknown',
          requestId: randomUUID(),
        },
        undefined,
        {
          cause: {
            statusCode: 400,
            responseBody: JSON.stringify({
              error: { code: 'unsupported_parameter', param: 'response_format' },
            }),
          },
        },
      ),
    );
    await expect(f.service.testAndSave(value, await f.authorize(value))).rejects.toThrow(
      '原配置未修改',
    );
    expect(f.sdk.generate).toHaveBeenCalledTimes(1);
    expect(f.providers.save).not.toHaveBeenCalled();
    expect(f.health.recordHistory).toHaveBeenLastCalledWith(
      'openrouter',
      'degraded',
      expect.any(Number),
      expect.any(String),
      expect.any(Date),
      'manual',
      expect.objectContaining({ status: 'failed', purpose: 'research' }),
    );
  });
});
