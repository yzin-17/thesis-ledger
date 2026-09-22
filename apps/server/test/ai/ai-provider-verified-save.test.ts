import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  aiGenerationContracts,
  aiProviderValidationAuthorizationSchema,
} from '@thesis-ledger/schemas';
import { AiProviderSaveService } from '../../src/ai/ai-provider-save.service.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation.adapter.js';
import { aiProviderInputSchema, type AiProviderInput } from '../../src/ai/ai-provider.contracts.js';
import {
  effectiveRoute,
  explicitlyUnsupportedFormat,
  routeValidationFingerprint,
  type VerifiedRoute,
} from '../../src/ai/ai-provider-validation-policy.js';

const input = (): AiProviderInput =>
  aiProviderInputSchema.parse({
    name: 'local',
    baseUrl: 'https://example.test/v1',
    models: ['model'],
    authMode: 'none',
    enabled: true,
    executionRoutes: [
      {
        model: 'model',
        mode: 'native_schema',
        outputPolicy: 'auto',
        contract: aiGenerationContracts.research.ref,
      },
    ],
    modelPricing: { model: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' } },
  });
const unsupported = () =>
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
  );
const fixture = () => {
  let row: {
    name: string;
    type: string;
    enabled: boolean;
    settings: unknown;
    updatedAt: Date;
    priority: number;
  } | null = null;
  const sdk = {
    generate: vi.fn(async (request: unknown) => {
      void request;
      return {
        output: {},
        usage: { status: 'reported', inputTokens: 8, outputTokens: 4 },
        providerCost: null,
        providerCostCurrency: null,
      };
    }),
  };
  const configs = {
    findStored: vi.fn(async () => row),
    readCredential: vi.fn(async () => 'stored-key'),
  };
  const providers = {
    save: vi.fn(async (value: AiProviderInput, records: VerifiedRoute[]) => {
      row = {
        name: value.name,
        type: 'ai',
        enabled: value.enabled ?? true,
        priority: value.priority,
        settings: { ...value, generationValidation: records },
        updatedAt: new Date(),
      };
      return { ...value, updatedAt: row.updatedAt.toISOString() };
    }),
    setEnabled: vi.fn(async () => ({})),
  };
  const health = { recordHistory: vi.fn(async () => null) };
  const ids = new Set<string>();
  const journal = {
    passed: vi.fn(async () => []),
    begin: vi.fn(async (_name: string, id: string) => {
      if (ids.has(id)) throw new Error('duplicate operation');
      ids.add(id);
    }),
  };
  const service = new AiProviderSaveService(
    providers as never,
    configs as never,
    sdk as never,
    health as never,
    journal as never,
  );
  const authorize = async (value: AiProviderInput) => ({
    operationId: randomUUID(),
    planFingerprint: (await service.plan(value)).planFingerprint,
    authorized: true as const,
    maxCalls: (await service.plan(value)).maxCalls,
    allowTextFallback: false,
  });
  return { service, sdk, providers, configs, health, authorize, journal };
};

describe('verified provider save', () => {
  it('plans without calling the model; refuses an unverified normal save', async () => {
    const f = fixture();
    expect(await f.service.plan(input())).toMatchObject({ maxCalls: 3 });
    expect(f.sdk.generate).not.toHaveBeenCalled();
    await expect(f.service.save(input())).rejects.toThrow('测试并保存');
    expect(f.providers.save).not.toHaveBeenCalled();
  });
  it('prefers schema output, uses production transport and persists proof with resolved routes', async () => {
    const f = fixture();
    const value = input();
    await f.service.testAndSave(value, await f.authorize(value));
    expect(f.sdk.generate).toHaveBeenCalledTimes(1);
    expect(f.sdk.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'native_schema',
        transport: 'stream',
        authMode: 'none',
        contract: aiGenerationContracts.research.ref,
        timeout: { totalMs: 120000, firstChunkMs: 30000, chunkMs: 30000 },
      }),
    );
    expect(f.providers.save).toHaveBeenCalledWith(
      expect.objectContaining({
        executionRoutes: [expect.objectContaining({ mode: 'native_schema', outputPolicy: 'auto' })],
      }),
      [
        expect.objectContaining({
          mode: 'native_schema',
          purpose: 'research',
          requestId: expect.any(String),
        }),
      ],
    );
  });
  it('only a machine-readable unsupported-format response advances to JSON Mode', async () => {
    const f = fixture();
    f.sdk.generate.mockRejectedValueOnce(unsupported());
    const value = input();
    await f.service.testAndSave(value, await f.authorize(value));
    expect(
      f.sdk.generate.mock.calls.map(([request]) => (request as { mode: string }).mode),
    ).toEqual(['native_schema', 'json_mode']);
  });
  it.each(['timeout', 'rate limit', 'schema_invalid'])(
    'does not fallback after %s',
    async (message) => {
      const f = fixture();
      f.sdk.generate.mockRejectedValueOnce(new Error(message));
      const value = input();
      await expect(f.service.testAndSave(value, await f.authorize(value))).rejects.toThrow(
        '原配置未修改',
      );
      expect(f.sdk.generate).toHaveBeenCalledTimes(1);
      expect(f.providers.save).not.toHaveBeenCalled();
    },
  );
  it('does not silently use text after both structured methods are rejected', async () => {
    const f = fixture();
    f.sdk.generate.mockRejectedValue(unsupported());
    const value = input();
    await expect(f.service.testAndSave(value, await f.authorize(value))).rejects.toThrow(
      '明确允许',
    );
    expect(f.sdk.generate).toHaveBeenCalledTimes(2);
    expect(f.providers.save).not.toHaveBeenCalled();
  });
  it('a manual text choice still needs verification and makes one request', async () => {
    const f = fixture();
    const value = input();
    value.executionRoutes![0]!.mode = 'json_validated';
    value.executionRoutes![0]!.outputPolicy = 'manual';
    await f.service.testAndSave(value, await f.authorize(value));
    expect(f.sdk.generate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'json_validated' }),
    );
    expect(f.sdk.generate).toHaveBeenCalledTimes(1);
  });
  it('allows disabled configuration saves without a call or complete pricing', async () => {
    const f = fixture();
    await f.service.save({ ...input(), enabled: false, modelPricing: {} });
    expect(f.sdk.generate).not.toHaveBeenCalled();
    expect(f.providers.save).toHaveBeenCalledTimes(1);
  });
  it('reuses matching validation for price or priority changes, but not for a changed timeout', async () => {
    const f = fixture();
    const value = input();
    const saved = await f.service.testAndSave(value, await f.authorize(value));
    const next = {
      ...value,
      expectedRevision: saved.updatedAt,
      priority: 2,
      modelPricing: { model: { costPer1kInput: 1, costPer1kOutput: 2, costCurrency: 'USD' } },
    };
    expect((await f.service.plan(next)).pending).toHaveLength(0);
    expect((await f.service.plan({ ...next, firstOutputTimeoutMs: 45000 })).pending).toHaveLength(
      1,
    );
  });
  it('refuses stale cost authorization before sending', async () => {
    const f = fixture();
    const value = input();
    const auth = await f.authorize(value);
    await expect(
      f.service.testAndSave(
        {
          ...value,
          modelPricing: { model: { costPer1kInput: 1, costPer1kOutput: 1, costCurrency: 'USD' } },
        },
        auth,
      ),
    ).rejects.toThrow('费用已变化');
    expect(f.sdk.generate).not.toHaveBeenCalled();
  });
  it('persists audit intent and outcome even when saving later fails', async () => {
    const f = fixture();
    f.providers.save.mockRejectedValueOnce(new Error('CAS conflict'));
    const value = input();
    await expect(f.service.testAndSave(value, await f.authorize(value))).rejects.toThrow(
      'CAS conflict',
    );
    expect(f.health.recordHistory).toHaveBeenCalledTimes(2);
    expect(f.health.recordHistory.mock.invocationCallOrder[0]).toBeLessThan(
      f.sdk.generate.mock.invocationCallOrder[0]!,
    );
  });
  it('rejects client-provided proof and authorization without explicit consent', () => {
    expect(aiProviderInputSchema.safeParse({ ...input(), generationValidation: [] }).success).toBe(
      false,
    );
    expect(
      aiProviderValidationAuthorizationSchema.safeParse({
        operationId: randomUUID(),
        authorized: false,
      }).success,
    ).toBe(false);
  });
  it('does not infer capabilities from error prose or invalid schema errors', () => {
    expect(explicitlyUnsupportedFormat(new Error('unsupported response_format'))).toBe(false);
    expect(
      explicitlyUnsupportedFormat({
        statusCode: 400,
        responseBody: '{"error":{"code":"invalid_json_schema","param":"response_format"}}',
      }),
    ).toBe(false);
    expect(explicitlyUnsupportedFormat(unsupported())).toBe(true);
  });
  it('uses model defaults only when the purpose inherits, and binds policy in its fingerprint', () => {
    const value = input();
    const route = { ...value.executionRoutes![0]!, modeOverridden: false };
    value.modelDefaults = { model: { mode: 'json_mode', outputPolicy: 'manual' } };
    const resolved = effectiveRoute(value, route);
    expect(resolved.mode).toBe('json_mode');
    expect(effectiveRoute(value, { ...route, modeOverridden: true }).mode).toBe('native_schema');
    expect(routeValidationFingerprint(value, resolved, '')).not.toBe(
      routeValidationFingerprint(value, route, ''),
    );
  });
  it('cancels an active verification and keeps known usage without saving', async () => {
    const f = fixture();
    const value = input();
    const auth = await f.authorize(value);
    let start!: () => void;
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    f.sdk.generate.mockImplementationOnce(async (request) => {
      const signal = (request as { signal: AbortSignal }).signal;
      start();
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      return {
        output: {},
        usage: { status: 'reported', inputTokens: 7, outputTokens: 3 },
        providerCost: null,
        providerCostCurrency: null,
      };
    });
    const result = f.service.testAndSave(value, auth).catch((error: unknown) => error);
    await started;
    expect(f.service.cancel(value.name, auth.operationId)).toEqual({ cancelled: true });
    expect(await result).toBeInstanceOf(Error);
    expect(f.providers.save).not.toHaveBeenCalled();
    expect(f.sdk.generate).toHaveBeenCalledTimes(1);
  });
  it('reuses a passed purpose after another purpose fails, without hiding the failed one', async () => {
    const f = fixture();
    const value = input();
    value.executionRoutes!.push({
      ...value.executionRoutes![0]!,
      contract: aiGenerationContracts.parameterOptimization.ref,
    });
    f.sdk.generate
      .mockResolvedValueOnce({
        output: {},
        usage: { status: 'reported', inputTokens: 1, outputTokens: 1 },
        providerCost: null,
        providerCostCurrency: null,
      })
      .mockRejectedValueOnce(new Error('schema invalid'));
    await expect(f.service.testAndSave(value, await f.authorize(value))).rejects.toThrow(
      '验证未通过',
    );
    const plan = await f.service.plan(value);
    expect(plan.pending).toMatchObject([{ purpose: 'parameter_optimization' }]);
    expect(f.providers.save).not.toHaveBeenCalled();
    value.executionRoutes![1]!.enabled = false;
    await f.service.save(value);
    expect(f.sdk.generate).toHaveBeenCalledTimes(2);
  });
  it('does not resend a failed validation operation with the same identifier', async () => {
    const f = fixture();
    const value = input();
    const auth = await f.authorize(value);
    f.sdk.generate.mockRejectedValue(new Error('timeout'));
    await expect(f.service.testAndSave(value, auth)).rejects.toThrow('验证未通过');
    await expect(f.service.testAndSave(value, auth)).rejects.toThrow('duplicate operation');
    expect(f.sdk.generate).toHaveBeenCalledTimes(1);
  });
  it('rejects sending the saved credential to a modified endpoint', async () => {
    const f = fixture();
    const value = input();
    value.authMode = 'api_key';
    value.apiKey = 'test-secret';
    const saved = await f.service.testAndSave(value, await f.authorize(value));
    const { apiKey: _key, ...next } = value;
    void _key;
    await expect(
      f.service.plan({
        ...next,
        baseUrl: 'https://other.test/v1',
        expectedRevision: saved.updatedAt,
      }),
    ).rejects.toThrow('旧密钥');
  });
});
