import { describe, expect, it, vi } from 'vitest';
import { aiExecutionReadModelSchema } from '@thesis-ledger/schemas';
import { observeAiRun } from '../../src/ai/ai-run-observer.js';
import { createAiTimeoutPolicy } from '../../src/ai/timeout/ai-timeout-policy.js';

const id = '11111111-1111-4111-8111-111111111111';
const execution = (deadline = 5000) =>
  aiExecutionReadModelSchema.parse({
    version: 'sdk-execution-v1',
    contract: { id: 'research', version: 'research-generation-v1' },
    frozenPolicy: null,
    deadlineAt: new Date(deadline).toISOString(),
    generationStatus: 'pending',
    usageCompleteness: 'unknown',
    requests: [],
    continuationBlockedReason: null,
    timing: {
      policy: createAiTimeoutPolicy('research'),
      queueExpiresAt: new Date(2000).toISOString(),
      firstStartedAt: null,
      taskDeadlineAt: new Date(deadline).toISOString(),
      origin: 'legacy_deadline',
    },
  });
describe('只读任务观察', () => {
  it('无效API状态不冒充后台终态', async () => {
    expect(
      await observeAiRun({ runId: id, read: async () => ({ id, status: 'unknown' }) }),
    ).toMatchObject({ kind: 'pending', reason: 'read_unavailable' });
  });
  it('从排队期限切换至持久化执行期限，读到终态才报告完成', async () => {
    let now = 0,
      reads = 0;
    const receipt = await observeAiRun({
      runId: id,
      now: () => now,
      wait: async (ms) => {
        now += ms;
      },
      read: async () => ({
        id,
        status: ['queued', 'running', 'completed'][reads++]!,
        execution: execution(),
      }),
    });
    expect(receipt).toMatchObject({
      kind: 'settled',
      reason: 'persisted_terminal',
      status: 'completed',
      runId: id,
    });
    expect(reads).toBe(3);
  });
  it('观察窗口结束保留任务ID和运行状态，不能伪造Provider终态', async () => {
    let now = 0;
    const read = vi.fn(async () => ({ id, status: 'running', execution: execution() }));
    const receipt = await observeAiRun({
      runId: id,
      now: () => now,
      observationDeadlineAt: 10,
      wait: async (ms) => {
        now += ms;
      },
      read,
    });
    expect(receipt).toMatchObject({
      kind: 'pending',
      reason: 'observation_timeout',
      status: 'running',
      runId: id,
    });
    expect(receipt.execution?.deadlineAt).toBe(new Date(5000).toISOString());
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('观察取消仅停止GET轮询，不调用业务取消', async () => {
    const parent = new AbortController(),
      read = vi.fn(async () => ({ id, status: 'running', execution: execution() }));
    expect(
      await observeAiRun({
        runId: id,
        signal: parent.signal,
        now: () => 0,
        read,
        wait: async () => {
          parent.abort();
        },
      }),
    ).toMatchObject({ kind: 'pending', reason: 'observer_stopped', status: 'running' });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('读取失败与没有历史时钟都保留待确认，不补新预算', async () => {
    expect(
      await observeAiRun({
        runId: id,
        read: async () => {
          throw new Error('gateway');
        },
      }),
    ).toMatchObject({ kind: 'pending', reason: 'read_unavailable' });
    expect(
      await observeAiRun({ runId: id, read: async () => ({ id, status: 'running' }) }),
    ).toMatchObject({ kind: 'pending', reason: 'execution_clock_missing' });
  });
});
