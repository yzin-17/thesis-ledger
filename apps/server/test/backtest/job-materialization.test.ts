import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { BacktestJob } from '@prisma/client';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { preparationStampFor } from './v3-preparation-fixtures.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { materializeStockBacktest } from '../../src/backtest/backtest-stock-materialization.js';
import { executeBacktestV3Run } from '../../src/backtest/backtest-v3-run-execution.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { classifyBacktestRunFailure } from '../../src/backtest/backtest-run-failure.js';
import { BacktestHistoricalInputErrorV3 } from '../../src/backtest/backtest-reconstruction-preflight-v3.js';
import { assertCurrentRunForRead } from '../../src/backtest/backtest-current-run-read.js';
import { createBacktestRunnerReplay, materializeStockRunnerReplay } from '../../src/backtest/backtest-runner-replay.js';
import { runBacktestAttempt } from '../../src/backtest/backtest-run-attempt.js';

const roots: string[] = [];
it('来源观察或实际抓取晚于冻结截点为稳定输入错误，不消耗自动重算预算', () => {
  const error = new BacktestHistoricalInputErrorV3({ code: 'FUTURE_DATA',
    message: '来源证据晚于冻结截点', missingFields: ['evidence.fetchedAt'] });
  expect(classifyBacktestRunFailure(error, { attempt: 1, maxAttempts: 3 }))
    .toMatchObject({ code: 'FUTURE_DATA', retryable: false });
});
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function harness() {
  const fixture = await completeSnapshotFixture();
  fixture.input.strategyVersionId = '11111111-1111-4111-8111-111111111811';
  fixture.input.runId = '11111111-1111-4111-8111-111111111812';
  const root = await mkdtemp(join(tmpdir(), 'backtest-job-materialization-')); roots.push(root);
  const snapshots = new LocalSnapshotStore(root);
  let job = { id: fixture.input.runId, strategyVersionId: fixture.input.strategyVersionId,
    mode: 'frozen', status: 'running', executionAttempt: 1, cancelRequestedAt: null,
    engineVersion: 'thesis-ledger-v3-local-runner-v5', snapshotId: null, snapshotManifest: null,
    runConfig: fixture.input.runConfig, result: null, resultChecksum: null,
    periodStart: new Date(`${fixture.input.runConfig.startDate}T00:00:00Z`),
    periodEnd: new Date(`${fixture.input.runConfig.endDate}T00:00:00Z`), dataAsOf: new Date(fixture.input.runConfig.dataAsOf),
    idempotencyKey: 'materialization-once',
    input: { contractVersion: 1, schemaVersion: 'backtest-trade-run-v1', strategyVersionId: fixture.input.strategyVersionId,
      runConfig: fixture.input.runConfig, preparationStamp: preparationStampFor(fixture.input.strategy, fixture.input.runConfig, fixture.input.strategyVersionId),
      materialization: { version: 'backtest-job-input-v1', kind: 'configured', strategyVersionHash: hashCanonicalManifest(fixture.input.strategy) } },
  } as unknown as BacktestJob;
  const linked = new Map<string, BacktestJob>();
  const updateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const target = where.id === job.id ? job : linked.get(String(where.id));
    if (!target || !Object.entries(where).every(([key, value]) => {
      const actual = target[key as keyof BacktestJob];
      if (value && typeof value === 'object') {
        if ('in' in value) return (value.in as unknown[]).includes(actual);
        if ('lt' in value) return Number(actual) < Number(value.lt);
        if ('not' in value) return actual !== value.not;
      }
      return actual === value;
    })) return { count: 0 };
    const updated = { ...target, ...data } as BacktestJob;
    if (target.id === job.id) job = updated; else linked.set(target.id, updated);
    return { count: 1 };
  });
  const findUnique = async ({ where }: { where: { id: string } }) => where.id === job.id ? job : linked.get(where.id)!;
  const prisma = { strategyVersion: { findUnique: async () => ({ schema: fixture.input.strategy }) },
    backtestJob: { updateMany, findUnique, findUniqueOrThrow: findUnique,
      findFirst: async ({ where }: { where: { idempotencyKey: string } }) => [...linked.values()].find((row) => row.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { ...data, snapshotId: null, snapshotManifest: null, result: null, resultChecksum: null,
          cancelRequestedAt: null, createdAt: new Date(), updatedAt: new Date() } as unknown as BacktestJob;
        linked.set(created.id, created); return created;
      } } };
  const builder = new DsaSnapshotBuilder(fixture.dsa as never, snapshots, fixture.reader);
  const guard = { check: vi.fn(async () => {}) };
  const signal = new AbortController().signal;
  const materialize = () => materializeStockBacktest({ prisma: prisma as never, job, builder, snapshots, guard, signal });
  return { fixture, snapshots, prisma, builder, guard, signal, materialize, linked, read: () => job,
    mutate: (patch: Partial<BacktestJob>) => { job = { ...job, ...patch }; } };
}

it('待物化Run可读取；Worker物化后离线执行，原目录不出现新产物', async () => {
  const h = await harness();
  expect(() => assertCurrentRunForRead(h.read())).not.toThrow();
  const result = await h.materialize();
  expect(result.input).toMatchObject({ snapshotStorageAttempt: 1, snapshotId: result.snapshotId });
  expect(await h.snapshots.v3.load(result.id, true)).toBeUndefined();
  expect((await h.snapshots.forAttempt(result.id, 1).v3.replay(result.id)).contentHash).toBe(result.snapshotId);
  const reads = h.fixture.reader.readV3.mock.calls.length;
  const executed = await executeBacktestV3Run({ job: result, snapshots: h.snapshots,
    runner: new LocalSnapshotV3Runner(h.snapshots), signal: h.signal });
  expect(executed.result.runId).toBe(result.id);
  expect(h.fixture.reader.readV3).toHaveBeenCalledTimes(reads);
});

it('文件完成但关联失败后由下一attempt复用，不重新读取数据或检查当前路由', async () => {
  const h = await harness();
  h.prisma.backtestJob.updateMany.mockImplementationOnce(async ({ data }) => { h.mutate(data as Partial<BacktestJob>); return { count: 1 }; });
  const original = h.builder.buildV3.bind(h.builder);
  vi.spyOn(h.builder, 'buildV3').mockImplementation(async (...args) => {
    const result = await original(...args); h.mutate({ cancelRequestedAt: new Date() }); return result;
  });
  await expect(h.materialize()).rejects.toMatchObject({ response: { code: 'BACKTEST_ATTEMPT_OWNERSHIP_LOST' } });
  expect(h.read().snapshotId).toBeNull();
  const reads = h.fixture.reader.readV3.mock.calls.length;
  h.mutate({ executionAttempt: 2, cancelRequestedAt: null }); h.guard.check.mockRejectedValue(new ConflictException('route changed'));
  const published = await h.materialize();
  expect(published.input).toMatchObject({ snapshotStorageAttempt: 1 });
  expect(h.fixture.reader.readV3).toHaveBeenCalledTimes(reads);
});

it('旧attempt晚到不能关联或删除新attempt的快照', async () => {
  const h = await harness(); const original = h.builder.buildV3.bind(h.builder);
  vi.spyOn(h.builder, 'buildV3').mockImplementation(async (...args) => {
    const built = await original(...args); h.mutate({ executionAttempt: 2 }); return built;
  });
  await expect(h.materialize()).rejects.toMatchObject({ response: { code: 'BACKTEST_ATTEMPT_OWNERSHIP_LOST' } });
  expect(h.read().snapshotId).toBeNull();
  expect((await h.snapshots.forAttempt(h.read().id, 1).v3.replay(h.read().id)).status).toBe('finalized');
});

it('首次物化准备戳过期稳定失败，不调用Builder', async () => {
  const h = await harness(); h.guard.check.mockRejectedValue(new ConflictException({ code: 'PREPARATION_STALE' }));
  const build = vi.spyOn(h.builder, 'buildV3');
  await expect(h.materialize()).rejects.toMatchObject({ response: { code: 'PREPARATION_STALE' } });
  expect(build).not.toHaveBeenCalled();
});

it('股票版本变化创建幂等关联Run，冻结重放无来源读取，旧结果与身份保留', async () => {
  const h = await harness(); await h.materialize();
  h.mutate({ status: 'succeeded', engineVersion: 'stock-old', result: { historical: true }, resultChecksum: 'old' });
  const original = structuredClone(h.read());
  const options = { prisma: h.prisma as never, job: original, runnerId: 'thesis-ledger-v3-local-runner-v5', snapshots: h.snapshots };
  const created = await createBacktestRunnerReplay(options);
  expect(created.id).not.toBe(original.id);
  expect(created.input).toMatchObject({ replayOfRunId: original.id,
    materialization: { sourceRunId: original.id, sourceSnapshotId: original.snapshotId } });
  expect((await createBacktestRunnerReplay(options)).id).toBe(created.id);
  const executing = { ...created, status: 'running', executionAttempt: 1 };
  h.linked.set(created.id, executing);
  const reads = h.fixture.reader.readV3.mock.calls.length;
  const frozen = await materializeStockRunnerReplay({ prisma: h.prisma as never, job: executing,
    snapshots: h.snapshots, signal: h.signal });
  const result = await executeBacktestV3Run({ job: frozen, snapshots: h.snapshots,
    runner: new LocalSnapshotV3Runner(h.snapshots), signal: h.signal });
  expect(result.result.comparableDataFingerprint).toBe((original.snapshotManifest as { comparableDataFingerprint: string }).comparableDataFingerprint);
  expect(h.fixture.reader.readV3).toHaveBeenCalledTimes(reads);
  expect(h.read()).toEqual(original);
});

it.each(['SIMULATION_LEDGER_ERROR', 'RESEARCH_DATA_SCOPE_INVALID', 'SNAPSHOT_HASH_MISMATCH', 'BACKTEST_RUNNER_VERSION_UNKNOWN'])(
  '%s保持具体错误且不自动重算', (code) => {
    expect(classifyBacktestRunFailure(Object.assign(new Error('fixed'), { code }), { attempt: 1, maxAttempts: 3 }))
      .toMatchObject({ code, retryable: false });
  });

it('稳定账本错误只计算一次，终态再次投递不执行，也不增加attempt', async () => {
  const h = await harness(); h.mutate({ status: 'queued', executionAttempt: 0, engineVersion: null });
  const execute = vi.fn(async () => { throw Object.assign(new Error('invalid ledger'), { code: 'SIMULATION_LEDGER_ERROR' }); });
  const attempt = () => runBacktestAttempt({ prisma: h.prisma as never, job: h.read(), runnerId: 'current',
    execution: { attempt: 1, maxAttempts: 3 }, activeControllers: new Map(), execute,
    classifyFailure: (error) => classifyBacktestRunFailure(error, { attempt: 1, maxAttempts: 3 }) });
  await expect(attempt()).rejects.toMatchObject({ unrecoverable: true, code: 'SIMULATION_LEDGER_ERROR' });
  expect(h.read()).toMatchObject({ status: 'failed', executionAttempt: 1, errorCode: 'SIMULATION_LEDGER_ERROR' });
  await attempt(); expect(execute).toHaveBeenCalledOnce();
});
