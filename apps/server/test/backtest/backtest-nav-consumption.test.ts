import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import { LocalNavSnapshotV3Runner } from '../../src/backtest/backtest-nav-v3-runner.js';
import { verifyNavResultForRead } from '../../src/backtest/backtest-nav-result-read.js';
import { verifyBacktestRunRetrySnapshot } from '../../src/backtest/backtest-nav-run-retry.js';
import { navFreezeFixture } from './nav-freeze.fixtures.js';

const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let root: string;
let snapshots: LocalNavSnapshotStore;

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'nav-consumption-'));
  snapshots = new LocalNavSnapshotStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('NAV 公开结果读取', () => {
  it('按真实 Parquet 回放验证结果，并绑定数据库执行身份和 checksum', async () => {
    const manifest = await snapshots.freeze(navFreezeFixture());
    const frozen = await snapshots.replay(manifest.runId);
    const refs = [manifest.artifact, manifest.contextArtifact].map((ref) => ({
      ...ref,
      artifactId: ref.contentHash,
      key: `${manifest.runId}/${ref.key}`,
    }));
    const result = await new LocalNavSnapshotV3Runner(snapshots).runNav(
      {
        runId: manifest.runId,
        snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
        artifactRefs: refs,
      },
      new AbortController().signal,
    );
    const job = {
      status: 'succeeded',
      engineVersion: result.engineVersion,
      resultChecksum: result.resultChecksum,
      result,
    };

    expect(verifyNavResultForRead(job, frozen)).toEqual(result);
    expect(() =>
      verifyNavResultForRead({ ...job, resultChecksum: '0'.repeat(16) }, frozen),
    ).toThrow();
    expect(() =>
      verifyNavResultForRead({ ...job, engineVersion: 'different-engine' }, frozen),
    ).toThrow();
    expect(() => verifyNavResultForRead({ ...job, status: 'queued' }, frozen)).toThrow();
    expect(
      verifyNavResultForRead(
        { status: 'failed', engineVersion: null, resultChecksum: null, result: null },
        frozen,
      ),
    ).toBeNull();
    expect(() =>
      verifyNavResultForRead(
        { status: 'succeeded', engineVersion: null, resultChecksum: null, result: null },
        frozen,
      ),
    ).toThrow();
  }, 30000);
});

describe('NAV retry 与队列 capability', () => {
  it('NAV retry 只验证 NAV 冻结输入并按 attempt CAS 后派发', async () => {
    const job = navJob({ status: 'failed', executionAttempt: 1 });
    const prisma = mutablePrisma(job);
    const navExecution = { loadVerified: vi.fn(async () => undefined) };
    const queue = {
      supportsNavExecution: vi.fn(() => true),
      ensureEnqueued: vi.fn(async () => job),
    };
    const service = new BacktestRunService(
      prisma as never,
      queue as never,
      undefined,
      undefined,
      undefined,
      undefined,
      navExecution as never,
    );

    const retried = await service.retryRun(job.id);

    expect(retried).toBe(job);
    expect(navExecution.loadVerified).toHaveBeenCalledWith(job);
    expect(queue.ensureEnqueued).toHaveBeenCalledWith(job.id);
    expect(prisma.backtestJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: job.id, mode: 'V3', status: 'failed', executionAttempt: 1 },
        data: expect.objectContaining({
          status: 'queued',
          executionAttempt: 2,
          input: expect.objectContaining({ retryAttemptBase: 2 }),
        }),
      }),
    );
  });

  it('NAV 无执行或队列 capability 时不改变 failed 状态', async () => {
    const job = navJob({ status: 'failed', executionAttempt: 1 });
    const prisma = mutablePrisma(job);

    await expect(
      verifyBacktestRunRetrySnapshot({
        job: job as never,
        prisma: prisma as never,
        snapshotStore: {} as never,
        queueService: { supportsNavExecution: () => true } as never,
        defaultV3RunnerAvailable: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'NAV_V3_EXECUTION_UNAVAILABLE' },
    });
    expect(prisma.backtestJob.updateMany).not.toHaveBeenCalled();

    const availableExecution = { loadVerified: vi.fn(async () => undefined) };
    await expect(
      verifyBacktestRunRetrySnapshot({
        job: job as never,
        prisma: prisma as never,
        snapshotStore: {} as never,
        queueService: { supportsNavExecution: () => false } as never,
        navExecution: availableExecution as never,
        defaultV3RunnerAvailable: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'QUEUE_UNAVAILABLE' } });
    expect(availableExecution.loadVerified).not.toHaveBeenCalled();
    expect(prisma.backtestJob.updateMany).not.toHaveBeenCalled();
  });

  it('QueueService 只有注入 NAV execution 后才接受 NAV 补投', async () => {
    const job = navJob({ status: 'queued', executionAttempt: 1 });
    const update = vi.fn(async () => job);
    const queue = { add: vi.fn(async () => undefined), getState: vi.fn(async () => null) };
    const events = { publishJob: vi.fn(async () => undefined) };
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => job),
        update,
      },
    };
    const service = new BacktestQueueService(
      prisma as never,
      queue as never,
      events as never,
      {} as never,
    );

    await expect(service.ensureEnqueued(job.id)).resolves.toBe(job);
    expect(service.supportsNavExecution()).toBe(true);
    expect(queue.add).toHaveBeenCalledWith(job.id);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: job.id, mode: 'V3', status: 'queued', executionAttempt: 1 },
        data: expect.objectContaining({ dispatchedAt: expect.any(Date), errorCode: null }),
      }),
    );
  });
});

describe('NAV Worker 入口与取消 CAS', () => {
  it('BacktestService.runCurrent 将 NAV 交给 NAV execution 而非 Exchange Runner', async () => {
    const job = navJob({ status: 'queued', executionAttempt: 0 });
    const prisma = mutablePrisma(job);
    const exchangeRunner = { id: 'exchange-runner', execute: vi.fn() };
    const loadVerified = vi.fn(async (input: unknown) => void input);
    const navExecution = {
      runner: { navId: 'nav-runner-test' },
      loadVerified,
      execute: vi.fn(async () => {
        await loadVerified(job as never);
        return { result: { kind: 'nav-result' }, resultChecksum: '0123456789abcdef' };
      }),
    };
    const runs = new BacktestRunService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      exchangeRunner as never,
      undefined,
      navExecution as never,
    );
    const backtests = new BacktestService(prisma as never, undefined, runs, {} as never);

    const completed = await backtests.runCurrent(job.id);

    expect(completed?.status).toBe('succeeded');
    expect(navExecution.execute).toHaveBeenCalledOnce();
    expect(loadVerified).toHaveBeenCalledOnce();
    expect(exchangeRunner.execute).not.toHaveBeenCalled();
    expect(job.engineVersion).toBe('nav-runner-test');
  });

  it('无 NAV capability 的 malformed NAV marker 不会进入 Exchange Runner', async () => {
    const job = navJob({
      status: 'queued',
      executionAttempt: 0,
      input: { contractVersion: 3, schemaVersion: '3', inputKind: 'nav', runConfig: {} },
    });
    const prisma = mutablePrisma(job);
    const exchangeRunner = { id: 'exchange-runner', execute: vi.fn() };
    const runs = new BacktestRunService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      exchangeRunner as never,
    );
    const backtests = new BacktestService(prisma as never, undefined, runs, {} as never);

    const failed = await backtests.runCurrent(job.id);

    expect(failed?.status).toBe('failed');
    expect(exchangeRunner.execute).not.toHaveBeenCalled();
    expect(job.engineVersion).toBe('nav-runner-unconfigured');
  });

  it.each(['queued', 'running'] as const)('取消 %s 时用状态和 attempt CAS', async (status) => {
    const job = navJob({ status, executionAttempt: 2 });
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(job, data);
      return job;
    });
    const queue = { remove: vi.fn(async () => undefined) };
    const service = new BacktestQueueService(
      {
        backtestJob: {
          findUnique: vi.fn(async () => job),
          update,
        },
      } as never,
      queue as never,
      { publishJob: vi.fn(async () => undefined) } as never,
      {} as never,
    );

    const cancelled = await service.cancel(job.id);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: job.id, mode: 'V3', status, executionAttempt: 2 },
      }),
    );
    if (status === 'queued') {
      expect(cancelled?.status).toBe('cancelled');
      expect(queue.remove).toHaveBeenCalledWith(job.id);
    } else {
      expect(cancelled?.status).toBe('running');
      expect(cancelled?.cancelRequestedAt).toBeInstanceOf(Date);
      expect(queue.remove).not.toHaveBeenCalled();
    }
  });
});

function navJob(input: { status: string; executionAttempt: number; input?: unknown }) {
  return {
    id: runId,
    mode: 'V3',
    status: input.status,
    executionAttempt: input.executionAttempt,
    engineVersion: null as string | null,
    resultChecksum: null as string | null,
    result: null as unknown,
    cancelRequestedAt: null,
    startedAt: null,
    input: input.input ?? {
      contractVersion: 3,
      schemaVersion: '3',
      inputKind: 'nav',
      preparationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      preparationHash: 'a'.repeat(64),
      idempotencyKey: 'nav-consumption-test',
    },
  };
}

function mutablePrisma(job: ReturnType<typeof navJob>) {
  return {
    backtestJob: {
      findUnique: vi.fn(async () => job),
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
          if (
            where.id !== job.id ||
            where.mode !== job.mode ||
            where.status !== job.status ||
            (where.executionAttempt !== undefined &&
              where.executionAttempt !== job.executionAttempt)
          ) {
            return { count: 0 };
          }
          Object.assign(job, data);
          return { count: 1 };
        },
      ),
    },
  };
}
