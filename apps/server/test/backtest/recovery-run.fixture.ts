import 'reflect-metadata';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Prisma } from '@prisma/client';
import { vi } from 'vitest';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestQueueReconciler } from '../../src/backtest/backtest-queue.reconciler.js';
import { BacktestEventPublisher } from '../../src/backtest/backtest-event.publisher.js';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { RedisService } from '../../src/platform/redis.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { preparationStampFor, preparedRevisionReader } from './v3-preparation-fixtures.js';
import { startWorkerDsaHttpFixture } from './worker-dsa-http-fixture.js';
import { startIsolatedRecoveryPostgres } from './recovery-postgres.fixture.js';
import { startRecoveryRedis } from './recovery-redis.fixture.js';

export async function startRecoveryRunFixture() {
  const database = await startIsolatedRecoveryPostgres();
  let cache: Awaited<ReturnType<typeof startRecoveryRedis>> | undefined;
  let http: Awaited<ReturnType<typeof startWorkerDsaHttpFixture>> | undefined;
  let connection: Redis | undefined;
  let eventsRedis: RedisService | undefined;
  let queue: Queue | undefined;
  const workers: ChildProcess[] = [];
  const trace: Record<string, unknown>[] = [];
  const record = (event: string, detail: Record<string, unknown> = {}) => {
    const item = { at: new Date().toISOString(), event, ...detail };
    trace.push(item);
    console.log('RECOVERY_EVIDENCE', JSON.stringify(item));
  };
  const stopWorker = async (worker: ChildProcess, signal: 'SIGKILL' | 'SIGTERM') => {
    if (!workers.includes(worker) || !worker.pid) throw new Error('拒绝终止非本测试 Worker');
    if (worker.exitCode !== null || worker.signalCode !== null) return;
    const stopped = new Promise<void>((done) => worker.once('exit', () => done()));
    const timer = setTimeout(() => worker.kill('SIGKILL'), 5_000);
    worker.kill(signal);
    await stopped;
    clearTimeout(timer);
    record('worker-exit', { pid: worker.pid, signal: worker.signalCode, code: worker.exitCode });
  };
  const cleanup = async () => {
    for (const worker of workers) await stopWorker(worker, 'SIGTERM');
    await queue?.close();
    connection?.disconnect();
    eventsRedis?.client.disconnect();
    await http?.close();
    vi.unstubAllEnvs();
    await cache?.cleanup();
    await database.cleanup();
    record('cleanup-complete', {
      workerPids: workers.map((worker) => worker.pid),
      postgres: database.containerName,
      redis: cache?.containerName,
    });
  };
  try {
    cache = await startRecoveryRedis();
    const ownedCache = cache;
    http = await startWorkerDsaHttpFixture(database.databaseUrl, cache.redisUrl, database.prisma);
    const { fixture } = http;
    connection = new Redis(cache.redisUrl, {
      lazyConnect: true,
      connectTimeout: 1_000,
      maxRetriesPerRequest: 1,
    });
    connection.on('error', () => undefined);
    queue = new Queue('backtest-run', { connection, prefix: cache.prefix });
    const ownedQueue = queue;
    const transport = {
      add: (id: string) =>
        ownedQueue.add(
          'run',
          { jobId: id },
          {
            jobId: id,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: { age: 86_400, count: 1_000 },
            removeOnFail: { age: 604_800, count: 1_000 },
          },
        ),
      getState: async (id: string) => (await ownedQueue.getJob(id))?.getState() ?? null,
      remove: async (id: string) => {
        await (await ownedQueue.getJob(id))?.remove();
      },
    };
    eventsRedis = new RedisService();
    const events = new BacktestEventPublisher(
      database.prisma,
      eventsRedis,
      new ResultReadPolicyService(database.prisma),
    );
    const dispatch = new BacktestQueueService(database.prisma, transport, events);
    const reconciler = new BacktestQueueReconciler(database.prisma, dispatch, transport, events);
    const snapshots = new LocalSnapshotStore(database.artifactRoot);
    const runner = new LocalSnapshotV3Runner(snapshots);
    const service = new BacktestRunService(
      database.prisma,
      dispatch,
      snapshots,
      new DsaSnapshotBuilder(http.dsa, snapshots, http.reader),
      runner,
      new BacktestCreationGuardService(database.prisma, preparedRevisionReader() as never),
    );
    const strategy = await database.prisma.strategy.create({
      data: {
        name: `隔离恢复-${randomUUID()}`,
        schemaVersion: 2,
      },
    });
    const version = await database.prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        version: 1,
        schemaVersion: 2,
        schema: fixture.input.strategy as unknown as Prisma.InputJsonValue,
      },
    });
    record('isolation', {
      postgres: database.containerName,
      redis: cache.containerName,
      database: 'backtest_recovery',
      role: 'backtest_recovery_app',
      postgresPort: new URL(database.databaseUrl).port,
      redisPort: new URL(cache.redisUrl).port,
      prefix: cache.prefix,
      structureHead: database.source.currentHead,
      migrations: database.source.migrations.length,
      tables: database.source.expectedTables.length,
      artifactRoot: database.artifactRoot,
      buildRoot: process.env.BACKTEST_RECOVERY_BUILD_ROOT,
    });
    return {
      database,
      cache,
      redis: connection,
      queue: ownedQueue,
      transport,
      dispatch,
      reconciler,
      snapshots,
      runner,
      record,
      trace,
      cleanup,
      stopWorker,
      async create() {
        const created = await service.createRun({
          contractVersion: 3,
          strategyVersionId: version.id,
          idempotencyKey: randomUUID(),
          runConfig: fixture.input.runConfig,
          preparationStamp: preparationStampFor(
            fixture.input.strategy,
            fixture.input.runConfig,
            version.id,
          ),
        });
        if (created.status !== 'queued') throw new Error(`创建失败: ${created.errorSummary}`);
        if ((await transport.getState(created.id)) !== 'waiting')
          throw new Error('创建后未进入专属队列');
        record('created', { runId: created.id, owner: created.executionAttempt });
        return created;
      },
      async blockSnapshot(runId: string) {
        const path = resolve(database.artifactRoot, 'snapshots', runId, 'finalized.json');
        const original = await readFile(path);
        await rename(path, `${path}.recovery-original`);
        execFileSync('mkfifo', [path]);
        let released = false;
        return async (unblockLiveReader = false) => {
          if (released) return;
          if (unblockLiveReader) await writeFile(path, original);
          await rm(path);
          await rename(`${path}.recovery-original`, path);
          if (!(await readFile(path)).equals(original)) throw new Error('冻结 manifest 字节改变');
          released = true;
          record('snapshot-released', { runId });
        };
      },
      startWorker() {
        const worker = spawn(
          process.execPath,
          [resolve('test/backtest/recovery-worker.fixture.mjs')],
          {
            env: {
              ...process.env,
              NODE_ENV: 'test',
              DATABASE_URL: database.databaseUrl,
              REDIS_URL: ownedCache.redisUrl,
              BACKTEST_SNAPSHOT_ROOT: database.artifactRoot,
              BACKTEST_RECOVERY_QUEUE_PREFIX: ownedCache.prefix,
              DSA_BASE_URL: 'http://127.0.0.1:1',
              THESIS_LEDGER_DSA_TOKEN: 'offline-recovery',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        workers.push(worker);
        worker.on('error', (error) => record('worker-spawn-error', { error: error.message }));
        let logs = '';
        const observe = (bytes: Buffer) => {
          logs = (logs + bytes.toString()).slice(-8_000);
          for (const line of bytes.toString().split('\n')) {
            if (line.startsWith('{"event":')) {
              try {
                record('worker-event', JSON.parse(line) as Record<string, unknown>);
              } catch {
                /* 非完整行保留在日志 */
              }
            }
          }
        };
        worker.stdout?.on('data', observe);
        worker.stderr?.on('data', observe);
        record('worker-spawn', { pid: worker.pid });
        return { worker, logs: () => logs };
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
