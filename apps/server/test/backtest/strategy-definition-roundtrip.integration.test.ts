import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
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
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import { preparedRevisionReader } from './v3-preparation-fixtures.js';
import { startWorkerHttpFixture } from './worker-http-fixture.js';
import { startIsolatedNavPostgres } from './nav-postgres.integration-harness.js';
import { startIsolatedNavRedis } from './nav-worker-redis.integration-harness.js';
import { priceResearchFixture } from './price-research.fixtures.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';

(process.env.STRATEGY_DEFINITION_ROUNDTRIP_ISOLATED === '1' ? describe : describe.skip)(
  '可视编辑实际提交定义的持久化与执行',
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
      prisma = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    });
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

    it.each(['etf', 'stock'] as const)(
      '%s 两端真实浏览器的同一 JSON 原样保存、冻结、非空成交并重复回放',
      async (assetType) => {
        const directory = process.env.STRATEGY_DEFINITION_CAPTURE_DIR;
        if (!directory) throw new Error('需要浏览器实际提交的受控定义');
        const captures = ['desktop', 'mobile'].map(
          (platform) =>
            JSON.parse(
              readFileSync(
                resolve(
                  directory,
                  `${assetType === 'stock' ? 'stock-' : ''}${platform}-1440-saved.json`,
                ),
                'utf8',
              ),
            ) as unknown,
        );
        expect(captures[1]).toEqual(captures[0]);
        const definition = strategySchema.parse(captures[0]) as BacktestStrategy;
        expect(definition.schemaVersion).toBe('3');
        expect(definition.executionInstrument.assetType).toBe(assetType);
        expect(definition.entry.type).toBe('all');
        expect(definition.tradePlan?.stages?.[0]?.action).toMatchObject({
          fraction: '0.250000000000000001',
        });
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
        expect(version.schema).toEqual(captures[0]);
        const f = await priceResearchFixture({
          assetType,
          researchSource: { providerId: 'futu', upstreamSource: 'futu' },
        });
        f.input.strategy = definition;
        const original = f.reader.readV3.getMockImplementation()!;
        f.reader.readV3.mockImplementation(async (request) => {
          const result = await original(request);
          if (result.status !== 'selected') return result;
          const response = result.selection.response;
          const scale = request.routeKey.adjustment === 'none' ? 0.5 : 1;
          for (const bar of response.bars) {
            const date = bar.timestamp.slice(0, 10);
            const price =
              date < '2026-05-18' ? 8 : date === '2026-05-18' ? 7 : date === '2026-05-19' ? 12 : 13;
            bar.open = (date <= '2026-05-19' ? 8 : 12) * scale;
            bar.close = price * scale;
            bar.high = Math.max(bar.open, bar.close) + 0.1 * scale;
            bar.low = Math.min(bar.open, bar.close) - 0.1 * scale;
          }
          response.historicalTradabilityWindows = [
            tradabilityFixtureV3(tradabilityWindowFromResponseV3(response)),
          ];
          result.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
          return result;
        });
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
            idempotencyKey: `editor-roundtrip-${assetType}`,
            runConfig: prepared.runConfig,
            preparationStamp: prepared.executionPreflight.revisionStamp,
          }),
        });
        expect(response.status, await response.clone().text()).toBe(201);
        const created = (await response.json()) as { id: string; status: string };
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
        ).toBeGreaterThan(0);
        const frozen = await snapshots.v3.replay(job.id);
        expect(frozen.strategyVersionHash).toBe(hashCanonicalManifest(captures[0]));
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
        expect(stored.schema).toEqual(captures[0]);
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
