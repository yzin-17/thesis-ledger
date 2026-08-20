import { describe, expect, it, vi } from 'vitest';
import { BacktestService } from '../src/backtest/backtest.service.js';

const savedStrategy = {
  version: 1 as const,
  name: 'saved',
  status: 'draft' as const,
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

const createJob = () => ({
  id: '11111111-1111-4111-8111-111111111117',
  strategyVersionId: '11111111-1111-4111-8111-111111111116',
  status: 'queued',
  progress: 0,
  periodStart: new Date('2025-01-01'),
  periodEnd: new Date('2025-01-02'),
  dataAsOf: new Date('2025-01-03'),
  input: {
    strategy: { ...savedStrategy, name: 'client-overwrite' },
    bars: [],
    initialCash: 1_000,
  },
  strategyVersion: { version: 2, schemaVersion: 1, schema: savedStrategy },
});

describe('Backtest service correctness regressions', () => {
  it('executes the immutable StrategyVersion schema instead of client input strategy', async () => {
    let state = createJob();
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => ({ ...state })),
        update: vi.fn(async ({ where, data }: { where: { status?: string }; data: Record<string, unknown> }) => {
          if (where.status && state.status !== where.status) throw new Error('record not found');
          state = { ...state, ...data } as typeof state;
          return state;
        }),
      },
    };
    const worker = {
      id: 'mock-worker',
      run: vi.fn(async (_input: unknown, _signal: AbortSignal) => ({ returns: [] })),
    };
    await new BacktestService(prisma as never).run(state.id, worker as never);
    expect(worker.run).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: savedStrategy }),
      expect.any(AbortSignal),
    );
    expect(worker.run.mock.calls[0]?.[0]).not.toMatchObject({
      strategy: expect.objectContaining({ name: 'client-overwrite' }),
    });
  });

  it('atomically claims a queued job so concurrent run calls invoke the worker once', async () => {
    let state = createJob();
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => ({ ...state })),
        update: vi.fn(async ({ where, data }: { where: { status?: string }; data: Record<string, unknown> }) => {
          if (where.status && state.status !== where.status) throw new Error('record not found');
          state = { ...state, ...data } as typeof state;
          return state;
        }),
      },
    };
    const worker = { id: 'mock-worker', run: vi.fn(async () => ({ returns: [] })) };
    const service = new BacktestService(prisma as never);
    await Promise.all([service.run(state.id, worker as never), service.run(state.id, worker as never)]);
    expect(worker.run).toHaveBeenCalledTimes(1);
  });

  it('drops a legacy client strategy payload when queueing a job', async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const service = new BacktestService({ backtestJob: { create } } as never);
    await service.queue({
      id: '11111111-1111-4111-8111-111111111119',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      period: { start: '2025-01-01', end: '2025-01-02' },
      dataAsOf: '2025-01-03T00:00:00Z',
      warnings: [],
      strategy: { name: 'untrusted-client-copy' },
      bars: [],
    });
    const storedInput = create.mock.calls[0]?.[0].data.input as Record<string, unknown>;
    expect(storedInput).not.toHaveProperty('strategy');
  });
});
