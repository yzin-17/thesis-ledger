import { describe, expect, it, vi } from 'vitest';
import { BacktestService } from '../../src/backtest/backtest.service.js';

describe('Strategy 与 Backtest Worker', () => {
  const schema = {
    version: 1 as const,
    name: 'test',
    universe: { symbols: ['600519.SH'], asOf: '2025-01-01T00:00:00Z' },
    entrySignals: [{ indicator: 'close', operator: 'gt' as const, value: 10 }],
    exitSignals: [{ indicator: 'close', operator: 'lt' as const, value: 9 }],
    stopLoss: { type: 'fixed' as const, value: 0.1 },
    sizing: { type: 'weight' as const, value: 0.5 },
    execution: { price: 'close' as const, tPlusOne: true, lotSize: 100 },
    cost: { commissionRate: 0.0003, minimumCommission: 5, stampDutyRate: 0.0005, slippageRate: 0 },
    riskConstraints: [],
    benchmark: '000300.SH',
  };
  it('策略创建与版本修改不覆盖旧版本', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => data);
    const createVersion = vi.fn(async ({ data }: { data: object }) => data);
    const prisma = {
      strategy: { create },
      strategyVersion: {
        aggregate: vi.fn(async () => ({ _max: { version: 1 } })),
        create: createVersion,
      },
    };
    const service = new BacktestService(prisma as never);
    await service.createStrategy('test', schema);
    await service.createVersion('11111111-1111-4111-8111-111111111116', schema);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'draft' }) }),
    );
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2 }) }),
    );
  });
  it('回测默认拒绝带 partial 市场数据的输入', async () => {
    const service = new BacktestService({ backtestJob: { create: vi.fn() } } as never);
    await expect(
      service.queue({
        id: '11111111-1111-4111-8111-111111111119',
        strategyVersionId: '11111111-1111-4111-8111-111111111116',
        status: 'queued',
        period: { start: '2025-01-01', end: '2025-01-02' },
        dataAsOf: '2025-01-03T00:00:00Z',
        warnings: [],
        dataQuality: { partial: true },
      }),
    ).rejects.toThrow('默认拒绝');
  });
  it('创建任务后由服务端确保投递而不是等待 Desktop 启动', async () => {
    const created = {
      id: '11111111-1111-4111-8111-111111111119',
      status: 'queued',
      dispatchedAt: null,
    };
    const prisma = {
      strategyVersion: { findUnique: vi.fn(async () => null) },
      backtestJob: { create: vi.fn(async () => created) },
    };
    const queue = {
      ensureEnqueued: vi.fn(async () => ({ ...created, dispatchedAt: new Date('2025-01-03') })),
    };
    const service = new BacktestService(prisma as never, queue as never);

    const job = await service.queue({
      id: created.id,
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      period: { start: '2025-01-01', end: '2025-01-02' },
      dataAsOf: '2025-01-03T00:00:00Z',
      warnings: [],
    });

    expect(queue.ensureEnqueued).toHaveBeenCalledWith(created.id);
    expect(job).toMatchObject({ id: created.id, dispatchedAt: expect.any(Date) });
  });
  it('兼容运行入口只确保派发，不在 API 进程执行 Worker', async () => {
    const queued = { id: '11111111-1111-4111-8111-111111111119', status: 'queued' };
    const queue = { ensureEnqueued: vi.fn(async () => queued) };
    const service = new BacktestService({} as never, queue as never);

    await expect(service.run(queued.id)).resolves.toEqual(queued);
    expect(queue.ensureEnqueued).toHaveBeenCalledWith(queued.id);
  });
  it('任务摘要不返回回测输入与结果正文', async () => {
    const findMany = vi.fn(async () => [
      {
        id: '11111111-1111-4111-8111-111111111117',
        strategyVersionId: '11111111-1111-4111-8111-111111111116',
        status: 'succeeded',
        progress: 100,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-02'),
        dataAsOf: new Date('2025-01-03'),
        createdAt: new Date('2025-01-03'),
        updatedAt: new Date('2025-01-03'),
        startedAt: new Date('2025-01-03'),
        finishedAt: new Date('2025-01-03'),
        cancelRequestedAt: null,
        executionAttempt: 1,
        dispatchedAt: new Date('2025-01-03'),
        engineVersion: 'test-engine',
        resultChecksum: 'checksum',
        warnings: [],
        errorCode: null,
        errorSummary: null,
        input: { bars: [{ close: 10 }], initialCash: 1000 },
        result: { returns: [0.1] },
      },
    ]);
    const service = new BacktestService({ backtestJob: { findMany } } as never);

    const summaries = await service.listJobSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).not.toHaveProperty('input');
    expect(summaries[0]).not.toHaveProperty('result');
    expect(summaries[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111117',
      status: 'succeeded',
      executionAttempt: 1,
      initialCash: 1000,
    });
  });
  it('Worker 运行任务并保存 checksum、进度和结果', async () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111117',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-02'),
      dataAsOf: new Date('2025-01-03'),
      input: { strategy: schema, bars: [], initialCash: 1000 },
      strategyVersion: { version: 2, schemaVersion: 1 },
    };
    const updates: object[] = [];
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => job),
        update: vi.fn(async ({ data }: { data: object }) => {
          updates.push(data);
          return { ...job, ...data };
        }),
      },
    };
    const worker = {
      id: 'mock-worker',
      run: vi.fn(async () => ({
        metrics: { cumulativeReturn: 0 },
        trades: [],
        returns: [0.01, -0.01],
      })),
    };
    const result = await new BacktestService(prisma as never).run(job.id, worker as never);
    expect(result).toMatchObject({
      status: 'succeeded',
      progress: 100,
      resultChecksum: expect.any(String),
    });
    expect(updates).toHaveLength(2);
    expect(worker.run).toHaveBeenCalledOnce();
    expect(result!.result).toMatchObject({
      metadata: { strategyVersionId: job.strategyVersionId, strategyVersion: 2, schemaVersion: 1 },
      analytics: { sharpe: expect.any(Number) },
    });
  });
  it('BullMQ 首次暂时性失败重新排队并保留后续重试机会', async () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111120',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      progress: 0,
      executionAttempt: 0,
      cancelRequestedAt: null,
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-02'),
      dataAsOf: new Date('2025-01-03'),
      input: { bars: [], initialCash: 1000 },
      strategyVersion: { version: 1, schemaVersion: 1, schema },
    };
    let state = { ...job };
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => state),
        updateMany: vi.fn(async ({ data }: { data: Partial<typeof state> }) => {
          state = { ...state, ...data };
          return { count: 1 };
        }),
        update: vi.fn(async ({ data }: { data: Partial<typeof state> }) => {
          state = { ...state, ...data };
          return state;
        }),
      },
    };
    const worker = {
      id: 'unstable-worker',
      run: vi.fn(async () => Promise.reject(new Error('暂时失败'))),
    };
    const service = new BacktestService(prisma as never);

    await expect(
      service.run(job.id, worker as never, { attempt: 1, maxAttempts: 3 }),
    ).rejects.toThrow('暂时失败');
    expect(state).toMatchObject({
      status: 'queued',
      executionAttempt: 1,
      errorCode: 'worker_attempt_failed',
    });
  });
  it('BullMQ 第三次执行失败后进入 exhausted 终态', async () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111123',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      progress: 0,
      executionAttempt: 2,
      cancelRequestedAt: null,
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-02'),
      dataAsOf: new Date('2025-01-03'),
      input: { bars: [], initialCash: 1000 },
      strategyVersion: { version: 1, schemaVersion: 1, schema },
    };
    let state = { ...job };
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => state),
        updateMany: vi.fn(async ({ data }: { data: Partial<typeof state> }) => {
          state = { ...state, ...data };
          return { count: 1 };
        }),
      },
    };
    const worker = {
      id: 'broken-worker',
      run: vi.fn(async () => Promise.reject(new Error('失败'))),
    };

    await expect(
      new BacktestService(prisma as never).run(job.id, worker as never, {
        attempt: 3,
        maxAttempts: 3,
      }),
    ).rejects.toThrow('失败');

    expect(state).toMatchObject({
      status: 'failed',
      executionAttempt: 3,
      errorCode: 'worker_attempts_exhausted',
    });
  });
  it('确定性策略输入错误直接进入 failed 而不占用后续 attempt', async () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111121',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      progress: 0,
      executionAttempt: 0,
      cancelRequestedAt: null,
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-02'),
      dataAsOf: new Date('2025-01-03'),
      input: { bars: [], initialCash: 1000 },
      strategyVersion: { version: 1, schemaVersion: 1, schema: { version: 999 } },
    };
    let state = { ...job };
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => state),
        updateMany: vi.fn(async ({ data }: { data: Partial<typeof state> }) => {
          state = { ...state, ...data };
          return { count: 1 };
        }),
        update: vi.fn(async ({ data }: { data: Partial<typeof state> }) => {
          state = { ...state, ...data };
          return state;
        }),
      },
    };
    const service = new BacktestService(prisma as never);

    await expect(
      service.run(job.id, { id: 'worker', run: vi.fn() } as never, { attempt: 1, maxAttempts: 3 }),
    ).rejects.toMatchObject({ unrecoverable: true });
    expect(state).toMatchObject({ status: 'failed', errorCode: 'backtest_input_invalid' });
  });
  it('晚到的旧 attempt 结果不能覆盖新 attempt 已提交的成功结果', async () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111122',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      progress: 0,
      executionAttempt: 0,
      cancelRequestedAt: null,
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-02'),
      dataAsOf: new Date('2025-01-03'),
      input: { bars: [], initialCash: 1000 },
      result: null as unknown,
      strategyVersion: { version: 1, schemaVersion: 1, schema },
    };
    let state = { ...job };
    const matches = (where: Record<string, unknown>) => {
      const statusFilter = where.status;
      if (typeof statusFilter === 'string' && statusFilter !== state.status) return false;
      if (
        statusFilter &&
        typeof statusFilter === 'object' &&
        'in' in statusFilter &&
        Array.isArray(statusFilter.in) &&
        !statusFilter.in.includes(state.status)
      )
        return false;
      if (
        typeof where.executionAttempt === 'number' &&
        where.executionAttempt !== state.executionAttempt
      )
        return false;
      const attemptFilter = where.executionAttempt as { lt?: number } | undefined;
      if (attemptFilter?.lt !== undefined && state.executionAttempt >= attemptFilter.lt)
        return false;
      return true;
    };
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => state),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Partial<typeof state>;
          }) => {
            if (!matches(where)) return { count: 0 };
            state = { ...state, ...data };
            return { count: 1 };
          },
        ),
      },
    };
    let resolveOld!: (value: unknown) => void;
    const oldWorker = {
      id: 'worker',
      run: vi.fn(() => new Promise((resolve) => (resolveOld = resolve))),
    };
    const service = new BacktestService(prisma as never);
    const oldAttempt = service.run(job.id, oldWorker as never, { attempt: 1, maxAttempts: 3 });
    await vi.waitFor(() => expect(state.executionAttempt).toBe(1));
    state = { ...state, status: 'queued' };
    const newWorker = { id: 'worker', run: vi.fn(async () => ({ marker: 'new' })) };

    await service.run(job.id, newWorker as never, { attempt: 2, maxAttempts: 3 });
    resolveOld({ marker: 'old' });
    await oldAttempt;

    expect(state).toMatchObject({ status: 'succeeded', executionAttempt: 2 });
    expect(state.result).toMatchObject({ marker: 'new' });
  });
  it('取消运行中任务会中止 Worker 且不写成功结果', async () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111118',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      progress: 0,
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-02'),
      dataAsOf: new Date('2025-01-03'),
      input: { strategy: schema, bars: [], initialCash: 1000 },
      strategyVersion: { version: 1, schemaVersion: 1 },
    };
    let state = { ...job };
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => state),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          state = { ...state, ...data };
          return state;
        }),
      },
    };
    const worker = {
      id: 'slow-worker',
      run: vi.fn(
        async (_input: unknown, signal: AbortSignal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('回测已取消')), { once: true });
          }),
      ),
    };
    const service = new BacktestService(prisma as never);
    const running = service.run(job.id, worker as never);
    await Promise.resolve();
    await service.cancel(job.id);
    await running;
    expect(state.status).toBe('cancelled');
    expect(updates.some((update) => update.status === 'succeeded')).toBe(false);
  });
});
