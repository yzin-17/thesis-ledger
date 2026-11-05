import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createStack,
  databaseUrl,
  providerInput,
  reset,
  type ProviderStack,
} from './ai-provider-postgres.fixture.js';

const isolated = databaseUrl ? describe : describe.skip;
isolated('协议切换的公开计划、保存与持久化证明', () => {
  let first: ProviderStack;
  let reloaded: ProviderStack;
  beforeAll(async () => {
    vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', Buffer.alloc(32, 13).toString('base64'));
    first = await createStack();
    await reset(first);
  });
  afterAll(async () => {
    await reloaded?.close();
    await first?.close();
    vi.unstubAllEnvs();
  });

  const validate = async (provider: unknown) => {
    const plan = await first.request('/ai/providers/validation-plan', provider);
    expect(plan.status).toBe(201);
    expect(plan.body.maxCalls).toBe(1);
    const result = await first.request('/ai/providers/test-and-save', {
      provider,
      authorization: {
        operationId: randomUUID(),
        authorized: true,
        allowTextFallback: false,
        stopOnFirstFailure: true,
        maxCalls: 1,
        planFingerprint: plan.body.planFingerprint,
      },
    });
    expect(result.status).toBe(201);
    return result.body;
  };

  it('Responses 不继承旧扩展；新服务复用原证明恢复兼容配置且不重发', async () => {
    const input = {
      ...providerInput('profile-roundtrip'),
      authMode: 'api_key',
      apiKey: 'fixture-profile-secret-value',
      compatibilityExtensionProfile: 'openrouter-v1',
      modelDefaults: {},
      modelReasoning: {},
    };
    const original = await validate(input);
    const stored = await first.configs.findStored(input.name);
    const cipher = Buffer.from(stored!.encryptedCredentials!);
    const responses = {
      ...input,
      apiKey: undefined,
      compatibilityExtensionProfile: undefined,
      upstreamFormat: 'responses',
      chatImplementation: undefined,
      expectedRevision: original.updatedAt,
    };
    const changed = await validate(responses);
    expect(first.sdk.generate.mock.calls).toHaveLength(2);
    expect(first.sdk.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ adapter: 'openai-responses', apiKey: input.apiKey }),
    );
    const responseRow = await first.configs.findStored(input.name);
    expect(responseRow!.settings).not.toHaveProperty('compatibilityExtensionProfile');
    expect(Buffer.from(responseRow!.encryptedCredentials!)).toEqual(cipher);

    reloaded = await createStack();
    const restore = { ...input, apiKey: undefined, expectedRevision: changed.updatedAt };
    const plan = await reloaded.request('/ai/providers/validation-plan', restore);
    expect(plan.status).toBe(201);
    expect(plan.body.pending).toEqual([]);
    expect(plan.body.maxCalls).toBe(0);
    expect((await reloaded.request('/ai/providers', restore)).status).toBe(201);
    expect(reloaded.sdk.generate).not.toHaveBeenCalled();
    const restored = await reloaded.configs.findStored(input.name);
    expect(restored!.settings).toMatchObject({
      upstreamFormat: 'chat-completions',
      compatibilityExtensionProfile: 'openrouter-v1',
      modelDefaults: {},
      modelReasoning: {},
    });
    expect(Buffer.from(restored!.encryptedCredentials!)).toEqual(cipher);
  });
});
