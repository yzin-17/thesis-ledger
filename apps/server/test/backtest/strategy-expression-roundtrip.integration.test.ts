import { expressionRoundtripFixture } from './strategy-expression-roundtrip.fixture.js';
import 'reflect-metadata';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  backtestResultSchemaV3,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestBullQueue } from '../../src/backtest/backtest-bull-queue.js';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { hashCanonicalManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import { preparedRevisionReader } from './v3-preparation-fixtures.js';
import { startWorkerHttpFixture } from './worker-http-fixture.js';
import { startIsolatedNavPostgres } from './nav-postgres.integration-harness.js';
import { startIsolatedNavRedis } from './nav-worker-redis.integration-harness.js';

(process.env.STRATEGY_EXPRESSION_ROUNDTRIP_ISOLATED === '1' ? describe : describe.skip)(
  '新表达式可视提交与 R11 的隔离持久化及 Worker 执行',
  () => {
    let db: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
    let redis: Awaited<ReturnType<typeof startIsolatedNavRedis>>;
    let prisma: PrismaClient;
    let queue: BacktestBullQueue | undefined;
    let worker: ChildProcess | undefined;
    let http: Awaited<ReturnType<typeof startWorkerHttpFixture>> | undefined;
    beforeAll(async () => {
      db = await startIsolatedNavPostgres();
      redis = await startIsolatedNavRedis();
      prisma = db.prisma;
      console.info('隔离端口', {
        postgres: new URL(db.databaseUrl).port,
        redis: new URL(redis.redisUrl).port,
      });
    }, 60000);
    afterAll(async () => {
      if (worker && worker.exitCode === null && worker.signalCode === null) {
        const stopped = new Promise<void>((done) => worker!.once('exit', () => done()));
        worker.kill('SIGTERM');
        const timer = setTimeout(() => worker?.kill('SIGKILL'), 5000);
        await stopped;
        clearTimeout(timer);
      }
      await queue?.onModuleDestroy();
      await http?.app.close();
      await prisma?.$disconnect();
      vi.unstubAllEnvs();
      await redis?.cleanup();
      await db?.cleanup();
    });

    it.each(['browser', 'breakout', 'equal', 'multitimeframe'] as const)(
      '%s 原样保存、冻结、Worker 预期成交并重复回放',
      async (scenario) => {
        const { definition, expectedDefinition, f } = await expressionRoundtripFixture(scenario);
        const readback = backtestStrategyPlanReadback(definition);
        const saved = await prisma.$transaction((tx) =>
          new StrategyCreationService().createInTransaction(tx, {
            ownerId: null,
            name: definition.name,
            definition,
            source: { kind: 'manual' },
          }),
        );
        const version = saved.versions[0]!;
        expect(version.schemaVersion).toBe(3);
        expect(version.schema).toEqual(expectedDefinition);
        const prepared = await prepareBacktestRunConfigV3({
          request: { ...f.request, strategyVersionId: version.id },
          strategy: definition,
          reader: f.reader as never,
          control: f.control,
          checkedAt: new Date().toISOString(),
        });
        if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
        vi.stubEnv('REDIS_URL', redis.redisUrl);
        vi.stubEnv('DATABASE_URL', db.databaseUrl);
        vi.stubEnv('DSA_BASE_URL', 'http://127.0.0.1:1');
        vi.stubEnv('THESIS_LEDGER_DSA_TOKEN', 'isolated-editor');
        vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', 'isolated-editor-roundtrip-key');
        const snapshots = new LocalSnapshotStore(db.artifactRoot);
        const revisions = preparedRevisionReader();
        if (scenario !== 'multitimeframe')
          revisions.readCurrent.mockResolvedValue({
            ...(await revisions.readCurrent()),
            targetSources: [{ providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 }],
          });
        queue ??= new BacktestBullQueue();
        const service = new BacktestRunService(
          prisma as PrismaService,
          new BacktestQueueService(prisma as PrismaService, queue, {
            publishJob: async () => undefined,
          }),
          snapshots,
          new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader as never),
          new LocalSnapshotV3Runner(snapshots),
          new BacktestCreationGuardService(prisma as PrismaService, revisions as never),
        );
        await http?.app.close();
        http = await startWorkerHttpFixture(
          new BacktestService(
            prisma as PrismaService,
            undefined,
            service,
            new ResultReadPolicyService(prisma as PrismaService),
          ),
        );
        const response = await fetch(`${http.baseUrl}/api/v1/backtests/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contractVersion: 1,
            strategyVersionId: version.id,
            idempotencyKey: `expression-roundtrip-${scenario}`,
            runConfig: prepared.runConfig,
            preparationStamp: prepared.executionPreflight.revisionStamp,
          }),
        });
        expect(response.status, await response.clone().text()).toBe(201);
        const created = (await response.json()) as { id: string; status: string };
        if (created.status !== 'queued')
          console.info(
            '创建失败',
            await prisma.backtestJob.findUnique({
              where: { id: created.id },
              select: { status: true, errorCode: true, errorSummary: true },
            }),
          );
        expect(created.status).toBe('queued');
        expect(worker ? ['waiting', 'active', 'completed'] : ['waiting']).toContain(
          await queue.getState(created.id),
        );
        const errors: string[] = [];
        if (!worker)
          worker = spawn(process.execPath, [resolve('dist/src/backtest/backtest-worker.main.js')], {
            env: {
              ...process.env,
              NODE_ENV: 'test',
              DATABASE_URL: db.databaseUrl,
              REDIS_URL: redis.redisUrl,
              BACKTEST_SNAPSHOT_ROOT: db.artifactRoot,
              DSA_BASE_URL: 'http://127.0.0.1:1',
              THESIS_LEDGER_DSA_TOKEN: 'isolated-editor',
              CREDENTIAL_ENCRYPTION_KEY: 'isolated-editor-roundtrip-key',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        worker.stderr?.on('data', (chunk: Buffer) => errors.push(chunk.toString().slice(0, 2000)));
        worker.stdout?.on('data', (chunk: Buffer) => errors.push(chunk.toString().slice(0, 2000)));
        await vi.waitFor(
          async () => {
            if (worker!.exitCode !== null) throw new Error(errors.join('').slice(-3000));
            const job = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created.id } });
            expect(
              job.status,
              `${job.errorCode}: ${job.errorSummary}; transport=${await queue!.getState(created.id)}; ${errors.slice(-8).join('')}`,
            ).toBe('succeeded');
          },
          { timeout: 20000, interval: 100 },
        );
        const job = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created.id } });
        const result = backtestResultSchemaV3.parse(job.result);
        expect(
          result.simulationFills.length,
          JSON.stringify({ warnings: result.warnings, rejects: result.rejectedOrders }),
        ).toBe(scenario === 'breakout' || scenario === 'multitimeframe' ? 1 : 0);
        if (scenario === 'breakout' || scenario === 'multitimeframe')
          expect(result.simulationFills[0]?.occurredAt.slice(0, 10)).toBe('2026-05-19');
        const frozen = await snapshots.v3.replay(job.id);
        expect(frozen.strategyVersionHash).toBe(hashCanonicalManifest(expectedDefinition));
        const input = {
          runId: job.id,
          snapshotRef: { snapshotId: result.snapshotId, contentHash: result.snapshotId },
          artifactRefs: frozen.artifacts,
        };
        const runner = new LocalSnapshotV3Runner(snapshots);
        expect(await runner.run(input, AbortSignal.timeout(10000))).toEqual(result);
        expect(await runner.run(input, AbortSignal.timeout(10000))).toEqual(result);
        const stored = await prisma.strategyVersion.findUniqueOrThrow({
          where: { id: version.id },
        });
        expect(stored.schema).toEqual(expectedDefinition);
        expect(
          backtestStrategyPlanReadback(strategySchema.parse(stored.schema) as BacktestStrategy),
        ).toEqual(readback);
        const read = await fetch(`${http.baseUrl}/api/v1/backtests/runs/${job.id}`);
        expect(read.status).toBe(200);
        expect(await read.json()).toMatchObject({ status: 'succeeded', result });
        expect(await prisma.ledgerEvent.count()).toBe(0);
        expect(await prisma.position.count()).toBe(0);
      },
      60000,
    );
  },
);
