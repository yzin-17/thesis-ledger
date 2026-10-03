import { describe, expect, it, vi } from 'vitest';
import { BacktestQueueReconciler } from '../../src/backtest/backtest-queue.reconciler.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';

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

const createState = (initial: TestJob, beforeFirstFindUnique?: () => Promise<void>) => {
  let job = { ...initial };
  let firstFindUnique = true;

  const matches = (where: Record<string, unknown>) => {
    if (where.id !== undefined && where.id !== job.id) return false;
    if (where.mode !== undefined && where.mode !== job.mode) return false;
    if (typeof where.status === 'string' && where.status !== job.status) return false;
    const status = where.status;
    if (
      status &&
      typeof status === 'object' &&
      'in' in status &&
      Array.isArray(status.in) &&
      !status.in.includes(job.status)
    ) {
      return false;
    }

    const attempt = where.executionAttempt;
    if (typeof attempt === 'number' && attempt !== job.executionAttempt) return false;
    if (
      attempt &&
      typeof attempt === 'object' &&
      'lt' in attempt &&
      typeof attempt.lt === 'number' &&
      job.executionAttempt >= attempt.lt
    ) {
      return false;
    }

    const cancelRequestedAt = where.cancelRequestedAt;
    if (cancelRequestedAt === null && job.cancelRequestedAt !== null) return false;
    if (
      cancelRequestedAt &&
      typeof cancelRequestedAt === 'object' &&
      'not' in cancelRequestedAt &&
      cancelRequestedAt.not === null &&
      job.cancelRequestedAt === null
    ) {
      return false;
    }
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
  mode: 'V3',
  status: 'running',
  stage: 'running',
  progress: 10,
  executionAttempt: 1,
  cancelRequestedAt: null,
  input: { contractVersion: 3, schemaVersion: '3' },
  createdAt: new Date('2026-09-25T00:00:00Z'),
  dispatchedAt: new Date(),
  ...patch,
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
      input: { contractVersion: 3, schemaVersion: '3', retryAttemptBase: 'invalid' },
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
            mode: 'V3',
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
