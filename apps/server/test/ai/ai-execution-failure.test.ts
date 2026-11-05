import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  aiExecutionSummarySchema,
  DEFAULT_AI_RESEARCH_POLICY_V1,
  type AiRequestAttempt,
} from '@thesis-ledger/schemas';
import { failedAiExecution } from '../../src/ai/ai-execution-failure.js';

const now = new Date('2026-10-27T00:00:00Z'),
  id = randomUUID();
const request = (state: 'prepared' | 'dispatching'): AiRequestAttempt => ({
  requestId: id,
  sequence: 1,
  state,
  reservation: {
    aiCalls: 1,
    inputTokens: 10,
    outputTokens: 10,
    cost: {
      status: 'estimated',
      amount: '0',
      currency: 'USD',
      source: 'fixture',
      pricingVersion: 'v1',
    },
  },
  dispatchExecutionAttempt: state === 'prepared' ? null : 1,
  preparedAt: now.toISOString(),
  dispatchingAt: state === 'prepared' ? null : now.toISOString(),
  completedAt: null,
  outcome: null,
  error: null,
  usageRevisions: [],
  settledRevision: 0,
});
const execution = (state: 'prepared' | 'dispatching') =>
  aiExecutionSummarySchema.parse({
    version: 'sdk-execution-v1',
    contract: { id: 'research', version: 'research-generation-v2' },
    frozenPolicy: DEFAULT_AI_RESEARCH_POLICY_V1,
    deadlineAt: now.toISOString(),
    generationStatus: 'pending',
    usageCompleteness: 'unknown',
    requests: [request(state)],
    continuationBlockedReason: null,
  });
const unsent = {
  code: 'task_budget_exhausted' as const,
  phase: 'preflight' as const,
  summary: '授权期间预算已耗尽',
  externalResult: 'not_sent' as const,
  requestId: id,
};

describe('任务失败保留未发送事实', () => {
  it('未授权预留保持prepared，不伪造成一次Provider完成', () => {
    const updated = failedAiExecution(
      execution('prepared'),
      { requestError: unsent, continuationBlockedReason: 'expired' },
      now,
    );
    expect(updated.requests[0]).toMatchObject({
      state: 'prepared',
      error: { externalResult: 'not_sent' },
      dispatchExecutionAttempt: null,
      outcome: null,
      completedAt: null,
    });
    expect(updated.generationStatus).toBe('incomplete');
  });
  it('已获授权但确定未发送可收敛incomplete，不留悬空dispatching', () => {
    const updated = failedAiExecution(execution('dispatching'), { requestError: unsent }, now);
    expect(updated.requests[0]).toMatchObject({
      state: 'completed',
      dispatchExecutionAttempt: 1,
      error: { externalResult: 'not_sent' },
      outcome: { status: 'incomplete', schemaAccepted: false },
    });
    expect(updated.requests[0]?.usageRevisions).toEqual([]);
  });
  it('未知外部结果不能通过未发送收尾路径改写', () => {
    const updated = failedAiExecution(
      execution('dispatching'),
      { requestError: { ...unsent, externalResult: 'unknown' } },
      now,
    );
    expect(updated.requests[0]).toMatchObject({
      state: 'dispatching',
      error: null,
      completedAt: null,
    });
  });
});
