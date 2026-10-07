import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { UnrecoverableError, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BacktestNavPreparationRepository } from '../../src/backtest/backtest-nav-preparation-repository.js';
import { BacktestNavPreparationService } from '../../src/backtest/backtest-nav-preparation.service.js';
import { BacktestNavRunExecution } from '../../src/backtest/backtest-nav-run-execution.js';
import { BacktestNavRunService } from '../../src/backtest/backtest-nav-run.service.js';
import {
  BacktestBullQueue,
  BACKTEST_MAX_ATTEMPTS,
  BACKTEST_QUEUE_NAME,
} from '../../src/backtest/backtest-bull-queue.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import type { BacktestQueueData } from '../../src/backtest/backtest-bull-queue.js';
import { prepareBacktestExecution } from '../../src/backtest/backtest-execution-owner.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { MarketNavReaderV3 } from '../../src/market/market-nav-reader-v3.js';
import { navPreparationFixture } from './nav-preparation.fixtures.js';
import { startIsolatedNavPostgres } from './nav-postgres.integration-harness.js';
import { startIsolatedNavRedis } from './nav-worker-redis.integration-harness.js';

const enabled = process.env.E01_N3_POSTGRES === '1';
const postgresDescribe = enabled ? describe : describe.skip;
const FIXTURE_NOW = new Date('2026-09-30T15:02:30.000Z');
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

type NavReaderFixture = Pick<MarketNavReaderV3, 'read' | 'currentRouteState'>;

postgresDescribe('NAV 实际 BullMQ Worker 与隔离 PostgreSQL/Redis 闭环', () => {
  let fixtureDb: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
  let redisRuntime: Awaited<ReturnType<typeof startIsolatedNavRedis>>;
  let workerConnection: Redis;
  let queueTransport: BacktestBullQueue;
  let queueService: BacktestQueueService;
  let navExecution: BacktestNavRunExecution;
  let navRuns: BacktestNavRunService;
  let preparation: BacktestNavPreparationService;
  let backtests: BacktestService;
  let worker: Worker<BacktestQueueData>;

  beforeAll(async () => {
    fixtureDb = await startIsolatedNavPostgres();
    redisRuntime = await startIsolatedNavRedis();

    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', fixtureDb.databaseUrl);
    vi.stubEnv('REDIS_URL', redisRuntime.redisUrl);
    vi.stubEnv('DSA_BASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('DSA_TIMEOUT_MS', '120000');
    vi.stubEnv('THESIS_LEDGER_DSA_TOKEN', 'nav-worker-integration-token');
    vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', 'nav-worker-integration-key-32-bytes');
    vi.stubEnv('BACKTEST_SNAPSHOT_ROOT', join(fixtureDb.artifactRoot, 'nav-worker-snapshots'));

    const redisWitness = new Redis(redisRuntime.redisUrl, { maxRetriesPerRequest: null });
    try {
      expect(await redisWitness.dbsize()).toBe(0);
    } finally {
      await redisWitness.quit();
    }

    const prisma = fixtureDb.prisma as PrismaService;
    const fixture = navPreparationFixture();
    const routeState: Awaited<ReturnType<MarketNavReaderV3['currentRouteState']>> = {
      desiredRevision: 1,
      effectivePolicyRevision: 1,
      catalogRevision: 2,
      targets: [
        {
          providerId: 'efinance',
          upstreamSource: 'eastmoney',
          routeIndex: 0,
          eligible: true,
          reason: null,
          catalogState: 'ready',
        },
      ],
      routeTarget: fixture.source.request.routeTarget,
    };
    const reader = {
      read: vi.fn(async (input: Record<string, unknown>) => {
        const selected = await fixture.read(input as never);
        return {
          ...selected,
          response: {
            ...selected.response,
            requestId: selected.request.requestId,
            symbol: selected.request.symbol,
            routeKey: selected.request.routeKey,
            routeTarget: selected.request.routeTarget,
            desiredRevision: selected.request.desiredRevision,
            effectivePolicyRevision: selected.request.effectivePolicyRevision,
            catalogRevision: selected.request.catalogRevision,
            dataAsOf: selected.request.dataAsOf,
          },
        };
      }),
      currentRouteState: vi.fn(async () => structuredClone(routeState)),
    } satisfies NavReaderFixture;

    const snapshotStore = new LocalNavSnapshotStore(
      join(fixtureDb.artifactRoot, 'nav-worker-snapshots'),
    );
    navExecution = new BacktestNavRunExecution(prisma, snapshotStore);
    queueTransport = new BacktestBullQueue();
    queueService = new BacktestQueueService(
      prisma,
      queueTransport,
      {
        publishJob: async () => undefined,
      },
      navExecution,
    );
    navRuns = new BacktestNavRunService(
      prisma,
      reader as unknown as MarketNavReaderV3,
      snapshotStore,
      queueService,
    );
    preparation = new BacktestNavPreparationService(
      prisma,
      reader as unknown as MarketNavReaderV3,
      120_000,
      new BacktestNavPreparationRepository(prisma),
    );
    const runService = new BacktestRunService(
      prisma,
      queueService,
      undefined,
      undefined,
      undefined,
      undefined,
      navExecution,
    );
    backtests = new BacktestService(
      prisma,
      queueService,
      runService,
      new ResultReadPolicyService(prisma),
    );

    workerConnection = new Redis(redisRuntime.redisUrl, { maxRetriesPerRequest: null });
    worker = new Worker<BacktestQueueData>(
      BACKTEST_QUEUE_NAME,
      async (job: Job<BacktestQueueData>) => {
        const preparedExecution = await prepareBacktestExecution(
          prisma,
          job.data.jobId,
          BACKTEST_MAX_ATTEMPTS,
        );
        if (preparedExecution.action !== 'run') return backtests.status(job.data.jobId);
        try {
          return await backtests.runCurrent(job.data.jobId, {
            attempt: preparedExecution.ownerAttempt,
            maxAttempts: preparedExecution.maxAttempts,
          });
        } catch (error) {
          if (error && typeof error === 'object' && 'unrecoverable' in error) {
            throw new UnrecoverableError(
              error instanceof Error ? error.message : '回测输入不可执行',
            );
          }
          throw error;
        }
      },
      { connection: workerConnection, concurrency: 1 },
    );
    await worker.waitUntilReady();
    await worker.pause();
  }, 240_000);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterAll(async () => {
    await worker?.close();
    await workerConnection?.quit();
    await queueTransport?.onModuleDestroy();
    await fixtureDb?.cleanup();
    await redisRuntime?.cleanup();
    vi.unstubAllEnvs();
  }, 30_000);

  async function createQueuedRun() {
    await worker.pause();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXTURE_NOW);
    try {
      const fixture = navPreparationFixture();
      const strategy = await fixtureDb.prisma.strategy.create({
        data: { name: `N3 NAV Worker 隔离验收 ${randomUUID()}`, schemaVersion: 2 },
      });
      const version = await fixtureDb.prisma.strategyVersion.create({
        data: {
          strategyId: strategy.id,
          version: 1,
          schemaVersion: 2,
          schema: fixture.strategy as unknown as Prisma.InputJsonValue,
        },
      });
      const request = { ...fixture.request, strategyVersionId: version.id };
      const prepared = await preparation.prepare(request);
      if (prepared.status !== 'prepared' || !prepared.receipt) {
        throw new Error('NAV 隔离 fixture 未能生成准备凭证');
      }
      const run = await navRuns.create({
        contractVersion: 3,
        preparationId: prepared.receipt.preparationId,
        preparationHash: prepared.receipt.preparationHash,
        idempotencyKey: randomUUID(),
      });
      if (!run || run.status !== 'queued') throw new Error(`NAV Run 未排队: ${run?.status}`);
      return run;
    } finally {
      vi.useRealTimers();
    }
  }

  async function waitForStatus(id: string, status: string, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = await fixtureDb.prisma.backtestJob.findUniqueOrThrow({ where: { id } });
      if (job.status === status) return job;
      await sleep(50);
    }
    const current = await fixtureDb.prisma.backtestJob.findUnique({ where: { id } });
    throw new Error(`NAV Worker 等待终态超时: expected=${status}, actual=${current?.status}`);
  }

  it('重复投递后由实际 Queue/Worker 执行生产入口并返回公开 NAV 成功结果', async () => {
    const run = await createQueuedRun();
    const stored = await fixtureDb.prisma.backtestJob.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.status).toBe('queued');
    expect(await queueTransport.getState(run.id)).toBe('waiting');

    const runCurrent = vi.spyOn(backtests, 'runCurrent');
    await queueTransport.add(run.id);
    await queueTransport.add(run.id);
    await worker.resume();

    const completed = await waitForStatus(run.id, 'succeeded');
    await worker.pause();
    expect(completed).toMatchObject({ status: 'succeeded', executionAttempt: 1 });
    expect(runCurrent).toHaveBeenCalledTimes(1);

    const publicRun = await navRuns.read(run.id);
    expect(publicRun).toMatchObject({ id: run.id, inputKind: 'nav', status: 'succeeded' });
    expect(publicRun.result).toMatchObject({ runId: run.id, inputKind: 'nav' });
    expect(completed.resultChecksum).toBe(
      (completed.result as { resultChecksum: string }).resultChecksum,
    );
  }, 60_000);

  it('真实 PostgreSQL 取消标记阻止晚到 NAV 结果 CAS 提交', async () => {
    const run = await createQueuedRun();
    const original = navExecution.execute.bind(navExecution);
    let markStarted: () => void = () => undefined;
    let releaseExecution: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      releaseExecution = resolve;
    });
    vi.spyOn(navExecution, 'execute').mockImplementation(async (job, signal) => {
      if (job.id === run.id) {
        markStarted();
        await paused;
        return original(job, new AbortController().signal);
      }
      return original(job, signal);
    });

    await worker.resume();
    await Promise.race([
      started,
      sleep(15_000).then(() => {
        throw new Error('NAV Worker 未进入受控执行');
      }),
    ]);
    expect(
      await fixtureDb.prisma.backtestJob.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ status: 'running', executionAttempt: 1 });

    const requested = await queueService.cancel(run.id);
    expect(requested).toMatchObject({ status: 'running', cancelRequestedAt: expect.any(Date) });
    releaseExecution();

    const cancelled = await waitForStatus(run.id, 'cancelled');
    await worker.pause();
    expect(cancelled.cancelRequestedAt).toBeInstanceOf(Date);
    expect(cancelled.result).toBeNull();
    expect(await navRuns.read(run.id)).toMatchObject({ id: run.id, status: 'cancelled' });
  }, 60_000);

  it('实际 Worker 对可重试故障执行有界三次尝试并收敛为 failed', async () => {
    const run = await createQueuedRun();
    const original = navExecution.execute.bind(navExecution);
    const execute = vi.spyOn(navExecution, 'execute').mockImplementation(async (job, signal) => {
      if (job.id === run.id) throw new Error('controlled transient failure');
      return original(job, signal);
    });

    await worker.resume();
    const failed = await waitForStatus(run.id, 'failed');
    await worker.pause();

    expect(execute).toHaveBeenCalledTimes(BACKTEST_MAX_ATTEMPTS);
    expect(failed).toMatchObject({
      status: 'failed',
      executionAttempt: BACKTEST_MAX_ATTEMPTS,
      errorCode: 'INTERNAL_ERROR',
    });
    expect(await queueTransport.getState(run.id)).toBe('failed');
  }, 60_000);
});
