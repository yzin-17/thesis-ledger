import { describe, expect, it, vi } from 'vitest';
import { aiGenerationContracts, DEFAULT_AI_RESEARCH_POLICY_V1 } from '@thesis-ledger/schemas';
import { recoverStaleAiRuns } from '../../src/ai/ai-run-recovery.js';

describe('研究恢复按 SDK 契约识别归属', () => {
  it.each(['prepared', 'dispatching'] as const)(
    '自定义 prompt 的 %s 状态不走通用重排',
    async (state) => {
      const now = new Date('2026-10-05T12:00:00.000Z');
      const request = {
        requestId: '00000000-0000-4000-8000-000000000001',
        sequence: 1,
        state,
        preparedAt: now.toISOString(),
        dispatchingAt: state === 'dispatching' ? now.toISOString() : null,
        dispatchExecutionAttempt: state === 'dispatching' ? 1 : null,
        completedAt: null,
        outcome: null,
        error: null,
        usageRevisions: [],
        settledRevision: 0,
        reservation: {
          aiCalls: 1,
          inputTokens: 10,
          outputTokens: 10,
          cost: {
            status: 'unknown',
            amount: null,
            currency: null,
            source: 'provider_cost_unavailable',
            pricingVersion: null,
          },
          provider: 'fixture',
          model: 'fixture-model',
          configurationFingerprint: 'fixture-fingerprint',
        },
      };
      const findMany = vi.fn(async () => [
        {
          id: 'custom-prompt-run',
          executionAttempt: 1,
          modelMetadata: {
            sdkExecution: {
              version: 'sdk-execution-v1',
              contract: aiGenerationContracts.research.ref,
              frozenPolicy: DEFAULT_AI_RESEARCH_POLICY_V1,
              deadlineAt: now.toISOString(),
              generationStatus: 'incomplete',
              usageCompleteness: 'unknown',
              requests: [request],
              continuationBlockedReason: null,
            },
          },
        },
      ]);
      const updateMany = vi
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 0 });
      updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
      const result = await recoverStaleAiRuns({ aiRun: { findMany, updateMany } } as never, now, 3);
      expect(updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            id: 'custom-prompt-run',
            status: 'running',
            executionAttempt: 1,
            leaseUntil: { lt: now },
          },
          data: expect.objectContaining({
            status: state === 'prepared' ? 'queued' : 'failed',
            errorCode:
              state === 'prepared' ? 'research_lease_recovered' : 'research_unknown_outcome',
          }),
        }),
      );
      for (const call of updateMany.mock.calls.slice(2)) {
        expect(call[0]).toMatchObject({ where: { id: { notIn: ['custom-prompt-run'] } } });
      }
      expect(result).toMatchObject({
        requeued: state === 'prepared' ? 1 : 0,
        failed: state === 'dispatching' ? 1 : 0,
      });
    },
  );
});
