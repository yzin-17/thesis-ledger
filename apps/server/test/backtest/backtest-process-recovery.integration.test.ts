import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { backtestResultSchemaV3 } from '@thesis-ledger/schemas';
import { startRecoveryRunFixture } from './recovery-run.fixture.js';

const enabled = process.env.BACKTEST_RECOVERY_ISOLATED === '1';

let harness: Awaited<ReturnType<typeof startRecoveryRunFixture>>;

async function claimed(runId: string, owner: number, logs: () => string, timeout = 20_000) {
  await vi.waitFor(
    async () => {
      const job = await harness.database.prisma.backtestJob.findUniqueOrThrow({
        where: { id: runId },
      });
      expect(job, logs()).toMatchObject({
        status: 'running',
        executionAttempt: owner,
        result: null,
      });
    },
    { interval: 100, timeout },
  );
  harness.record('claimed', { runId, owner });
}

async function succeeded(runId: string, owner: number, logs: () => string) {
  await vi.waitFor(
    async () => {
      expect(
        await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: runId } }),
        logs(),
      ).toMatchObject({ status: 'succeeded', executionAttempt: owner });
    },
    { interval: 100, timeout: 25_000 },
  );
  const job = await harness.database.prisma.backtestJob.findUniqueOrThrow({
    where: { id: runId },
  });
  const result = backtestResultSchemaV3.parse(job.result);
  const replay = await harness.runner.run(
    {
      runId,
      snapshotRef: { snapshotId: result.snapshotId, contentHash: result.snapshotId },
      artifactRefs: (await harness.snapshots.v3.replay(runId)).artifacts,
    },
    new AbortController().signal,
  );
  expect(replay.resultChecksum).toBe(result.resultChecksum);
  expect(job.resultChecksum).toBe(result.resultChecksum);
  expect(result.runId).toBe(runId);
  expect(result.simulationFills.length).toBeGreaterThan(0);
  expect(
    await harness.database.prisma.backtestJob.count({
      where: { id: runId, status: 'succeeded', resultChecksum: result.resultChecksum },
    }),
  ).toBe(1);
  const transport = await harness.queue.getJob(runId);
  await vi.waitFor(
    async () => {
      expect(await transport?.getState()).toBe('completed');
    },
    { interval: 100, timeout: 10_000 },
  );
  // 重复投递与再次协调不得改写数据库唯一结果。
  const signature = JSON.stringify(job);
  await harness.dispatch.ensureEnqueued(runId);
  await harness.reconciler.reconcile();
  expect(
    JSON.stringify(
      await harness.database.prisma.backtestJob.findUniqueOrThrow({
        where: { id: runId },
      }),
    ),
  ).toBe(signature);
  harness.record('succeeded', {
    runId,
    owner,
    checksum: result.resultChecksum,
    fills: result.simulationFills.length,
    equityPoints: result.equityCurve.length,
    transportAttempts: transport?.attemptsMade,
    uniqueResults: 1,
    offlineReplay: true,
  });
}

async function rejectOldOwner(runId: string) {
  const before = await harness.database.prisma.backtestJob.findUniqueOrThrow({
    where: { id: runId },
  });
  expect(before).toMatchObject({ status: 'running', executionAttempt: 2 });
  // 与生产 runBacktestAttempt 相同的 status/mode/owner/cancel CAS 条件。
  for (const status of ['succeeded', 'failed', 'queued', 'cancelled']) {
    const changed = await harness.database.prisma.backtestJob.updateMany({
      where: {
        id: runId,
        mode: 'V3',
        status: 'running',
        executionAttempt: 1,
        cancelRequestedAt: null,
      },
      data: { status, resultChecksum: 'stale-owner-must-not-write' },
    });
    expect(changed.count).toBe(0);
  }
  expect(
    await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: runId } }),
  ).toEqual(before);
  harness.record('stale-owner-rejected', {
    runId,
    staleOwner: 1,
    currentOwner: 2,
    rejectedWrites: 4,
  });
}

(enabled ? describe : describe.skip)('当前 Run 的隔离独立进程故障恢复', () => {
  beforeAll(async () => {
    harness = await startRecoveryRunFixture();
  }, 90_000);
  afterAll(async () => {
    await harness?.cleanup();
  }, 30_000);

  it('R1：领取后 SIGKILL，默认 stalled 检测与协调恢复，晚到 owner 提交拒绝', async () => {
    const job = await harness.create();
    const release = await harness.blockSnapshot(job.id);
    const first = harness.startWorker();
    let second: ReturnType<typeof harness.startWorker> | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      await claimed(job.id, 1, first.logs);
      expect(await harness.transport.getState(job.id)).toBe('active');
      const pid = first.worker.pid;
      expect(pid).not.toBe(process.pid);
      await harness.stopWorker(first.worker, 'SIGKILL');
      expect(first.worker.signalCode).toBe('SIGKILL');
      expect(
        await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).toMatchObject({ status: 'running', executionAttempt: 1, result: null });
      second = harness.startWorker();
      expect(second.worker.pid).not.toBe(pid);
      timer = setInterval(
        () =>
          void harness.reconciler
            .reconcile()
            .catch((error: unknown) => harness.record('reconcile-error', { error: String(error) })),
        15_000,
      );
      await claimed(job.id, 2, second.logs, 150_000);
      expect(harness.trace.some((item) => item.event === 'stalled' && item.jobId === job.id)).toBe(
        true,
      );
      await rejectOldOwner(job.id);
      await release(true);
      await succeeded(job.id, 2, second.logs);
    } finally {
      if (timer) clearInterval(timer);
      await harness.stopWorker(first.worker, 'SIGTERM');
      if (second) await harness.stopWorker(second.worker, 'SIGTERM');
      await release();
    }
  }, 180_000);

  it('R2：专属 Redis 短停保留运输记录，查询失败不误恢复 running', async () => {
    const job = await harness.create();
    const release = await harness.blockSnapshot(job.id);
    const live = harness.startWorker();
    let stopped = false;
    try {
      await claimed(job.id, 1, live.logs);
      const before = await harness.database.prisma.backtestJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      harness.cache.stop();
      stopped = true;
      harness.record('redis-stopped', { runId: job.id, container: harness.cache.containerName });
      await expect(harness.transport.getState(job.id)).rejects.toThrow();
      await harness.reconciler.reconcile();
      expect(
        await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).toEqual(before);
      harness.record('redis-query-failure-preserved-owner', { runId: job.id, owner: 1 });
      await harness.cache.start();
      stopped = false;
      await vi.waitFor(
        async () => {
          expect(await harness.transport.getState(job.id)).toBe('active');
        },
        { interval: 250, timeout: 15_000 },
      );
      harness.record('redis-restored', { runId: job.id, preservedTransport: true });
      await release(true);
      await succeeded(job.id, 1, live.logs);
    } finally {
      if (stopped) await harness.cache.start();
      await harness.stopWorker(live.worker, 'SIGTERM');
      await release();
    }
  }, 60_000);

  it('R3：运输记录清空重建，本地 attempt 重置但 durable owner 单调增加', async () => {
    const job = await harness.create();
    const release = await harness.blockSnapshot(job.id);
    const first = harness.startWorker();
    let second: ReturnType<typeof harness.startWorker> | undefined;
    try {
      await claimed(job.id, 1, first.logs);
      await harness.stopWorker(first.worker, 'SIGKILL');
      // 专属随机前缀、专属空 Redis，只删除该前缀下运输键。
      const keys = await harness.redis.keys(`${harness.cache.prefix}:backtest-run:*`);
      expect(keys.length).toBeGreaterThan(0);
      await harness.redis.del(...keys);
      expect(await harness.transport.getState(job.id)).toBeNull();
      await harness.reconciler.reconcile();
      expect(
        await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).toMatchObject({ status: 'queued', executionAttempt: 1, result: null });
      const recreated = await harness.queue.getJob(job.id);
      expect(recreated?.attemptsMade).toBe(0);
      harness.record('transport-recreated', {
        runId: job.id,
        durableOwner: 1,
        attemptsMade: recreated?.attemptsMade,
        deletedKeys: keys.length,
      });
      second = harness.startWorker();
      await claimed(job.id, 2, second.logs);
      await rejectOldOwner(job.id);
      await release(true);
      await succeeded(job.id, 2, second.logs);
    } finally {
      await harness.stopWorker(first.worker, 'SIGTERM');
      if (second) await harness.stopWorker(second.worker, 'SIGTERM');
      await release();
    }
    expect(
      await harness.database.prisma.backtestJob.count({
        where: { status: { in: ['queued', 'running'] } },
      }),
    ).toBe(0);
    harness.record('no-permanent-nonterminal', { count: 0 });
  }, 60_000);
});
