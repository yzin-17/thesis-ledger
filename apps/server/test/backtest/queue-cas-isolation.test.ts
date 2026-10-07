import { describe, expect, it, vi } from 'vitest';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';

type JobState = Record<string, unknown> & {
  id: string;
  status: string;
  executionAttempt: number;
};

const createPrisma = (initial: JobState) => {
  let stored: JobState = {
    mode: 'V3',
    input: { contractVersion: 3, schemaVersion: '3' },
    ...initial,
  };
  let beforeNextUpdate: (() => void) | undefined;
  const findUnique = vi.fn(async () => ({ ...stored }));
  const update = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      beforeNextUpdate?.();
      beforeNextUpdate = undefined;
      const matches =
        where.id === stored.id &&
        where.mode === stored.mode &&
        where.status === stored.status &&
        where.executionAttempt === stored.executionAttempt;
      if (!matches) throw Object.assign(new Error('Record changed'), { code: 'P2025' });
      stored = { ...stored, ...data };
      return { ...stored };
    },
  );

  return {
    prisma: { backtestJob: { findUnique, update } },
    read: () => ({ ...stored }),
    replace: (next: JobState) => {
      stored = { ...stored, ...next };
    },
    beforeNextUpdate: (callback: () => void) => {
      beforeNextUpdate = callback;
    },
  };
};

const createQueueService = (
  prisma: ReturnType<typeof createPrisma>,
  queue: {
    getState?: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    remove?: ReturnType<typeof vi.fn>;
  },
) => {
  const events = { publishJob: vi.fn(async () => undefined) };
  const service = new BacktestQueueService(prisma.prisma as never, queue as never, events as never);
  return { service, queue, events };
};

describe('Backtest 队列 CAS 隔离', () => {
  it('queued 读取后进入新 running attempt 时不执行取消或移除消息', async () => {
    const prisma = createPrisma({ id: 'job-1', status: 'queued', executionAttempt: 0 });
    prisma.beforeNextUpdate(() =>
      prisma.replace({ id: 'job-1', status: 'running', executionAttempt: 1 }),
    );
    const { service, queue, events } = createQueueService(prisma, {
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    });

    const result = await service.cancel('job-1');

    expect(result).toMatchObject({ status: 'running', executionAttempt: 1 });
    expect(prisma.read()).toMatchObject({ status: 'running', executionAttempt: 1 });
    expect(queue.remove).not.toHaveBeenCalled();
    expect(events.publishJob).not.toHaveBeenCalled();
  });

  it('queued 读取后已 succeeded 时保留终态与诊断', async () => {
    const prisma = createPrisma({ id: 'job-2', status: 'queued', executionAttempt: 1 });
    prisma.beforeNextUpdate(() =>
      prisma.replace({
        id: 'job-2',
        status: 'succeeded',
        executionAttempt: 2,
        errorCode: 'completed-result',
      }),
    );
    const { service, queue } = createQueueService(prisma, {
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    });

    const result = await service.cancel('job-2');

    expect(result).toMatchObject({
      status: 'succeeded',
      executionAttempt: 2,
      errorCode: 'completed-result',
    });
    expect(prisma.read()).toMatchObject({ status: 'succeeded', errorCode: 'completed-result' });
    expect(queue.remove).not.toHaveBeenCalled();
  });

  it('running 读取后成功完成时不追加取消请求', async () => {
    const prisma = createPrisma({
      id: 'job-3',
      status: 'running',
      executionAttempt: 4,
      cancelRequestedAt: null,
    });
    prisma.beforeNextUpdate(() =>
      prisma.replace({
        id: 'job-3',
        status: 'succeeded',
        executionAttempt: 4,
        cancelRequestedAt: null,
        errorCode: 'completed-result',
      }),
    );
    const { service } = createQueueService(prisma, {
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    });

    const result = await service.cancel('job-3');

    expect(result).toMatchObject({ status: 'succeeded', cancelRequestedAt: null });
    expect(prisma.read()).toMatchObject({ status: 'succeeded', cancelRequestedAt: null });
  });

  it('running 取消只写入请求时间，等待执行方收敛终态', async () => {
    const prisma = createPrisma({
      id: 'job-4',
      status: 'running',
      executionAttempt: 4,
      cancelRequestedAt: null,
    });
    const { service } = createQueueService(prisma, {
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    });

    const result = await service.cancel('job-4');

    expect(result).toMatchObject({ status: 'running', executionAttempt: 4 });
    expect(result?.cancelRequestedAt).toBeInstanceOf(Date);
    expect(prisma.read()).toMatchObject({ status: 'running', executionAttempt: 4 });
  });

  it('队列状态查询失败时记录可恢复错误且不调用 add', async () => {
    const prisma = createPrisma({
      id: 'job-5',
      status: 'queued',
      executionAttempt: 2,
      dispatchedAt: new Date('2026-09-25T00:00:00Z'),
    });
    const { service, queue, events } = createQueueService(prisma, {
      getState: vi.fn(async () => {
        throw new Error('redis unavailable');
      }),
      add: vi.fn(async () => undefined),
    });

    const result = await service.ensureEnqueued('job-5');

    expect(result).toMatchObject({
      status: 'queued',
      executionAttempt: 2,
      dispatchedAt: null,
      errorCode: 'queue_temporarily_unavailable',
    });
    expect(prisma.read()).toMatchObject({ errorCode: 'queue_temporarily_unavailable' });
    expect(queue.add).not.toHaveBeenCalled();
    expect(events.publishJob).toHaveBeenCalledWith('job-5');
  });

  it('旧 attempt 的迟到派发错误不能覆盖新 attempt 诊断', async () => {
    const prisma = createPrisma({
      id: 'job-6',
      status: 'queued',
      executionAttempt: 3,
      dispatchedAt: null,
      errorCode: null,
    });
    const newerDispatchAt = new Date('2026-09-25T00:01:00Z');
    const { service, queue } = createQueueService(prisma, {
      getState: vi.fn(async () => null),
      add: vi.fn(async () => {
        prisma.replace({
          id: 'job-6',
          status: 'queued',
          executionAttempt: 4,
          dispatchedAt: newerDispatchAt,
          errorCode: 'new-attempt-diagnostic',
        });
        throw new Error('old dispatch failed');
      }),
    });

    const result = await service.ensureEnqueued('job-6');

    expect(queue.add).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'queued',
      executionAttempt: 4,
      dispatchedAt: newerDispatchAt,
      errorCode: 'new-attempt-diagnostic',
    });
    expect(prisma.read()).toMatchObject({ errorCode: 'new-attempt-diagnostic' });
  });

  it('迟到的派发成功结果不能清除终态诊断', async () => {
    const prisma = createPrisma({
      id: 'job-7',
      status: 'queued',
      executionAttempt: 2,
      errorCode: 'queue_temporarily_unavailable',
    });
    const { service } = createQueueService(prisma, {
      getState: vi.fn(async () => null),
      add: vi.fn(async () => {
        prisma.replace({
          id: 'job-7',
          status: 'succeeded',
          executionAttempt: 2,
          errorCode: 'completed-result',
        });
      }),
    });

    const result = await service.ensureEnqueued('job-7');

    expect(result).toMatchObject({ status: 'succeeded', errorCode: 'completed-result' });
    expect(prisma.read()).toMatchObject({ status: 'succeeded', errorCode: 'completed-result' });
  });

  it('旧记录不能通过内部取消入口修改状态', async () => {
    const prisma = createPrisma({
      id: 'job-8',
      status: 'queued',
      executionAttempt: 0,
      cancelRequestedAt: null,
      mode: 'V1',
    });
    const service = new BacktestService(prisma.prisma as never, undefined, undefined, {} as never);
    await expect(service.cancel('job-8')).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
    expect(prisma.read()).toMatchObject({ status: 'queued', executionAttempt: 0 });
  });

  it('队列底层取消直接拒绝旧合同且不写库', async () => {
    const prisma = createPrisma({
      id: 'job-9', status: 'queued', executionAttempt: 0,
      mode: 'V2', input: { contractVersion: 2, schemaVersion: '2' },
    });
    const { service, events } = createQueueService(prisma, { add: vi.fn() });
    await expect(service.cancel('job-9')).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
    expect(prisma.prisma.backtestJob.update).not.toHaveBeenCalled();
    expect(events.publishJob).not.toHaveBeenCalled();
  });

  it('读取后模式被改为旧合同时 CAS 失败并拒绝取消', async () => {
    const prisma = createPrisma({ id: 'job-10', status: 'queued', executionAttempt: 0 });
    prisma.beforeNextUpdate(() => prisma.replace({
      id: 'job-10', status: 'queued', executionAttempt: 0,
      mode: 'V2', input: { contractVersion: 2, schemaVersion: '2' },
    }));
    const { service, events } = createQueueService(prisma, { add: vi.fn() });
    await expect(service.cancel('job-10')).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
    expect(prisma.read()).toMatchObject({ status: 'queued', mode: 'V2' });
    expect(events.publishJob).not.toHaveBeenCalled();
  });
});
