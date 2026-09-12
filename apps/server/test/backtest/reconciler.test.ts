import { describe, expect, it, vi } from 'vitest';
import { BacktestQueueReconciler } from '../../src/backtest/backtest-queue.reconciler.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';

const createFixture = (executionAttempt: number, queueState: string | null) => {
  let state: Record<string, unknown> = {
    id: '11111111-1111-4111-8111-111111111130',
    status: 'running',
    executionAttempt,
    createdAt: new Date('2026-09-09T00:00:00Z'),
    dispatchedAt: new Date(),
    errorCode: null,
    errorSummary: null,
  };
  const matches = (where: Record<string, unknown>) => {
    if (where.id !== undefined && where.id !== state.id) return false;
    if (typeof where.status === 'string' && where.status !== state.status) return false;
    if (
      typeof where.executionAttempt === 'number' &&
      where.executionAttempt !== state.executionAttempt
    )
      return false;
    return true;
  };
  const prisma = {
    backtestJob: {
      findMany: vi.fn(async () => [state]),
      findUnique: vi.fn(async () => state),
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (!matches(where)) return { count: 0 };
          state = { ...state, ...data };
          return { count: 1 };
        },
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state = { ...state, ...data };
        return state;
      }),
    },
  };
  const queue = {
    getState: vi.fn(async () => queueState),
    remove: vi.fn(async () => undefined),
    add: vi.fn(async () => undefined),
  };
  const events = { publishJob: vi.fn(async () => undefined) };
  const queueService = new BacktestQueueService(prisma as never, queue, events);
  return {
    state: () => state,
    queue,
    reconciler: new BacktestQueueReconciler(prisma as never, queueService, queue, events),
  };
};

describe('Backtest 队列协调器', () => {
  it('Worker 中断且 BullMQ 留下失败记录时移除旧记录并重新排队', async () => {
    const fixture = createFixture(1, 'failed');

    await fixture.reconciler.reconcile();

    expect(fixture.queue.remove).toHaveBeenCalledOnce();
    expect(fixture.queue.add).toHaveBeenCalledOnce();
    expect(fixture.state()).toMatchObject({ status: 'queued', errorCode: null });
  });

  it('数据库 attempt 达到上限且队列任务缺失时写入 failed', async () => {
    const fixture = createFixture(3, null);

    await fixture.reconciler.reconcile();

    expect(fixture.queue.add).not.toHaveBeenCalled();
    expect(fixture.state()).toMatchObject({
      status: 'failed',
      errorCode: 'worker_attempts_exhausted',
    });
  });

  it('Redis 查询失败时不把 running 误判为 Worker 中断', async () => {
    const fixture = createFixture(1, null);
    fixture.queue.getState.mockRejectedValueOnce(new Error('redis unavailable'));

    await fixture.reconciler.reconcile();

    expect(fixture.state()).toMatchObject({ status: 'running', executionAttempt: 1 });
    expect(fixture.queue.add).not.toHaveBeenCalled();
  });

  it('分页处理超过 100 条非终态任务，不让后续任务长期饥饿', async () => {
    const states = Array.from({ length: 101 }, (_, index) => ({
      id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
      status: 'queued',
      executionAttempt: 0,
      createdAt: new Date(`2026-09-09T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`),
      dispatchedAt: null as Date | null,
      errorCode: null as string | null,
      errorSummary: null as string | null,
    }));
    const byId = new Map(states.map((state) => [state.id, state]));
    const findMany = vi.fn(async ({ where }: { where: { OR?: unknown[] } }) =>
      where.OR ? states.slice(100) : states.slice(0, 100),
    );
    const prisma = {
      backtestJob: {
        findMany,
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => byId.get(where.id) ?? null),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(
          async ({ where, data }: { where: { id: string }; data: Partial<(typeof states)[number]> }) => {
            const state = byId.get(where.id);
            if (!state) throw new Error('missing test job');
            Object.assign(state, data);
            return state;
          },
        ),
      },
    };
    const queue = {
      getState: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
      add: vi.fn(async () => undefined),
    };
    const events = { publishJob: vi.fn(async () => undefined) };
    const queueService = new BacktestQueueService(prisma as never, queue, events);
    const reconciler = new BacktestQueueReconciler(prisma as never, queueService, queue, events);

    await reconciler.reconcile();

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledTimes(101);
    expect(queue.add).toHaveBeenCalledWith(states[100]!.id);
  });
});
