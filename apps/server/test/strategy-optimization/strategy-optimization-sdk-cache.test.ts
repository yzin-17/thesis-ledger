import { describe, expect, it, vi } from 'vitest';
import { reusableOptimizationSdkCache } from '../../src/strategy-optimization/strategy-optimization-sdk-cache.js';

const identity = {
  adapter: 'openai-compatible',
  mode: 'json_validated',
  contract: { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
  configurationFingerprint: 'fingerprint-v1',
};

const execution = {
  version: 'sdk-execution-v1',
  contract: identity.contract,
  frozenPolicy: null,
  deadlineAt: null,
  generationStatus: 'complete',
  usageCompleteness: 'reported',
  requests: [
    {
      requestId: '00000000-0000-4000-8000-000000000001',
      sequence: 1,
      state: 'completed',
      reservation: {
        aiCalls: 1,
        inputTokens: 10,
        outputTokens: 10,
        cost: {
          status: 'estimated',
          amount: '0.1',
          currency: 'USD',
          source: 'fixture',
          pricingVersion: 'v1',
        },
      },
      dispatchExecutionAttempt: 1,
      preparedAt: '2026-09-19T00:00:00.000Z',
      dispatchingAt: '2026-09-19T00:00:01.000Z',
      completedAt: '2026-09-19T00:00:02.000Z',
      outcome: {
        status: 'complete',
        finishReason: 'stop',
        contract: identity.contract,
        schemaAccepted: true,
      },
      error: null,
      usageRevisions: [
        {
          revision: 1,
          usage: { status: 'reported', inputTokens: 5, outputTokens: 3 },
          cost: {
            status: 'known',
            amount: '0.05',
            currency: 'USD',
            source: 'provider',
            pricingVersion: 'v1',
          },
          recordedAt: '2026-09-19T00:00:02.000Z',
        },
      ],
      settledRevision: 1,
    },
  ],
  continuationBlockedReason: 'budget_exceeded',
};

const cacheCheck = (modelMetadata: unknown, status = 'succeeded') => {
  const prisma = {
    aiRun: { findUnique: vi.fn(async () => ({ status, modelMetadata })) },
  };
  return reusableOptimizationSdkCache(
    prisma as never,
    '00000000-0000-4000-8000-000000000002',
    identity,
  );
};

describe('strategy optimization SDK cache identity', () => {
  it('只复用同指纹的完整合法结果，并保留后续阻断原因', async () => {
    await expect(
      cacheCheck({
        sdkCacheIdentity: {
          configurationFingerprint: identity.configurationFingerprint,
          contract: { version: identity.contract.version, id: identity.contract.id },
          mode: identity.mode,
          adapter: identity.adapter,
        },
        sdkExecution: execution,
      }),
    ).resolves.toBe('budget_exceeded');
  });

  it('拒绝复用不同 Provider 配置指纹的旧结果', async () => {
    await expect(
      cacheCheck({
        sdkCacheIdentity: { ...identity, configurationFingerprint: 'fingerprint-old' },
        sdkExecution: execution,
      }),
    ).rejects.toThrow(/配置已变更/);
  });

  it('拒绝复用未通过 Schema 的非完整结果', async () => {
    await expect(
      cacheCheck({
        sdkCacheIdentity: identity,
        sdkExecution: {
          ...execution,
          generationStatus: 'incomplete',
          requests: [
            {
              ...execution.requests[0],
              outcome: {
                ...execution.requests[0]!.outcome,
                status: 'incomplete',
                schemaAccepted: false,
              },
            },
          ],
        },
      }),
    ).rejects.toThrow(/不是完整且合法/);
  });
});
