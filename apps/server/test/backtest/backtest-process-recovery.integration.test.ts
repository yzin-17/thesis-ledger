import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { backtestResultSchemaV3 } from '@thesis-ledger/schemas';
import { startRecoveryRunFixture } from './recovery-run.fixture.js';
import { stockSnapshotStoreForJob } from '../../src/backtest/backtest-v3-run-execution.js';
import { requestBacktestCancellation } from '../../src/backtest/backtest-run-cancellation.js';
import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Prisma } from '@prisma/client';
import type { MarketNavReaderV3 } from '../../src/market/market-nav-reader-v3.js';
import { navPreparationFixture } from './nav-preparation.fixtures.js';
import { prepareNavRunConfigV3 } from '../../src/backtest/backtest-nav-preparation.js';
import { BacktestNavPreparationRepository } from '../../src/backtest/backtest-nav-preparation-repository.js';
import { BacktestNavRunService } from '../../src/backtest/backtest-nav-run.service.js';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import { LocalNavSnapshotV3Runner } from '../../src/backtest/backtest-nav-v3-runner.js';
import { BacktestNavRunExecution } from '../../src/backtest/backtest-nav-run-execution.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { backtestNavResultV3Schema } from '@thesis-ledger/schemas';

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
  const store = stockSnapshotStoreForJob(job, harness.snapshots);
  const replay = await harness.runner.run(
    {
      runId,
      snapshotRef: { snapshotId: result.snapshotId, contentHash: result.snapshotId },
      artifactRefs: (await store.v3.replay(runId)).artifacts,
    },
    new AbortController().signal,
    { snapshots: store },
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

  it('R0：创建先落库且未取行情，生产独立Worker物化attempt快照并完成离线一致重放', async () => {
    const beforeBars = harness.http.paths.filter((path) => path.endsWith('/market/bars')).length;
    const job = await harness.create(false);
    expect(job).toMatchObject({ status: 'queued', snapshotId: null, executionAttempt: 0 });
    expect(harness.http.paths.filter((path) => path.endsWith('/market/bars'))).toHaveLength(beforeBars);
    const worker = harness.startWorker();
    try {
      await succeeded(job.id, 1, worker.logs);
      const saved = await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(saved.input).toMatchObject({ snapshotStorageAttempt: 1 });
      harness.record('pending-create-worker-materialized', { runId: job.id, attempt: 1, creationMarketRequests: 0 });
    } finally {
      await harness.stopWorker(worker.worker, 'SIGTERM');
    }
  }, 45_000);

  it('R4：真实DB同键并发与回执丢失后路由改变仍找回原Run，派发失败保留queued', async () => {
    const request = harness.requestFor(randomUUID());
    const [first, second] = await Promise.all([harness.service.createRun(request), harness.service.createRun(request)]);
    expect(first.id).toBe(second.id);
    expect(await harness.database.prisma.backtestJob.count({ where: { strategyVersionId: request.strategyVersionId, idempotencyKey: request.idempotencyKey } })).toBe(1);
    await harness.database.prisma.desiredProviderPolicy.update({ where: { consumer: 'thesis-ledger' }, data: { revision: 8 } });
    try {
      expect((await harness.service.createRun(request)).id).toBe(first.id);
      await expect(harness.service.createRun({ ...request, idempotencyKey: randomUUID() })).rejects.toThrow();
    } finally {
      await harness.database.prisma.desiredProviderPolicy.update({ where: { consumer: 'thesis-ledger' }, data: { revision: 7 } });
      await requestBacktestCancellation(harness.database.prisma, first.id);
    }
    const offline = harness.requestFor(randomUUID());
    harness.cache.stop();
    let queuedId: string | undefined;
    try {
      const queued = await harness.service.createRun(offline);
      queuedId = queued.id;
      expect(queued).toMatchObject({ status: 'queued', snapshotId: null, executionAttempt: 0 });
      expect(await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: queued.id } })).toMatchObject({ status: 'queued' });
    } finally { await harness.cache.start(); }
    expect(queuedId).toBeDefined();
    await harness.reconciler.reconcile();
    expect(await harness.transport.getState(queuedId!)).toBe('waiting');
    await requestBacktestCancellation(harness.database.prisma, queuedId!);
    harness.record('durable-create-idempotency-dispatch-recovery', { concurrentSameRun: true, lostReceiptFoundBeforeRouteGuard: true, dispatchFailurePreserved: true });
  }, 25_000);

  it('R5：首份快照文件写入后 SIGKILL，下一 attempt 从冻结行情完整重建', async () => {
    const job = await harness.create(false);
    const first = harness.startWorker('partial-snapshot');
    const partialStore = harness.snapshots.forAttempt(job.id, 1);
    const artifacts = resolve(harness.database.artifactRoot, 'attempts', job.id, '1', 'artifacts', job.id);
    const firstFile = 'metadata/snapshot-metadata-v3.parquet';
    let second: ReturnType<typeof harness.startWorker> | undefined;
    try {
      await vi.waitFor(() => expect(harness.trace, first.logs()).toContainEqual(expect.objectContaining({
        event: 'snapshot-first-artifact-written', key: `${job.id}/${firstFile}`,
      })), { interval: 50, timeout: 20_000 });
      const partial = await readFile(resolve(artifacts, firstFile));
      expect(partial.subarray(0, 4).toString()).toBe('PAR1');
      expect(partial.subarray(-4).toString()).toBe('PAR1');
      await expect(access(resolve(artifacts, 'execution/bars.parquet'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await partialStore.v3.load(job.id, true)).toMatchObject({ status: 'building' });
      await harness.stopWorker(first.worker, 'SIGKILL');
      expect(first.worker.signalCode).toBe('SIGKILL');
      expect(await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } }))
        .toMatchObject({ status: 'running', executionAttempt: 1, snapshotId: null, result: null });

      const sourceReads = () => harness.http.paths.filter((path) => path === '/api/v1/thesis-ledger/market/bars').length;
      const before = sourceReads();
      second = harness.startWorker();
      expect(second.worker.pid).not.toBe(first.worker.pid);
      await vi.waitFor(() => expect(harness.trace, second!.logs()).toContainEqual(expect.objectContaining({
        event: 'stalled', jobId: job.id,
      })), { interval: 100, timeout: 145_000 });
      // BullMQ 首次补投时持久 owner 仍为 running。等运输结束，再推进生产协调器的一轮检查。
      await vi.waitFor(async () => expect(await harness.transport.getState(job.id)).toBe('completed'),
        { interval: 100, timeout: 10_000 });
      await harness.reconciler.reconcile();
      await succeeded(job.id, 2, second.logs);
      const saved = await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(saved.input).toMatchObject({ snapshotStorageAttempt: 2 });
      const complete = await harness.snapshots.forAttempt(job.id, 2).v3.replay(job.id);
      expect(complete).toMatchObject({ status: 'finalized', contentHash: saved.snapshotId,
        quality: { completeness: 'complete' } });
      expect(complete.artifacts.map((ref) => ref.key)).toEqual(expect.arrayContaining([
        `${job.id}/${firstFile}`, `${job.id}/execution/bars.parquet`,
      ]));
      expect(await partialStore.v3.load(job.id, true)).toMatchObject({ status: 'building' });
      expect(await readFile(resolve(artifacts, firstFile))).toEqual(partial);
      expect(sourceReads()).toBe(before);
      harness.record('partial-snapshot-process-recovery', { runId: job.id, owner: 2, storageAttempt: 2,
        partialBytes: partial.length, finalizedArtifacts: complete.artifacts.length, additionalSourceRequests: 0 });
    } finally {
      await harness.stopWorker(first.worker, 'SIGTERM');
      if (second) await harness.stopWorker(second.worker, 'SIGTERM');
    }
  }, 180_000);

  it('R6：完整文件关联数据库前中断并退出进程，下一attempt离线复用同套快照', async () => {
    const job = await harness.create(false);
    // 专属数据库触发器只使本Run第一次发布失败；sequence不随事务回滚。
    harness.database.adminSql(`
      CREATE SEQUENCE isolated_snapshot_publication_once;
      CREATE FUNCTION isolated_snapshot_publication_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."id" = '${job.id}' AND OLD."snapshotId" IS NULL AND NEW."snapshotId" IS NOT NULL
          AND nextval('isolated_snapshot_publication_once') = 1 THEN
          RAISE EXCEPTION 'isolated_snapshot_publication_interrupted';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER isolated_snapshot_publication BEFORE UPDATE ON "BacktestJob"
        FOR EACH ROW EXECUTE FUNCTION isolated_snapshot_publication_failure();
    `);
    const first = harness.startWorker();
    let second: ReturnType<typeof harness.startWorker> | undefined;
    try {
      await vi.waitFor(async () => {
        const current = await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } });
        expect(current, first.logs()).toMatchObject({ status: 'queued', executionAttempt: 1, snapshotId: null });
        expect(current.errorSummary).toContain('isolated_snapshot_publication_interrupted');
      }, { interval: 50, timeout: 20_000 });
      await harness.stopWorker(first.worker, 'SIGKILL');
      const completed = await harness.snapshots.forAttempt(job.id, 1).v3.replay(job.id);
      expect(completed.status).toBe('finalized');
      const original = JSON.stringify(completed);
      const beforeRequests = harness.http.paths.length;
      await harness.database.prisma.desiredProviderPolicy.update({ where: { consumer: 'thesis-ledger' }, data: { revision: 8 } });
      second = harness.startWorker();
      await succeeded(job.id, 2, second.logs);
      const saved = await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(saved.input).toMatchObject({ snapshotStorageAttempt: 1 });
      expect(JSON.stringify(await harness.snapshots.forAttempt(job.id, 1).v3.replay(job.id))).toBe(original);
      expect(harness.http.paths).toHaveLength(beforeRequests);
      harness.record('complete-snapshot-publication-process-recovery', { runId: job.id, owner: 2,
        storageAttempt: 1, completeFilesUnchanged: true, additionalSourceRequests: 0 });
    } finally {
      await harness.stopWorker(first.worker, 'SIGTERM');
      if (second) await harness.stopWorker(second.worker, 'SIGTERM');
      await harness.database.prisma.desiredProviderPolicy.update({ where: { consumer: 'thesis-ledger' }, data: { revision: 7 } });
      harness.database.adminSql('DROP TRIGGER isolated_snapshot_publication ON "BacktestJob"; DROP FUNCTION isolated_snapshot_publication_failure(); DROP SEQUENCE isolated_snapshot_publication_once;');
    }
  }, 45_000);

  it('R7：NAV真实准备凭证先消费为queued，独立生产processor冻结并完成', async () => {
    const fixture = navPreparationFixture();
    const strategy = await harness.database.prisma.strategy.create({ data: { name: '隔离NAV独立Worker', schemaVersion: 2 } });
    const version = await harness.database.prisma.strategyVersion.create({ data: { strategyId: strategy.id, version: 1,
      schemaVersion: 2, schema: fixture.strategy as unknown as Prisma.InputJsonValue } });
    const request = { ...fixture.request, strategyVersionId: version.id };
    const prepared = await prepareNavRunConfigV3({ ...fixture.options, request });
    const receipt = await new BacktestNavPreparationRepository(harness.database.prisma).save(request, prepared);
    const reader = { read: fixture.read, currentRouteState: vi.fn(async () => structuredClone(prepared.selection.routeState)) };
    const store = new LocalNavSnapshotStore(harness.database.artifactRoot);
    const navDispatch = new BacktestQueueService(harness.database.prisma, harness.transport,
      { publishJob: async () => undefined }, new BacktestNavRunExecution(harness.database.prisma, store));
    const service = new BacktestNavRunService(harness.database.prisma, reader as unknown as MarketNavReaderV3, store, navDispatch);
    let run: Awaited<ReturnType<BacktestNavRunService['create']>>;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T15:03:00Z'));
    try {
      run = await service.create({ contractVersion: 1, preparationId: receipt.preparationId,
        preparationHash: receipt.preparationHash, idempotencyKey: randomUUID() });
      expect(run).toMatchObject({ status: 'queued', executionAttempt: 0, snapshotId: null });
    } finally { vi.useRealTimers(); }
    if (!run) throw Error('NAV未创建');
    const beforeRequests = harness.http.paths.length;
    const live = harness.startWorker();
    try {
      await vi.waitFor(async () => {
        expect(await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: run.id } }), live.logs())
          .toMatchObject({ status: 'succeeded', executionAttempt: 1 });
      }, { interval: 50, timeout: 20_000 });
      const saved = await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: run.id } });
      expect(saved.input).toMatchObject({ snapshotStorageAttempt: 1 });
      const result = backtestNavResultV3Schema.parse(saved.result);
      const runner = new LocalNavSnapshotV3Runner(store.forAttempt(run.id, 1));
      const frozen = await store.forAttempt(run.id, 1).replay(run.id);
      const artifactRefs = [frozen.manifest.artifact, frozen.manifest.contextArtifact].map((ref) => ({ ...ref,
        artifactId: ref.contentHash, key: `${run.id}/${ref.key}` }));
      const runnerRequest = { runId: run.id, snapshotRef: { snapshotId: saved.snapshotId!, contentHash: saved.snapshotId! }, artifactRefs };
      expect(await runner.runNav(runnerRequest, new AbortController().signal)).toEqual(result);
      expect(await runner.runNav(runnerRequest, new AbortController().signal)).toEqual(result);
      expect(saved.engineVersion).toBe(runner.navId);
      expect(result.analyticsVersion).toBe('research-analytics-v2');
      expect(harness.http.paths).toHaveLength(beforeRequests);
      harness.record('nav-pending-create-independent-production-worker', { runId: run.id, engine: runner.navId,
        checksum: result.resultChecksum, storageAttempt: 1, additionalSourceRequests: 0, completeReplays: 2 });
    } finally { await harness.stopWorker(live.worker, 'SIGTERM'); }
  }, 35_000);

  it.each(['indicator', 'simulation'] as const)('C：独立Worker的%s真实CPU取消后五秒内停止并释放槽位', async (stage) => {
    const job = await harness.create(false);
    const live = harness.startWorker(stage);
    try {
      await vi.waitFor(() => expect(harness.trace.some((event) => event.event === 'cpu-started' && event.jobId === job.id)).toBe(true), { interval: 50, timeout: 20_000 });
      const registered = await requestBacktestCancellation(harness.database.prisma, job.id);
      expect(registered.job?.cancelRequestedAt).toBeInstanceOf(Date);
      const registeredAt = registered.job!.cancelRequestedAt!.getTime();
      const repeated = await requestBacktestCancellation(harness.database.prisma, job.id);
      expect(repeated.job?.cancelRequestedAt).toEqual(registered.job?.cancelRequestedAt);
      const probe = await harness.queue.add('slot-probe', { probe: true });
      await vi.waitFor(async () => {
        expect(harness.trace.find((event) => event.event === 'cpu-stopped' && event.jobId === job.id)).toMatchObject({ aborted: true });
        expect(await probe.getState()).toBe('completed');
      }, { interval: 50, timeout: 5_000 });
      const elapsed = Date.now() - registeredAt;
      expect(elapsed).toBeLessThanOrEqual(5_000);
      const saved = await harness.database.prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(saved).toMatchObject({ status: 'cancelled', executionAttempt: 1, result: null, resultChecksum: null });
      const late = await harness.database.prisma.backtestJob.updateMany({ where: {
        id: job.id, status: 'running', executionAttempt: 1, cancelRequestedAt: null,
      }, data: { status: 'succeeded', resultChecksum: 'late-result' } });
      expect(late.count).toBe(0);
      harness.record('cpu-cancellation-slot-released', { runId: job.id, stage, registeredAt: new Date(registeredAt).toISOString(),
        elapsedMs: elapsed, calculationStopped: true, nextJobCompleted: true, lateCommitRejected: true });
    } finally { await harness.stopWorker(live.worker, 'SIGTERM'); }
  }, 35_000);

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
