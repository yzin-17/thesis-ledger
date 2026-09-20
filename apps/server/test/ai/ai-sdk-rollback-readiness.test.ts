import { describe, expect, it } from 'vitest';
import { aiGenerationContracts, type AiExecutionSummary } from '@thesis-ledger/schemas';
import { assessAiSdkRollbackReadiness } from '../../src/ai/ai-sdk-rollback-readiness.js';

const execution = (state: 'prepared' | 'dispatching' | 'completed'): AiExecutionSummary => ({
  version: 'sdk-execution-v1',
  contract: aiGenerationContracts.research.ref,
  frozenPolicy: null,
  deadlineAt: null,
  generationStatus: state === 'completed' ? 'complete' : 'pending',
  usageCompleteness: 'unknown',
  continuationBlockedReason: null,
  requests: [
    {
      requestId: '11111111-1111-4111-8111-111111111111',
      sequence: 1,
      state,
      reservation: {
        aiCalls: 1,
        inputTokens: 10,
        outputTokens: 10,
        cost: {
          status: 'unknown',
          amount: null,
          currency: null,
          source: null,
          pricingVersion: null,
        },
      },
      dispatchExecutionAttempt: state === 'prepared' ? null : 1,
      preparedAt: '2026-09-19T00:00:00.000Z',
      dispatchingAt: state === 'prepared' ? null : '2026-09-19T00:00:01.000Z',
      completedAt: state === 'completed' ? '2026-09-19T00:00:02.000Z' : null,
      outcome:
        state === 'completed'
          ? {
              status: 'complete',
              finishReason: 'stop',
              contract: aiGenerationContracts.research.ref,
              schemaAccepted: true,
            }
          : null,
      error: null,
      usageRevisions: [],
      settledRevision: 0,
    },
  ],
});

describe('AI SDK 回滚预检', () => {
  it('兼容读取 legacy 与新版终态事实，并保留 unknown 防重放清单', () => {
    const result = assessAiSdkRollbackReadiness(
      [
        { id: 'legacy', status: 'succeeded', errorCode: null, modelMetadata: null },
        {
          id: 'sdk',
          status: 'succeeded',
          errorCode: null,
          modelMetadata: { sdkExecution: execution('completed') },
        },
        {
          id: 'unknown',
          status: 'failed',
          errorCode: 'research_unknown_outcome',
          modelMetadata: { sdkExecution: execution('completed') },
        },
      ],
      [{ id: 'attempt-unknown', status: 'unknown_outcome', aiRunId: 'unknown' }],
    );

    expect(result.decision).toBe('ready');
    expect(result.counts).toMatchObject({ sdkFacts: 2, legacyFacts: 1 });
    expect(result.ids.protectedUnknownRunIds).toEqual(['unknown']);
    expect(result.ids.protectedUnknownAttemptIds).toEqual(['attempt-unknown']);
  });

  it('在途、未结算或损坏的新事实要求回滚后继续停用任务', () => {
    const result = assessAiSdkRollbackReadiness(
      [
        {
          id: 'running',
          status: 'running',
          errorCode: null,
          modelMetadata: { sdkExecution: execution('dispatching') },
        },
        {
          id: 'invalid',
          status: 'failed',
          errorCode: null,
          modelMetadata: { sdkExecution: { version: 'future' } },
        },
      ],
      [{ id: 'attempt-running', status: 'running', aiRunId: 'running' }],
    );

    expect(result.decision).toBe('keep_tasks_disabled');
    expect(result.blockers).toEqual([
      'active_ai_runs',
      'active_optimization_attempts',
      'invalid_sdk_execution_facts',
      'unsettled_sdk_requests',
    ]);
  });
});
