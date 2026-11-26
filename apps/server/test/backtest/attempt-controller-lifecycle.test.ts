import { expect, it, vi } from 'vitest';
import { runBacktestAttempt } from '../../src/backtest/backtest-run-attempt.js';

it.each([true, false])('失败收敛期间保留当前取消控制器，重试=%s', async (retryable) => {
  let release!: () => void;
  const settlement = new Promise<void>((resolve) => {
    release = resolve;
  });
  // 只提供本职责实际读取的持久化字段；不是数据库或协议验收样本。
  const job = {
    id: 'controlled-run',
    mode: 'frozen',
    status: 'queued',
    executionAttempt: 0,
    input: { contractVersion: 1, schemaVersion: 'backtest-trade-run-v1' },
    cancelRequestedAt: null,
    engineVersion: 'controlled-runner',
    startedAt: null,
  };
  const activeControllers = new Map<string, AbortController>();
  const failure = new Error('controlled-failure');
  let settling = false;
  const prisma = {
    backtestJob: {
      findUnique: vi.fn(async () => ({ ...job })),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.status !== 'running') {
          settling = true;
          await settlement;
        }
        Object.assign(job, data);
        return { count: 1 };
      }),
    },
  };
  const run = runBacktestAttempt({
    prisma: prisma as never,
    job: job as never,
    execution: { attempt: 1, maxAttempts: 3 },
    runnerId: 'controlled-runner',
    activeControllers,
    execute: vi.fn().mockRejectedValue(failure),
    classifyFailure: () => ({ code: 'CONTROLLED', summary: '受控失败', retryable }),
  });
  const completed = expect(run).rejects.toBe(failure);
  try {
    await vi.waitFor(() => expect(settling).toBe(true));
    expect(activeControllers.has(job.id)).toBe(true);
  } finally {
    release();
    await completed;
  }
  expect(activeControllers.has(job.id)).toBe(false);
  expect(job.status).toBe(retryable ? 'queued' : 'failed');
  expect(job.executionAttempt).toBe(1);
});
