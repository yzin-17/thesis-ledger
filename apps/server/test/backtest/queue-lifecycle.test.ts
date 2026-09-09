import { describe, expect, it, vi } from 'vitest';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';

describe('Backtest BullMQ 生命周期', () => {
  it('Redis 暂时不可用时保留 queued 任务并记录可恢复错误', async () => {
    let state = {
      id: '11111111-1111-4111-8111-111111111117',
      status: 'queued',
      executionAttempt: 0,
      dispatchedAt: null,
      errorCode: null,
      errorSummary: null,
    };
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => state),
        update: vi.fn(async ({ data }: { data: Partial<typeof state> }) => {
          state = { ...state, ...data };
          return state;
        }),
      },
    };
    const queue = {
      add: vi.fn(async () => {
        throw new Error('redis unavailable');
      }),
    };
    const events = { publishJob: vi.fn(async () => undefined) };
    const service = new BacktestQueueService(prisma as never, queue as never, events as never);

    const result = await service.ensureEnqueued(state.id);

    expect(result).toMatchObject({
      status: 'queued',
      dispatchedAt: null,
      errorCode: 'queue_temporarily_unavailable',
    });
    expect(events.publishJob).toHaveBeenCalledWith(state.id);
  });

  it('queued 取消立即进入终态并移除等待消息', async () => {
    let state = {
      id: '11111111-1111-4111-8111-111111111118',
      status: 'queued',
      executionAttempt: 0,
      dispatchedAt: new Date('2025-01-03'),
      errorCode: null,
      errorSummary: null,
      cancelRequestedAt: null as Date | null,
      finishedAt: null as Date | null,
      progress: 0,
    };
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => state),
        update: vi.fn(async ({ data }: { data: Partial<typeof state> }) => {
          state = { ...state, ...data };
          return state;
        }),
      },
    };
    const queue = { add: vi.fn(), remove: vi.fn(async () => undefined) };
    const events = { publishJob: vi.fn(async () => undefined) };
    const service = new BacktestQueueService(prisma as never, queue as never, events as never);

    const result = await service.cancel(state.id);

    expect(result).toMatchObject({ status: 'cancelled', progress: 100 });
    expect(queue.remove).toHaveBeenCalledWith(state.id);
    expect(events.publishJob).toHaveBeenCalledWith(state.id);
  });

  it('running 取消只登记请求，由 Worker 在安全边界收敛终态', async () => {
    let state = {
      id: '11111111-1111-4111-8111-111111111119',
      status: 'running',
      cancelRequestedAt: null as Date | null,
    };
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => state),
        update: vi.fn(async ({ data }: { data: Partial<typeof state> }) => {
          state = { ...state, ...data };
          return state;
        }),
      },
    };
    const queue = { add: vi.fn(), remove: vi.fn() };
    const events = { publishJob: vi.fn(async () => undefined) };
    const service = new BacktestQueueService(prisma as never, queue as never, events as never);

    const result = await service.cancel(state.id);

    expect(result!.status).toBe('running');
    expect(result!.cancelRequestedAt).toBeInstanceOf(Date);
    expect(queue.remove).not.toHaveBeenCalled();
  });
});
