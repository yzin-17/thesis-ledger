import { describe, expect, it, vi } from 'vitest';
import { BacktestV2RunService, type BacktestV2Runner } from '../../src/backtest/backtest-v2-run.js';

const runId = '11111111-1111-4111-8111-111111111111';
const snapshotId = 'snapshot-hash';

const result = () => ({
  source: 'BACKTEST' as const,
  runId,
  strategyVersionId: 'strategy-v2',
  snapshotId,
  engineVersion: 'runner-v2',
  schemaVersion: '2' as const,
  marketRuleVersion: 'rules-v1',
  calendarVersion: 'calendar-v1',
  aggregationVersion: 'aggregation-v1',
  contentHash: snapshotId,
  resultChecksum: 'canonical-checksum',
  completeness: 'partial' as const,
  warnings: [],
  rejectedOrders: [],
  simulationFills: [],
  trades: [],
  equityCurve: [
    { occurredAt: '2026-09-08T07:00:00Z', value: { amount: '1000', currency: 'CNY' as const } },
  ],
  metrics: { totalReturn: { status: 'available' as const, value: '0' } },
});

const harness = (status: 'queued' | 'failed' = 'queued', executionAttempt = 0) => {
  let job: Record<string, unknown> = {
    id: runId,
    mode: 'V2',
    status,
    stage: status,
    executionAttempt,
    snapshotId,
    snapshotManifest: {
      status: 'finalized',
      contentHash: snapshotId,
      artifacts: [],
    },
    cancelRequestedAt: null,
    startedAt: null,
  };
  const updateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (where.status === 'running' && job.status !== 'running') return { count: 0 };
      if (where.status && typeof where.status === 'string' && job.status !== where.status)
        return { count: 0 };
      job = { ...job, ...data };
      return { count: 1 };
    },
  );
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    job = { ...job, ...data };
    return job;
  });
  const prisma = {
    backtestJob: {
      findUnique: vi.fn(async () => job),
      updateMany,
      update,
    },
  };
  return { prisma, updateMany, update, current: () => job };
};

describe('V2 Run lifecycle', () => {
  it('commits one canonical result and ignores a later attempt', async () => {
    const state = harness();
    const runner: BacktestV2Runner = { id: 'runner-v2', run: vi.fn(async () => result()) };
    const service = new BacktestV2RunService(
      state.prisma as never,
      undefined,
      undefined,
      undefined,
      runner,
    );

    await service.runV2(runId, undefined, { attempt: 1, maxAttempts: 2 });
    await service.runV2(runId, undefined, { attempt: 2, maxAttempts: 2 });

    expect(runner.run).toHaveBeenCalledOnce();
    expect(state.current()).toMatchObject({
      status: 'succeeded',
      stage: 'succeeded',
      resultChecksum: 'canonical-checksum',
    });
  });

  it('requeues a failed run without rebuilding its finalized snapshot', async () => {
    const state = harness('failed', 3);
    const queue = { ensureEnqueued: vi.fn(async () => state.current()) };
    const snapshotStore = { retry: vi.fn() };
    const service = new BacktestV2RunService(
      state.prisma as never,
      queue as never,
      snapshotStore as never,
    );

    await service.retryRun(runId);

    expect(state.current()).toMatchObject({
      status: 'queued',
      stage: 'queued',
      executionAttempt: 0,
      startedAt: null,
    });
    expect(queue.ensureEnqueued).toHaveBeenCalledWith(runId);
    expect(snapshotStore.retry).not.toHaveBeenCalled();
  });

  it('persists structured diagnostics when the final attempt fails', async () => {
    const state = harness();
    const runner: BacktestV2Runner = {
      id: 'runner-v2',
      run: vi.fn(async () => {
        throw new Error('artifact corrupt');
      }),
    };
    const service = new BacktestV2RunService(
      state.prisma as never,
      undefined,
      undefined,
      undefined,
      runner,
    );

    await expect(service.runV2(runId, undefined, { attempt: 1, maxAttempts: 1 })).rejects.toThrow(
      'artifact corrupt',
    );
    expect(state.current()).toMatchObject({
      status: 'failed',
      stage: 'failed',
      errorCode: 'INTERNAL_ERROR',
      diagnostics: { code: 'INTERNAL_ERROR', message: 'artifact corrupt', path: ['run'] },
    });
  });

  it('aborts an active runner only after cancellation is persisted', async () => {
    const state = harness();
    let observedSignal: AbortSignal | undefined;
    const runner: BacktestV2Runner = {
      id: 'runner-v2',
      run: vi.fn(
        async (_input, signal) =>
          new Promise((_resolve, reject) => {
            observedSignal = signal;
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      ),
    };
    const service = new BacktestV2RunService(
      state.prisma as never,
      undefined,
      undefined,
      undefined,
      runner,
    );
    const running = service.runV2(runId);
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledOnce());
    await state.update({ data: { status: 'cancelled', cancelRequestedAt: new Date() } });

    expect(service.abortActiveRun(runId)).toBe(true);
    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
    expect(observedSignal?.aborted).toBe(true);
  });
});
