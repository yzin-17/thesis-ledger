import { describe, expect, it } from 'vitest';
import { aiExecutionSummarySchema, DEFAULT_AI_RESEARCH_POLICY_V1 } from '@thesis-ledger/schemas';
import { aiExecutionPublication } from '../../src/ai/ai-execution-publication.js';
import {
  queuedResearchClock,
  startResearchClock,
} from '../../src/ai/timeout/ai-execution-clock.js';

const first = Date.parse('2026-10-27T00:00:00Z');
const prepared = aiExecutionSummarySchema.parse({
  version: 'sdk-execution-v1',
  contract: { id: 'research', version: 'research-generation-v2' },
  frozenPolicy: DEFAULT_AI_RESEARCH_POLICY_V1,
  deadlineAt: null,
  timing: queuedResearchClock(DEFAULT_AI_RESEARCH_POLICY_V1, {}, first),
  generationStatus: 'pending',
  usageCompleteness: 'unknown',
  requests: [],
  continuationBlockedReason: null,
});
const execution = startResearchClock({
  execution: prepared,
  firstStartedAt: null,
  executionAttempt: 0,
  now: first,
})!;
const deadline = Date.parse(execution.deadlineAt!);
const input = (receivedAt: number) => ({
  result: { accepted: '仅本地夹具' },
  finalization: { provider: 'local', model: 'model-a', receivedAt: new Date(receivedAt) },
});

describe('研究成功结果的发布期限', () => {
  it('按时接收的结果可使用原总预算内的收尾预留发布', () => {
    const result = aiExecutionPublication(
      execution,
      input(deadline - 5_001),
      new Date(deadline - 4_000),
      new Date(deadline - 1),
    );
    expect(result.blocked).toBeNull();
    expect(result.data).toMatchObject({ status: 'succeeded', result: { accepted: '仅本地夹具' } });
  });
  it('在执行截止后才到达的结果不能发布为成功', () => {
    const result = aiExecutionPublication(
      execution,
      input(deadline - 4_999),
      new Date(deadline - 4_000),
      new Date(deadline - 3_000),
    );
    expect(result.blocked).toBe('expired');
    expect(result.data).toMatchObject({
      status: 'failed',
      errorCode: 'research_task_budget_exhausted',
    });
    expect(result.data).not.toHaveProperty('result');
    expect(execution.requests).toEqual([]);
  });
  it('锁等待或收尾跨过任务总期限时拒绝成功，不相信早于当前的completedAt', () => {
    const result = aiExecutionPublication(
      execution,
      input(deadline - 8_000),
      new Date(deadline - 7_000),
      new Date(deadline),
    );
    expect(result.blocked).toBe('expired');
    expect(result.data.status).toBe('failed');
    expect(result.data).not.toHaveProperty('result');
  });
  it('缺少冻结期限失败关闭，不给结果重新授予预算', () => {
    const result = aiExecutionPublication(prepared, input(first), new Date(first), new Date(first));
    expect(result.data.errorCode).toBe('research_policy_missing');
    expect(result.data).not.toHaveProperty('result');
  });
  it('没有业务发布的事实结算不被改成成功或超时', () => {
    const result = aiExecutionPublication(
      execution,
      {},
      new Date(deadline + 1),
      new Date(deadline + 1),
    );
    expect(result).toEqual({ data: {}, blocked: null });
  });
});
