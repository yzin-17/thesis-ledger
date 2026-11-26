import { describe, expect, it, vi } from 'vitest';
import { AuthoringAttemptRunner } from '../../src/strategy-authoring/authoring-attempt.js';
import { authoringPricingFingerprint } from '../../src/strategy-authoring/authoring-model-policy.js';

function fixture(elapsedMs: number) {
  const provider = {
    id: 'controlled', models: ['model'], metadata: {},
    sdkRuntime: () => ({ baseURL: 'http://127.0.0.1:1/v1', apiKey: '', authMode: 'none' }),
  };
  const operation = {
    id: 'operation', ownerId: 'owner', attempt: 1, revision: 1,
    startedAt: new Date(Date.now() - elapsedMs),
    input: {
      selection: { kind: 'analyze', providerId: 'controlled', model: 'model',
        configurationFingerprint: 'configuration', pricingFingerprint: authoringPricingFingerprint(provider as never, 'model') },
      content: { title: '时间边界验证', description: '价格上穿均线时买入', questions: [], requirements: [], runtimeIntents: [], removedRequirements: [], definitionText: '', manualChanges: [] },
    },
  };
  const dependencies = {
    operations: { renew: vi.fn(async () => operation) },
    providers: { refreshRegistry: vi.fn(async () => undefined) },
    registry: { strictReadyContract: () => ({ provider, execution: { mode: 'native_schema', adapter: 'openai-compatible-chat', readiness: { configurationFingerprint: 'configuration' }, liveValidation: { status: 'passed' } } }) },
    audit: { prepare: vi.fn(async () => undefined), append: vi.fn(async () => undefined) },
    sdk: { generate: vi.fn(async () => { throw new Error('AUTHORING_CONTROLLED_STOP'); }) },
  };
  const runner = new AuthoringAttemptRunner(operation as never, new AbortController().signal, dependencies as never);
  return { runner, dependencies };
}

describe('编写总时长与派发边界', () => {
  it('超过原两分钟边界仍可派发，SDK 只能使用五分钟内的剩余预算', async () => {
    const { runner, dependencies } = fixture(130_000);
    await runner.run();
    expect(dependencies.sdk.generate).toHaveBeenCalledOnce();
    const request = dependencies.sdk.generate.mock.calls[0] as unknown as [{ timeout: { totalMs: number }; signal: AbortSignal }];
    expect(request[0].timeout.totalMs).toBeGreaterThan(165_000);
    expect(request[0].timeout.totalMs).toBeLessThanOrEqual(170_000);
    expect(request[0].signal.aborted).toBe(false);
  });

  it('超过五分钟边界不派发新调用，保留明确未发送结果', async () => {
    const { runner, dependencies } = fixture(310_000);
    const result = await runner.run();
    expect(dependencies.sdk.generate).not.toHaveBeenCalled();
    expect(result.externalResult).toBe('not_sent');
    expect(result.errorCode).toBe('AUTHORING_LEASE_LOST');
  });
});
