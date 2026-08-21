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
    expect(result.result).toMatchObject({
      metadata: { strategyVersionId: job.strategyVersionId, strategyVersion: 2, schemaVersion: 1 },
      analytics: { sharpe: expect.any(Number) },
    });
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
