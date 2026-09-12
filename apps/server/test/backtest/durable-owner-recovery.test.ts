import { describe, expect, it, vi } from 'vitest';
import { prepareBacktestExecution } from '../../src/backtest/backtest-execution-owner.js';
import { BacktestV2RunService, type BacktestV2Runner } from '../../src/backtest/backtest-v2-run.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';

const matchesWhere = (state: Record<string, unknown>, where: Record<string, unknown>) => {
  if (where.id !== undefined && where.id !== state.id) return false;
  if (where.mode !== undefined && where.mode !== state.mode) return false;
  const status = where.status;
  if (typeof status === 'string' && status !== state.status) return false;
  if (
    status &&
    typeof status === 'object' &&
    'in' in status &&
    Array.isArray(status.in) &&
    !status.in.includes(state.status)
  )
    return false;
  const executionAttempt = where.executionAttempt;
  if (typeof executionAttempt === 'number' && executionAttempt !== state.executionAttempt) return false;
  if (
    executionAttempt &&
    typeof executionAttempt === 'object' &&
    'lt' in executionAttempt &&
    typeof executionAttempt.lt === 'number' &&
    typeof state.executionAttempt === 'number' &&
    state.executionAttempt >= executionAttempt.lt
  )
    return false;
  if (where.cancelRequestedAt === null && state.cancelRequestedAt !== null) return false;
  return true;
};

const statefulPrisma = (initial: Record<string, unknown>) => {
  let state = { ...initial };
  const backtestJob = {
    findUnique: vi.fn(async () => state),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matchesWhere(state, where)) return { count: 0 };
        state = { ...state, ...data };
        return { count: 1 };
      },
    ),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state = { ...state, ...data };
      return state;
    }),
  };
  return { prisma: { backtestJob } as never, current: () => state };
};

const v1Schema = {
  version: 1 as const,
  name: 'durable-owner-v1',
  universe: { symbols: ['600519.SH'], asOf: '2025-01-01T00:00:00Z' },
  entrySignals: [{ indicator: 'close', operator: 'gt' as const, value: 10 }],
  exitSignals: [{ indicator: 'close', operator: 'lt' as const, value: 9 }],
  stopLoss: { type: 'fixed' as const, value: 0.1 },
  sizing: { type: 'weight' as const, value: 0.5 },
  execution: { price: 'close' as const, tPlusOne: true, lotSize: 100 },
  cost: {
    commissionRate: 0.0003,
    minimumCommission: 5,
    stampDutyRate: 0.0005,
    slippageRate: 0,
  },
  riskConstraints: [],
  benchmark: '000300.SH',
};

const v2Result = (runId: string, snapshotId: string) => ({
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
  resultChecksum: 'durable-owner-checksum',
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

describe('Backtest durable owner recovery', () => {
  it('V1 在运输记录重建后从 PostgreSQL attempt=1 继续领取 ownerAttempt=2', async () => {
    const id = '11111111-1111-4111-8111-111111111201';
    const state = statefulPrisma({
      id,
      mode: 'V1',
      strategyVersionId: '11111111-1111-4111-8111-111111111116',
      status: 'queued',
      progress: 0,
      executionAttempt: 1,
      cancelRequestedAt: null,
      startedAt: new Date('2026-09-12T00:00:00Z'),
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-02'),
      dataAsOf: new Date('2025-01-03'),
      input: { bars: [], initialCash: 1000 },
      strategyVersion: { version: 1, schemaVersion: 1, schema: v1Schema },
    });
    const prepared = await prepareBacktestExecution(state.prisma, id, 3);
    expect(prepared).toEqual({ action: 'run', ownerAttempt: 2 });
    if (prepared.action !== 'run') throw new Error('test owner attempt missing');
    const worker = { id: 'recovered-v1', run: vi.fn(async () => ({ marker: 'v1-recovered' })) };

    await new BacktestService(state.prisma).run(id, worker as never, {
      attempt: prepared.ownerAttempt,
      maxAttempts: 3,
    });

    expect(worker.run).toHaveBeenCalledOnce();
    expect(state.current()).toMatchObject({ status: 'succeeded', executionAttempt: 2 });
  });

  it('V2 在运输记录重建后从 PostgreSQL attempt=1 继续领取 ownerAttempt=2', async () => {
    const id = '11111111-1111-4111-8111-111111111202';
    const snapshotId = 'durable-owner-snapshot';
    const state = statefulPrisma({
      id,
      mode: 'V2',
      status: 'queued',
      stage: 'queued',
      progress: 0,
      executionAttempt: 1,
      cancelRequestedAt: null,
      startedAt: new Date('2026-09-12T00:00:00Z'),
      snapshotId,
      snapshotManifest: {
        status: 'finalized',
        contentHash: snapshotId,
        artifacts: [],
      },
    });
    const prepared = await prepareBacktestExecution(state.prisma, id, 3);
    expect(prepared).toEqual({ action: 'run', ownerAttempt: 2 });
    if (prepared.action !== 'run') throw new Error('test owner attempt missing');
    const runner: BacktestV2Runner = {
      id: 'recovered-v2',
      run: vi.fn(async () => v2Result(id, snapshotId)),
    };

    await new BacktestV2RunService(
      state.prisma,
      undefined,
      undefined,
      undefined,
      runner,
    ).runV2(id, undefined, { attempt: prepared.ownerAttempt, maxAttempts: 3 });

    expect(runner.run).toHaveBeenCalledOnce();
    expect(state.current()).toMatchObject({
      status: 'succeeded',
      stage: 'succeeded',
      executionAttempt: 2,
      resultChecksum: 'durable-owner-checksum',
    });
  });

  it('不会让新的运输记录抢占仍处于 running 的 durable owner', async () => {
    const id = '11111111-1111-4111-8111-111111111203';
    const state = statefulPrisma({
      id,
      status: 'running',
      executionAttempt: 2,
      cancelRequestedAt: null,
    });

    await expect(prepareBacktestExecution(state.prisma, id, 3)).resolves.toEqual({
      action: 'skip',
      reason: 'already_running',
    });
  });
});
