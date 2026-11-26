import { describe, expect, it, vi } from 'vitest';
import { BacktestQueueReconciler } from '../../src/backtest/backtest-queue.reconciler.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { runBacktestAttempt } from '../../src/backtest/backtest-run-attempt.js';
import type { BacktestJob } from '@prisma/client';

type TestJob = Record<string, unknown> & {
  id: string;
  mode: string;
  status: string;
  executionAttempt: number;
  cancelRequestedAt: Date | null;
};

const runId = '11111111-1111-4111-8111-111111111302';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

function matchesJobStatus(expected: unknown, actual: string) {
  if (typeof expected === 'string' && expected !== actual) return false;
  const status = expected;
  if (status && typeof status === 'object' && 'notIn' in status && Array.isArray(status.notIn) && status.notIn.includes(actual)) return false;
  if (
    status &&
    typeof status === 'object' &&
    'in' in status &&
    Array.isArray(status.in) &&
    !status.in.includes(actual)
  ) {
    return false;
  }

  return true;
}
function matchesJobAttempt(attempt: unknown, actual: number) {
  if (typeof attempt === 'number' && attempt !== actual) return false;
  if (
    attempt &&
    typeof attempt === 'object' &&
    'lt' in attempt &&
    typeof attempt.lt === 'number' &&
    actual >= attempt.lt
  ) {
    return false;
  }

  return true;
}
function matchesJobCancellation(cancelRequestedAt: unknown, actual: Date | null) {
  if (cancelRequestedAt === null && actual !== null) return false;
  if (
    cancelRequestedAt &&
    typeof cancelRequestedAt === 'object' &&
    'not' in cancelRequestedAt &&
    cancelRequestedAt.not === null &&
    actual === null
  ) {
    return false;
  }
  return true;
}

const createState = (initial: TestJob, beforeFirstFindUnique?: () => Promise<void>) => {
  let job = { ...initial };
  let firstFindUnique = true;

  const matches = (where: Record<string, unknown>) => {
    if (where.id !== undefined && where.id !== job.id) return false;
    if (where.mode !== undefined && where.mode !== job.mode) return false;
    if (!matchesJobStatus(where.status, job.status)) return false;
    if (!matchesJobAttempt(where.executionAttempt, job.executionAttempt)) return false;
    if (!matchesJobCancellation(where.cancelRequestedAt, job.cancelRequestedAt)) return false;
    return true;
  };

  const findUnique = vi.fn(async () => {
    const snapshot = { ...job };
    if (beforeFirstFindUnique && firstFindUnique) {
      firstFindUnique = false;
      await beforeFirstFindUnique();
    }
    return snapshot;
  });
  const updateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!matches(where)) return { count: 0 };
      job = { ...job, ...data };
      return { count: 1 };
    },
  );
  const update = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!matches(where)) throw Object.assign(new Error('Record changed'), { code: 'P2025' });
      job = { ...job, ...data };
      return { ...job };
    },
  );
  const findMany = vi.fn(async () => [{ ...job }]);

  return {
    prisma: { backtestJob: { findMany, findUnique, updateMany, update } },
    read: () => ({ ...job }),
    replace: (next: TestJob) => {
      job = { ...next };
    },
  };
};

const testJob = (patch: Partial<TestJob> = {}): TestJob => ({
  id: runId,
  mode: 'frozen',
  status: 'running',
  stage: 'running',
  progress: 10,
  executionAttempt: 1,
  cancelRequestedAt: null,
  input: { contractVersion: 1, schemaVersion: 'backtest-trade-run-v1' },
  createdAt: new Date('2026-09-25T00:00:00Z'),
  dispatchedAt: new Date(),
  ...patch,
});

it('执行进程只从持久取消轮询停止，入口本地controller不共享，停止与终态独立记录', async () => {
  const state = createState(testJob({ status: 'queued', executionAttempt: 0, engineVersion: null }));
  const started = deferred<void>(), controllers = new Map<string, AbortController>();
  let stoppedAt = 0;
  const execution = runBacktestAttempt({ prisma: state.prisma as never, job: state.read() as unknown as BacktestJob,
    runnerId: 'fixture-runner-v1', activeControllers: controllers,
    execute: async (_job, signal) => {
      started.resolve();
      try {
        while (true) {
          signal.throwIfAborted();
          for (let n = 0; n < 10_000; n++) Math.sqrt(n);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } finally { stoppedAt = performance.now(); }
    }, classifyFailure: () => ({ code: 'unexpected', summary: '不应按计算失败重试', retryable: false }),
  });
  await started.promise;
  const api = new BacktestQueueService(state.prisma as never, { add: vi.fn(), remove: vi.fn() } as never, { publishJob: async () => undefined } as never);
  await api.cancel(runId);
  const registeredAt = performance.now();
  expect(state.read()).toMatchObject({ status: 'running', cancelRequestedAt: expect.any(Date) });
  const result = await execution;
  expect(stoppedAt - registeredAt).toBeLessThan(5_000);
  expect(result?.status).toBe('cancelled');
  expect(controllers.size).toBe(0);
  expect(state.read().result).toBeUndefined();
});

const createServices = (
  state: ReturnType<typeof createState>,
  queue: {
    getState: (jobId: string) => Promise<string | null>;
    add: (jobId: string) => Promise<unknown>;
    remove: (jobId: string) => Promise<void>;
  },
) => {
  const events = { publishJob: vi.fn(async () => undefined) };
  const queueService = new BacktestQueueService(state.prisma as never, queue, events);
  const reconciler = new BacktestQueueReconciler(
    state.prisma as never,
    queueService,
    queue,
    events,
  );
  return { events, queueService, reconciler };
};

describe('retry generation and cancellation recovery', () => {
  it.each([
    { executionAttempt: 1, cancelRequestedAt: new Date() },
    {
      executionAttempt: 1,
      input: { contractVersion: 1, schemaVersion: 'backtest-trade-run-v1', retryAttemptBase: 'invalid' },
    },
    { executionAttempt: 3 },
    { executionAttempt: 1 },
  ])('恢复 CAS 拒绝队列探测期间变为旧模式的记录 %j', async (patch) => {
    const state = createState(testJob(patch));
    const probe = deferred<string | null>();
    const queue = {
      getState: vi.fn(() => probe.promise),
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const { events, reconciler } = createServices(state, queue);
    const recovery = reconciler.reconcile();
    await vi.waitFor(() => expect(queue.getState).toHaveBeenCalledOnce());
    const legacy = { ...state.read(), mode: 'V2' };
    state.replace(legacy);
    probe.resolve(null);
    await recovery;
    expect(state.read()).toEqual(legacy);
    expect(queue.add).not.toHaveBeenCalled();
    expect(events.publishJob).not.toHaveBeenCalled();
    expect(state.prisma.backtestJob.updateMany).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing', null],
    ['failed', 'failed'],
    ['completed', 'completed'],
  ] as const)(
    'acknowledges a running cancellation only after the queue confirms %s execution is terminal',
    async (_label, queueState) => {
      const state = createState(
        testJob({ status: 'running', executionAttempt: 2, cancelRequestedAt: new Date() }),
      );
      const queue = {
        getState: vi.fn(async () => queueState),
        add: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      };
      const { events, reconciler } = createServices(state, queue);

      await reconciler.reconcile();

      expect(state.read()).toMatchObject({
        status: 'cancelled',
        stage: 'cancelled',
        executionAttempt: 2,
        cancelRequestedAt: expect.any(Date),
      });
      expect(queue.add).not.toHaveBeenCalled();
      expect(events.publishJob).toHaveBeenCalledOnce();
      expect(state.prisma.backtestJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: runId,
            mode: 'frozen',
            status: 'running',
            executionAttempt: 2,
            cancelRequestedAt: { not: null },
          },
        }),
      );
    },
  );

  it.each([
    ['active', async () => 'active'],
    ['query failure', async () => Promise.reject(new Error('redis unavailable'))],
  ])('preserves a running cancellation request while the queue is %s', async (_label, getState) => {
    const cancelRequestedAt = new Date();
    const state = createState(testJob({ status: 'running', cancelRequestedAt }));
    const queue = {
      getState: vi.fn(getState),
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const { reconciler } = createServices(state, queue);

    await reconciler.reconcile();

    expect(state.read()).toMatchObject({ status: 'running', cancelRequestedAt });
    expect(state.prisma.backtestJob.updateMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each([1, 3])(
    'does not requeue or exhaust attempt %i when cancellation arrives during the queue probe',
    async (executionAttempt) => {
      const state = createState(testJob({ status: 'running', executionAttempt }));
      const probe = deferred<string | null>();
      const queue = {
        getState: vi.fn(() => probe.promise),
        add: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      };
      const { queueService, reconciler } = createServices(state, queue);

      const reconciliation = reconciler.reconcile();
      await vi.waitFor(() => expect(queue.getState).toHaveBeenCalledOnce());
      await queueService.cancel(runId);
      probe.resolve(null);
      await reconciliation;

      expect(state.read()).toMatchObject({
        status: 'running',
        executionAttempt,
        cancelRequestedAt: expect.any(Date),
      });
      expect(queue.add).not.toHaveBeenCalled();
    },
  );
});
