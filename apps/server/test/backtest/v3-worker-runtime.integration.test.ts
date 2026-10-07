import 'reflect-metadata';
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  backtestResultSchemaV3,
  marketDataMultiWindowResponseV3Schema,
} from '@thesis-ledger/schemas';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestBullQueue } from '../../src/backtest/backtest-bull-queue.js';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import { preparationStampFor, preparedRevisionReader } from './v3-preparation-fixtures.js';
import { startWorkerHttpFixture } from './worker-http-fixture.js';
import { startWorkerDsaHttpFixture } from './worker-dsa-http-fixture.js';
import { makeMultiWindowResponseV3 } from './v3-multi-window-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { startIsolatedNavPostgres } from './nav-postgres.integration-harness.js';
import { startIsolatedNavRedis } from './nav-worker-redis.integration-harness.js';
import { verifyPersistedCurrentRunBoundary } from './current-run-persisted-boundary.fixtures.js';

let databaseUrl = process.env.BACKTEST_WORKER_TEST_DATABASE_URL;
let redisUrl = process.env.BACKTEST_WORKER_TEST_REDIS_URL;
const isolated = process.env.C04_WORKER_ISOLATED === '1';
const enabled = isolated || Boolean(databaseUrl && redisUrl);

(enabled ? describe : describe.skip)('V3 实际 Worker 进程与隔离队列', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let queue: BacktestBullQueue;
  let worker: ChildProcess | undefined;
  let root: string;
  let http: Awaited<ReturnType<typeof startWorkerHttpFixture>> | undefined;
  let dsaHttp: Awaited<ReturnType<typeof startWorkerDsaHttpFixture>> | undefined;
  const errors: string[] = [];
  let ownedDatabase: Awaited<ReturnType<typeof startIsolatedNavPostgres>> | undefined;
  let ownedRedis: Awaited<ReturnType<typeof startIsolatedNavRedis>> | undefined;
  const witness = () =>
    Promise.all(
      [
        'Account',
        'Position',
        'LedgerEvent',
        'Trade',
        'AccountLedgerState',
        'PortfolioSnapshot',
        'JournalEntry',
        'JournalReviewSnapshot',
        'TradePlan',
        'TradeEntryLeg',
        'TradeBaselineComponent',
        'TradeCorporateActionAdjustment',
        'TradeCloseSlice',
        'TradeCloseAllocation',
        'TradeDividendAttribution',
        'TradeEvidenceSource',
      ].map((table) =>
        prisma.$queryRawUnsafe(`SELECT count(*)::text AS count,
    md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS digest FROM "${table}" t`),
      ),
    );
  beforeAll(async () => {
    if (isolated) {
      ownedDatabase = await startIsolatedNavPostgres();
      ownedRedis = await startIsolatedNavRedis();
      databaseUrl = ownedDatabase.databaseUrl;
      redisUrl = ownedRedis.redisUrl;
    }
    const db = new URL(databaseUrl!);
    const cache = new URL(redisUrl!);
    if (
      db.hostname !== '127.0.0.1' ||
      db.pathname !== (isolated ? '/nav_n2_6' : '/backtest_worker_fixture') ||
      cache.hostname !== '127.0.0.1' ||
      cache.port === '6379'
    ) {
      throw new Error('仅允许专用本地数据库与非默认端口的隔离 Redis');
    }
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    expect(await prisma.$queryRaw`SELECT current_database() AS name`).toEqual([
      { name: isolated ? 'nav_n2_6' : 'backtest_worker_fixture' },
    ]);
    redis = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    expect(await redis.dbsize()).toBe(0);
    root = await mkdtemp(join(tmpdir(), 'v3-worker-runtime-'));
    for (const mode of ['actual', 'shadow']) {
      const account = await prisma.account.create({
        data: { name: `${mode} 隔离哨兵`, type: 'broker', mode },
      });
      await prisma.ledgerEvent.create({
        data: {
          accountId: account.id,
          type: 'CASH_DEPOSIT',
          occurredAt: new Date('2026-01-01'),
          payload: { amount: '123.45', currency: 'CNY' },
        },
      });
      await prisma.journalEntry.create({ data: { accountId: account.id, reason: '保留既有记录' } });
    }
  });
  afterAll(async () => {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      const stopped = new Promise<void>((resolveExit) => worker!.once('exit', () => resolveExit()));
      worker.kill('SIGTERM');
      const timer = setTimeout(() => worker?.kill('SIGKILL'), 5_000);
      await stopped;
      clearTimeout(timer);
    }
    await queue?.onModuleDestroy();
    await http?.app.close();
    await dsaHttp?.close();
    vi.unstubAllEnvs();
    await redis?.quit();
    await prisma?.$disconnect();
    if (root) await rm(root, { recursive: true, force: true });
    await ownedRedis?.cleanup();
    await ownedDatabase?.cleanup();
  });

  it('普通创建经 BullMQ 和生产 Worker 进入数据库终态并离线重放', async () => {
    const before = await witness();
    dsaHttp = await startWorkerDsaHttpFixture(databaseUrl!, redisUrl!, prisma as PrismaService);
    const { fixture } = dsaHttp;
    const strategy = await prisma.strategy.create({
      data: { name: 'Worker 隔离联通', schemaVersion: 2 },
    });
    const version = await prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        version: 1,
        schemaVersion: 2,
        schema: fixture.input.strategy as unknown as Prisma.InputJsonValue,
      },
    });
    const snapshots = new LocalSnapshotStore(root);
    queue = new BacktestBullQueue();
    const dispatch = new BacktestQueueService(prisma as PrismaService, queue, {
      publishJob: async () => undefined,
    });
    const builder = new DsaSnapshotBuilder(dsaHttp.dsa, snapshots, dsaHttp.reader);
    const service = new BacktestRunService(
      prisma as PrismaService,
      dispatch,
      snapshots,
      builder,
      new LocalSnapshotV3Runner(snapshots),
      new BacktestCreationGuardService(prisma as PrismaService, preparedRevisionReader() as never),
    );
    const reads = new BacktestService(
      prisma as PrismaService,
      undefined,
      service,
      new ResultReadPolicyService(prisma as PrismaService),
    );
    http = await startWorkerHttpFixture(reads);
    const createResponse = await fetch(`${http.baseUrl}/api/v1/backtests/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contractVersion: 3,
        strategyVersionId: version.id,
        idempotencyKey: 'worker-runtime-fixture',
        runConfig: fixture.input.runConfig,
        preparationStamp: preparationStampFor(
          fixture.input.strategy,
          fixture.input.runConfig,
          version.id,
        ),
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { id: string; status: string };
    const initialJob = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created.id } });
    expect(
      created?.status,
      JSON.stringify({ errorCode: initialJob.errorCode, diagnostics: initialJob.diagnostics }),
    ).toBe('queued');
    expect(await queue.getState(created!.id)).toBe('waiting');
    const damaged = await service.createRun({
      contractVersion: 3,
      strategyVersionId: version.id,
      idempotencyKey: 'worker-runtime-damaged',
      runConfig: fixture.input.runConfig,
      preparationStamp: preparationStampFor(
        fixture.input.strategy,
        fixture.input.runConfig,
        version.id,
      ),
    });
    expect(
      damaged?.status,
      JSON.stringify({ errorCode: damaged?.errorCode, errorSummary: damaged?.errorSummary }),
    ).toBe('queued');
    const damagedManifest = await snapshots.v3.replay(damaged!.id);
    await appendFile(resolve(root, 'artifacts', damagedManifest.artifacts[0]!.key), 'tampered');
    const multiBaseline = await makeReaderResult({
      market: 'CN',
      symbol: '159516.SZ',
      routeKey: fixture.input.executionRouteKey,
      window: { start: '2026-04-24', end: '2026-05-20' },
      tradabilityMode: 'assume-untradable-no-bar',
    });
    if (multiBaseline.status !== 'selected') throw new Error('缺少多窗口执行基线');
    const multiResponse = makeMultiWindowResponseV3(multiBaseline.selection.response);
    const multiConfig = structuredClone(fixture.input.runConfig);
    multiConfig.executionPriceProtocol.priceBasis = {
      ...multiResponse.sourcePriceBasis,
      quantityBasis: 'normalized-units',
    };
    const capabilitiesBeforeMulti = dsaHttp.paths.filter(
      (path) => path === '/api/v3/thesis-ledger/capabilities',
    ).length;
    dsaHttp.enableMultiWindow();
    const multiCreateResponse = await fetch(`${http.baseUrl}/api/v1/backtests/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contractVersion: 3,
        strategyVersionId: version.id,
        idempotencyKey: 'worker-runtime-multi-window',
        runConfig: multiConfig,
        preparationStamp: preparationStampFor(fixture.input.strategy, multiConfig, version.id),
      }),
    });
    expect(multiCreateResponse.status).toBe(201);
    const multiCreated = (await multiCreateResponse.json()) as { id: string; status: string };
    expect(multiCreated.status).toBe('queued');
    expect(await queue.getState(multiCreated.id)).toBe('waiting');
    const multiManifest = await snapshots.v3.replay(multiCreated.id);
    expect(multiManifest.actualSources[0]?.windowProtocol).toBe('market-multi-window-content-v1');
    const multiEvidence = await prisma.marketBarWindowEvidenceV3.findFirstOrThrow({
      where: { inputFingerprint: multiResponse.inputFingerprint },
    });
    expect(
      marketDataMultiWindowResponseV3Schema.parse(multiEvidence.completeResponse)
        .windowObservations,
    ).toHaveLength(2);
    worker = spawn(process.execPath, [resolve('dist/src/backtest/backtest-worker.main.js')], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl!,
        REDIS_URL: redisUrl!,
        BACKTEST_SNAPSHOT_ROOT: root,
        DSA_BASE_URL: 'http://127.0.0.1:1',
        THESIS_LEDGER_DSA_TOKEN: 'isolated-worker-fixture',
        CREDENTIAL_ENCRYPTION_KEY: 'isolated-worker-fixture-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    worker.stderr?.on('data', (data: Buffer) => {
      errors.push(data.toString().slice(0, 2000));
    });
    worker.stdout?.resume();
    await vi.waitFor(
      async () => {
        if (worker!.exitCode !== null)
          throw new Error(`Worker 已退出 ${worker!.exitCode}: ${errors.join('').slice(-3000)}`);
        const job = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created!.id } });
        expect(job.status, `${job.errorCode ?? ''}: ${errors.join('').slice(-2000)}`).toBe(
          'succeeded',
        );
      },
      { timeout: 20_000, interval: 100 },
    );
    const job = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created!.id } });
    const result = backtestResultSchemaV3.parse(job.result);
    expect(job.executionAttempt).toBe(1);
    const replay = await new LocalSnapshotV3Runner(new LocalSnapshotStore(root)).run(
      {
        runId: job.id,
        snapshotRef: { snapshotId: result.snapshotId, contentHash: result.snapshotId },
        artifactRefs: (await snapshots.v3.replay(job.id)).artifacts,
      },
      new AbortController().signal,
    );
    expect(replay.resultChecksum).toBe(result.resultChecksum);
    await vi.waitFor(
      async () => {
        const multiJob = await prisma.backtestJob.findUniqueOrThrow({
          where: { id: multiCreated.id },
        });
        expect(
          multiJob.status,
          `${multiJob.errorCode ?? ''}: ${errors.join('').slice(-2000)}`,
        ).toBe('succeeded');
      },
      { timeout: 20_000, interval: 100 },
    );
    const multiJob = await prisma.backtestJob.findUniqueOrThrow({
      where: { id: multiCreated.id },
    });
    const multiResult = backtestResultSchemaV3.parse(multiJob.result);
    expect(multiJob.executionAttempt).toBe(1);
    const multiReplay = await new LocalSnapshotV3Runner(new LocalSnapshotStore(root)).run(
      {
        runId: multiJob.id,
        snapshotRef: { snapshotId: multiResult.snapshotId, contentHash: multiResult.snapshotId },
        artifactRefs: (await snapshots.v3.replay(multiJob.id)).artifacts,
      },
      new AbortController().signal,
    );
    expect(multiReplay.resultChecksum).toBe(multiResult.resultChecksum);
    await vi.waitFor(
      async () => {
        expect(
          await prisma.backtestJob.findUniqueOrThrow({ where: { id: damaged!.id } }),
        ).toMatchObject({ status: 'failed', errorCode: 'DATA_UNAVAILABLE', result: null });
      },
      { timeout: 10_000, interval: 100 },
    );
    expect((await reads.statusForRead(job.id))?.result).toEqual(job.result);
    expect(await reads.statusForRead(damaged!.id)).toMatchObject({
      status: 'failed',
      result: null,
    });
    expect(await witness()).toEqual(before);
    expect(dsaHttp.paths).toEqual(
      expect.arrayContaining([
        '/api/v3/thesis-ledger/backtest/calendar',
        '/api/v3/thesis-ledger/backtest/instrument-facts',
        '/api/v3/thesis-ledger/market/bars',
        '/api/v3/thesis-ledger/capabilities',
      ]),
    );
    expect(
      dsaHttp.paths.filter((path) => path === '/api/v3/thesis-ledger/capabilities').length,
    ).toBeGreaterThan(capabilitiesBeforeMulti);
    const response = await fetch(`${http.baseUrl}/api/v1/backtests/runs/${job.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: job.id,
      status: 'succeeded',
      result: job.result,
    });
    const failureResponse = await fetch(`${http.baseUrl}/api/v1/backtests/runs/${damaged!.id}`);
    expect(failureResponse.status).toBe(200);
    expect(await failureResponse.json()).toMatchObject({
      status: 'failed',
      result: null,
      errorCode: 'DATA_UNAVAILABLE',
    });
    dsaHttp.setMissingTradingDates(['2026-05-19']);
    const sparse = await service.createRun({
      contractVersion: 3,
      strategyVersionId: version.id,
      idempotencyKey: 'worker-runtime-sparse',
      runConfig: fixture.input.runConfig,
      preparationStamp: preparationStampFor(
        fixture.input.strategy,
        fixture.input.runConfig,
        version.id,
      ),
    });
    await vi.waitFor(
      async () => {
        const current = await prisma.backtestJob.findUniqueOrThrow({ where: { id: sparse.id } });
        expect(current.status, `${current.errorCode ?? ''}: ${errors.join('').slice(-2000)}`).toBe(
          'succeeded',
        );
      },
      { timeout: 20_000, interval: 100 },
    );
    const sparseJob = await prisma.backtestJob.findUniqueOrThrow({ where: { id: sparse.id } });
    const sparseResult = backtestResultSchemaV3.parse(sparseJob.result);
    expect(
      sparseResult.simulationFills.every((fill) => fill.occurredAt.slice(0, 10) !== '2026-05-19'),
    ).toBe(true);
    expect(sparseResult.warnings).toContain('按冻结逐日状态跳过 1 个缺 Bar 交易日。');
    expect(sparseResult.equityCurve).toHaveLength(3);
    const sparseReplay = await new LocalSnapshotV3Runner(new LocalSnapshotStore(root)).run(
      {
        runId: sparse.id,
        snapshotRef: { snapshotId: sparseResult.snapshotId, contentHash: sparseResult.snapshotId },
        artifactRefs: (await snapshots.v3.replay(sparse.id)).artifacts,
      },
      new AbortController().signal,
    );
    expect(sparseReplay.resultChecksum).toBe(sparseResult.resultChecksum);
    await verifyPersistedCurrentRunBoundary(prisma, reads, http.baseUrl, job.id);
    expect(await witness()).toEqual(before);
  }, 30_000);
});
