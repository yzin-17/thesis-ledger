import { describe, expect, it, vi } from 'vitest';
import { BacktestQueueReconciler } from '../../src/backtest/backtest-queue.reconciler.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';

const createFixture = (executionAttempt: number, queueState: string | null) => {
  let state = {
    id: '11111111-1111-4111-8111-111111111130',
    status: 'running',
    executionAttempt,
    dispatchedAt: new Date(),
    errorCode: null as string | null,
    errorSummary: null as string | null,
  };
  const prisma = {
    backtestJob: {
      findMany: vi.fn(async () => [state]),
      findUnique: vi.fn(async () => state),
      update: vi.fn(async ({ data }: { data: Partial<typeof state> }) => {
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
});
