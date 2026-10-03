import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { BacktestNavRunExecution } from '../../src/backtest/backtest-nav-run-execution.js';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import { prepareNavRunConfigV3 } from '../../src/backtest/backtest-nav-preparation.js';
import { navPreparationReceiptContentChecksum } from '../../src/backtest/backtest-nav-preparation-receipt.js';
import { navPreparationFixture } from './nav-preparation.fixtures.js';

type Row = Record<string, unknown>;
let root: string;
let h: Awaited<ReturnType<typeof harness>>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nav-worker-'));
  h = await harness(root);
});
afterEach(async () => rm(root, { recursive: true, force: true }));

async function harness(path: string) {
  const fixture = navPreparationFixture();
  const prepared = await prepareNavRunConfigV3(fixture.options);
  const snapshots = new LocalNavSnapshotStore(path);
  const response = prepared.selection.response;
  const id = '22222222-2222-4222-8222-222222222222';
  const manifest = await snapshots.freeze({
    runId: id,
    strategyVersionId: fixture.request.strategyVersionId,
    source: {
      ...response.source,
      routeKey: response.routeKey,
      target: {
        providerId: response.routeTarget.providerId,
        upstreamSource: response.routeTarget.upstreamSource,
      },
      policyRevision: response.effectivePolicyRevision,
    },
    facts: prepared.facts,
    context: prepared.context,
  });
  const createdAt = new Date('2026-09-30T15:03:00Z');
  const preparation = {
    id: '33333333-3333-4333-8333-333333333333',
    strategyVersionId: fixture.request.strategyVersionId,
    preparationHash: prepared.binding.preparationHash,
    contentChecksum: navPreparationReceiptContentChecksum(fixture.request, prepared),
    request: fixture.request,
    evidence: prepared,
    expiresAt: new Date('2026-09-30T15:17:00Z'),
    consumedRunId: id,
  };
  let job: Row = {
    id,
    mode: 'V3',
    strategyVersionId: fixture.request.strategyVersionId,
    idempotencyKey: 'nav-worker',
    status: 'queued',
    stage: 'queued',
    progress: 0,
    executionAttempt: 0,
    periodStart: new Date(`${prepared.runConfig.startDate}T00:00:00Z`),
    periodEnd: new Date(`${prepared.runConfig.endDate}T00:00:00Z`),
    dataAsOf: new Date(prepared.runConfig.dataAsOf),
    runConfig: prepared.runConfig,
    input: {
      contractVersion: 3,
      schemaVersion: '3',
      inputKind: 'nav',
      runConfig: prepared.runConfig,
      preparationId: preparation.id,
      preparationHash: preparation.preparationHash,
    },
    snapshotId: manifest.contentHash,
    snapshotManifest: manifest,
    errorCode: null,
    errorSummary: null,
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    finishedAt: null,
    cancelRequestedAt: null,
  };
  const matches = (where: Row): boolean =>
    Object.entries(where).every(([key, expected]) => {
      const actual = job[key];
      if (expected !== null && typeof expected === 'object') {
        const condition = expected as Row;
        if ('in' in condition) return (condition.in as unknown[]).includes(actual);
        if ('lt' in condition) return Number(actual) < Number(condition.lt);
        if ('not' in condition) return actual !== condition.not;
      }
      return actual === expected;
    });
  const prisma = {
    backtestJob: {
      findUnique: vi.fn(async () => ({ ...job })),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        if (!matches(where)) return { count: 0 };
        job = { ...job, ...data };
        return { count: 1 };
      }),
    },
    navBacktestPreparation: { findUnique: vi.fn(async () => preparation) },
    strategyVersion: {
      findUnique: vi.fn(async () => ({ schemaVersion: 2, schema: fixture.strategy })),
    },
  };
  const execution = new BacktestNavRunExecution(prisma as never, snapshots);
  const exchange = { id: 'exchange-only', run: vi.fn() };
  const service = new BacktestRunService(
    prisma as never,
    undefined,
    undefined,
    undefined,
    exchange,
    undefined,
    execution,
  );
  return {
    id,
    service,
    execution,
    preparation,
    prisma,
    exchange,
    snapshots,
    read: () => job,
    replace: (data: Row) => {
      job = { ...job, ...data };
    },
  };
}

describe('NAV Worker 生命周期汇合', () => {
  it('已过期但合法消费的凭证经真实 Parquet 执行并原子提交 NAV 结果', async () => {
    const result = await h.service.runCurrent(h.id);
    expect(result).toMatchObject({
      status: 'succeeded',
      executionAttempt: 1,
      engineVersion: h.execution.runner.navId,
    });
    expect(h.read().result).toMatchObject({ inputKind: 'nav', runId: h.id });
    expect(h.read().resultChecksum).toBe((h.read().result as Row).resultChecksum);
    expect(h.exchange.run).not.toHaveBeenCalled();
    expect(h.prisma.backtestJob.updateMany.mock.calls[1]![0].where).toMatchObject({
      mode: 'V3',
      status: 'running',
      executionAttempt: 1,
      cancelRequestedAt: null,
    });
  });
  it('重复投递仅执行一次', async () => {
    const execute = vi.spyOn(h.execution, 'execute');
    await Promise.all([
      h.service.runCurrent(h.id, { attempt: 1, maxAttempts: 2 }),
      h.service.runCurrent(h.id, { attempt: 1, maxAttempts: 2 }),
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.read().status).toBe('succeeded');
  });
  it.each(['receipt', 'strategy', 'manifest'])('篡改 %s 不调用 Runner 且终态失败', async (kind) => {
    if (kind === 'receipt') h.preparation.contentChecksum = 'f'.repeat(64);
    if (kind === 'strategy')
      h.prisma.strategyVersion.findUnique.mockResolvedValue({
        schemaVersion: 1,
        schema: {} as never,
      });
    if (kind === 'manifest') h.replace({ snapshotId: 'f'.repeat(64) });
    const runner = vi.spyOn(h.execution.runner, 'runNav');
    await h.service.runCurrent(h.id);
    expect(h.read()).toMatchObject({ status: 'failed', errorCode: 'DATA_UNAVAILABLE' });
    expect(runner).not.toHaveBeenCalled();
  });
  it('取消发生在结果返回前时确认取消并拒绝结果提交', async () => {
    const original = h.execution.execute.bind(h.execution);
    vi.spyOn(h.execution, 'execute').mockImplementation(async (job, signal) => {
      const result = await original(job, signal);
      h.replace({ cancelRequestedAt: new Date() });
      h.service.abortActiveRun(h.id);
      return result;
    });
    await h.service.runCurrent(h.id);
    expect(h.read().status).toBe('cancelled');
    expect(h.read().result).toBeUndefined();
  });
  it('旧 attempt 晚到结果保留较新终态', async () => {
    const original = h.execution.execute.bind(h.execution);
    vi.spyOn(h.execution, 'execute').mockImplementation(async (job, signal) => {
      const result = await original(job, signal);
      h.replace({
        status: 'succeeded',
        executionAttempt: 2,
        result: { newer: true },
        resultChecksum: 'newer',
      });
      return result;
    });
    await h.service.runCurrent(h.id);
    expect(h.read()).toMatchObject({
      status: 'succeeded',
      executionAttempt: 2,
      result: { newer: true },
      resultChecksum: 'newer',
    });
  });
  it('Runner 输出篡改不能提交', async () => {
    const original = h.execution.runner.runNav.bind(h.execution.runner);
    vi.spyOn(h.execution.runner, 'runNav').mockImplementation(async (...args) => {
      const result = await original(...args);
      return { ...result, resultChecksum: 'f'.repeat(16) };
    });
    await h.service.runCurrent(h.id);
    expect(h.read()).toMatchObject({ status: 'failed', errorCode: 'RULE_REJECTED' });
    expect(h.read().result).toBeUndefined();
  });
  it('未注册 NAV 执行器不降级到场内 Runner', async () => {
    const service = new BacktestRunService(
      h.prisma as never,
      undefined,
      undefined,
      undefined,
      h.exchange,
    );
    await service.runCurrent(h.id);
    expect(h.read()).toMatchObject({ status: 'failed', errorCode: 'DATA_UNAVAILABLE' });
    expect(h.exchange.run).not.toHaveBeenCalled();
  });
  it('数据库暂不可用按上限重试，最终收敛失败', async () => {
    h.prisma.navBacktestPreparation.findUnique.mockRejectedValue(
      Object.assign(new Error('数据库连接失败'), { code: 'P1001' }),
    );
    await expect(h.service.runCurrent(h.id, { attempt: 1, maxAttempts: 2 })).rejects.toThrow(
      '数据库连接失败',
    );
    expect(h.read()).toMatchObject({ status: 'queued', executionAttempt: 1 });
    await expect(h.service.runCurrent(h.id, { attempt: 2, maxAttempts: 2 })).rejects.toThrow(
      '数据库连接失败',
    );
    expect(h.read()).toMatchObject({
      status: 'failed',
      executionAttempt: 2,
      errorCode: 'INTERNAL_ERROR',
    });
  });
  it('执行后物理冻结读取失败时拒绝提交', async () => {
    const original = h.execution.runner.runNav.bind(h.execution.runner);
    vi.spyOn(h.execution.runner, 'runNav').mockImplementation(async (...args) => {
      const result = await original(...args);
      await rm(join(root, 'snapshots', h.id, 'finalized.json'));
      return result;
    });
    await h.service.runCurrent(h.id);
    expect(h.read()).toMatchObject({ status: 'failed', errorCode: 'DATA_UNAVAILABLE' });
    expect(h.read().result).toBeUndefined();
  });
});
