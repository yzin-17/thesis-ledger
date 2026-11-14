import 'reflect-metadata';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { backtestResultSchemaV3, projectPriceResearchStrategy } from '@thesis-ledger/schemas';
import { BacktestConfiguredRunService } from '../../src/backtest/backtest-configured-run.service.js';
import { BacktestRunPreparationService } from '../../src/backtest/backtest-run-preparation.service.js';
import { OptimizationPreparation } from '../../src/strategy-optimization/optimization-preparation.js';
import { OptimizationModelResolution } from '../../src/strategy-optimization/optimization-model-resolution.js';
import { createOptimizationExperiment } from '../../src/strategy-optimization/strategy-optimization-create.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestBullQueue } from '../../src/backtest/backtest-bull-queue.js';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
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
import { priceResearchFixture } from './price-research.fixtures.js';

(process.env.PRICE_RESEARCH_WORKER_ISOLATED === '1' ? describe : describe.skip)(
  '研究价格协议的实际 Worker 闭环',
  () => {
    let db: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
    let redis: Awaited<ReturnType<typeof startIsolatedNavRedis>>;
    let prisma: PrismaClient;
    let queue: BacktestBullQueue;
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

    it('HTTP 创建、BullMQ 领取、真实计算、持久化与离线重放一致', async () => {
      const f = await priceResearchFixture({ researchSource: { providerId: 'futu', upstreamSource: 'futu' } });
      const strategy = await prisma.strategy.create({
        data: { name: '隔离价格研究', schemaVersion: 3 },
      });
      const version = await prisma.strategyVersion.create({
        data: {
          strategyId: strategy.id,
          version: 1,
          schemaVersion: 3,
          schema: f.input.strategy as unknown as Prisma.InputJsonValue,
        },
      });
      const prepared = await prepareBacktestRunConfigV3({
        request: { ...f.request, strategyVersionId: version.id },
        strategy: f.input.strategy,
        reader: f.reader as never,
        control: f.control,
        checkedAt: new Date().toISOString(),
      });
      if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
      expect(prepared.actualSource.provenance.providerId).toBe('futu');
      vi.stubEnv('REDIS_URL', redis.redisUrl);
      vi.stubEnv('DATABASE_URL', db.databaseUrl);
      vi.stubEnv('DSA_BASE_URL', 'http://127.0.0.1:1');
      vi.stubEnv('THESIS_LEDGER_DSA_TOKEN', 'isolated-price-research');
      const snapshots = new LocalSnapshotStore(db.artifactRoot);
      const revisions = preparedRevisionReader();
      revisions.readCurrent.mockResolvedValue({
        ...await revisions.readCurrent(),
        targetSources: [{ providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 }],
      });
      queue = new BacktestBullQueue();
      const dispatch = new BacktestQueueService(prisma as PrismaService, queue, {
        publishJob: async () => undefined,
      });
      const service = new BacktestRunService(
        prisma as PrismaService,
        dispatch,
        snapshots,
        new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader as never),
        new LocalSnapshotV3Runner(snapshots),
        new BacktestCreationGuardService(
          prisma as PrismaService,
          revisions as never,
        ),
      );
      const reads = new BacktestService(
        prisma as PrismaService,
        undefined,
        service,
        new ResultReadPolicyService(prisma as PrismaService),
      );
      http = await startWorkerHttpFixture(reads);
      const response = await fetch(`${http.baseUrl}/api/v1/backtests/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contractVersion: 3,
          strategyVersionId: version.id,
          idempotencyKey: 'isolated-price-research',
          runConfig: prepared.runConfig,
          preparationStamp: prepared.executionPreflight.revisionStamp,
        }),
      });
      expect(response.status, await response.clone().text()).toBe(201);
      const created = (await response.json()) as {
        id: string;
        status: string;
        errorSummary?: string;
      };
      expect(created.status, created.errorSummary).toBe('queued');
      expect(await queue.getState(created.id)).toBe('waiting');
      const errors: string[] = [];
      worker = spawn(process.execPath, [resolve('dist/src/backtest/backtest-worker.main.js')], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: db.databaseUrl,
          REDIS_URL: redis.redisUrl,
          BACKTEST_SNAPSHOT_ROOT: db.artifactRoot,
          DSA_BASE_URL: 'http://127.0.0.1:1',
          THESIS_LEDGER_DSA_TOKEN: 'isolated-price-research',
          CREDENTIAL_ENCRYPTION_KEY: 'isolated-price-research',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      worker.stderr?.on('data', (chunk: Buffer) => errors.push(chunk.toString().slice(0, 2000)));
      worker.stdout?.resume();
      await vi.waitFor(
        async () => {
          if (worker!.exitCode !== null) throw new Error(errors.join('').slice(-3000));
          const job = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created.id } });
          expect(job.status, `${job.errorCode}: ${job.errorSummary}`).toBe('succeeded');
        },
        { timeout: 20000, interval: 100 },
      );
      const job = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created.id } });
      const result = backtestResultSchemaV3.parse(job.result);
      expect(job.executionAttempt).toBe(1);
      expect(result.priceResearch).toBeDefined();
      expect(result.priceResearch?.actualPriceSource?.provenance.providerId).toBe('hithink');
      expect(result.simulationFills[0]).toMatchObject({
        quantity: '50',
        researchSizing: { referenceQuantity: '100' },
      });
      const manifest = await snapshots.v3.replay(job.id);
      const replay = await new LocalSnapshotV3Runner(snapshots).run(
        {
          runId: job.id,
          snapshotRef: { snapshotId: result.snapshotId, contentHash: result.snapshotId },
          artifactRefs: manifest.artifacts,
        },
        new AbortController().signal,
      );
      expect(replay.resultChecksum).toBe(result.resultChecksum);
      const read = await fetch(`${http.baseUrl}/api/v1/backtests/runs/${job.id}`);
      expect(read.status).toBe(200);
      expect(await read.json()).toMatchObject({ status: 'succeeded', result });
      expect(await prisma.ledgerEvent.count()).toBe(0);
      expect(await prisma.position.count()).toBe(0);
      // 新实验先冻结额外原价：纯指标基线与后来新增价格条件的候选均由同一真实 Worker 消费。
      const baseline = structuredClone(f.input.strategy);
      baseline.signalSources = [{ ...baseline.signalSources[0]!, id: 'research', priceCoordinate: 'research' }];
      baseline.entry = { type: 'not', expression: { type: 'positionState', field: 'isOpen' } };
      baseline.sizing = { type: 'fixedAmount', amount: '400' };
      const baselineVersion = await prisma.strategyVersion.create({ data: {
        strategyId: strategy.id, version: 2, schemaVersion: 3, schema: baseline as unknown as Prisma.InputJsonValue,
      } });
      const researchPrepared = await prepareBacktestRunConfigV3({
        request: { ...f.request, strategyVersionId: baselineVersion.id, priceResearchReference: 'freeze' },
        strategy: baseline, reader: f.reader as never, control: f.control, checkedAt: new Date().toISOString(),
      });
      if (researchPrepared.status !== 'prepared') throw Error(JSON.stringify(researchPrepared));
      expect(researchPrepared.runConfig.priceResearch?.actualPriceWindow).toBeDefined();
      const target = { sourceMode: 'discovery', discoveryScope: { executionInstrument: baseline.executionInstrument, primaryTimeframe: '1d' } };
      const modelResolution = await new OptimizationModelResolution(prisma as PrismaService).resolve({ target,
        startDate: f.request.runConfig.startDate, endDate: f.request.runConfig.endDate, currency: f.request.runConfig.baseCurrency, adjustment: 'hfq' });
      if (modelResolution.status !== 'available') throw Error(modelResolution.message);
      const { strategyVersionId: _sourceVersion, ...baseIntent } = f.request;
      void _sourceVersion;
      const discoveryPrepared = await new OptimizationPreparation(new BacktestRunPreparationService(prisma as PrismaService,
        f.reader as never, f.control as never)).prepare({ target, intent: { ...baseIntent, warmupBudgetSessions: 60,
          priceResearchReference: 'freeze', runConfig: { ...baseIntent.runConfig, executionModel: modelResolution.model } } });
      if (discoveryPrepared.status !== 'prepared') throw Error(JSON.stringify(discoveryPrepared));
      const nextDay = (offset: number) => { const date = new Date(f.request.runConfig.startDate + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
      const createdExperiment = await createOptimizationExperiment({ ...target, contractVersion: 3,
        models: [{ provider: 'controlled', model: 'zero' }], maxRounds: 1, objective: { mode: 'balanced', minClosedTrades: 1 },
        budget: { maxAiCalls: 1, maxBacktestRuns: 0, maxInputTokens: 1000, maxOutputTokens: 1000, maxDurationSeconds: 600 },
        split: { development: { start: nextDay(0), end: nextDay(0) }, validation: { start: nextDay(1), end: nextDay(1) },
          test: { start: nextDay(2), end: f.request.runConfig.endDate } },
        runConfig: discoveryPrepared.runConfig, idempotencyKey: 'isolated-experiment-research-create',
      }, { prisma, providers: { strict: () => ({ metadata: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' } }) },
        reads: { experiment: async (id: string) => ({ id }) }, candidates: {}, process: async () => undefined } as never);
      const storedExperiments = await prisma.$queryRaw<Array<{ baselineStrategyVersionId: string; strategySpaceVersion: string }>>`
        SELECT "baselineStrategyVersionId", "strategySpaceVersion" FROM "OptimizationExperiment" WHERE "id"=${createdExperiment.id}::uuid
      `;
      expect(storedExperiments[0]?.strategySpaceVersion).toBe('strategy-space-price-research-v1');
      expect(await prisma.strategyVersion.findUniqueOrThrow({ where: { id: storedExperiments[0]!.baselineStrategyVersionId } })).toMatchObject({ schemaVersion: 3, schema: { schemaVersion: '3' } });
      const candidate = projectPriceResearchStrategy({ ...baseline, schemaVersion: '2', entry: { type: 'all', conditions: [baseline.entry, {
        type: 'compare', operator: 'lt', left: { type: 'series', sourceId: 'research', field: 'close' }, right: { type: 'constant', value: '1000' },
      }] }, sizing: { type: 'fixedQuantity', quantity: '100' } });
      const candidateVersion = await prisma.strategyVersion.create({ data: {
        strategyId: strategy.id, version: -1, schemaVersion: 3, schema: candidate as unknown as Prisma.InputJsonValue,
      } });
      const configured = new BacktestConfiguredRunService(prisma as PrismaService, f.reader as never, revisions as never);
      const fingerprints: string[] = [];
      for (const [label, selectedVersion] of [['baseline', baselineVersion], ['candidate', candidateVersion]] as const) {
        const resolved = await configured.resolve(selectedVersion.id, researchPrepared.runConfig, `isolated-experiment-research-${label}`, { rebindStrategyInputs: true });
        if (resolved.kind !== 'prepared') throw Error('应为新隔离运行');
        const createdResponse = await fetch(`${http.baseUrl}/api/v1/backtests/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(resolved.input) });
        expect(createdResponse.status).toBe(201);
        const createdRun = await createdResponse.json() as { id: string };
        await vi.waitFor(async () => {
          const latest = await prisma.backtestJob.findUniqueOrThrow({ where: { id: createdRun.id } });
          expect(latest.status, `${latest.errorCode}: ${latest.errorSummary}`).toBe('succeeded');
        }, { timeout: 20000, interval: 100 });
        const completed = await prisma.backtestJob.findUniqueOrThrow({ where: { id: createdRun.id } });
        const completedResult = backtestResultSchemaV3.parse(completed.result);
        expect(completedResult.priceResearch).toBeDefined();
        if (label === 'candidate') expect(completedResult.simulationFills[0]?.researchSizing?.referenceQuantity).toBe('100');
        fingerprints.push(await reads.comparableDataFingerprint(createdRun.id, { start: researchPrepared.runConfig.startDate, end: researchPrepared.runConfig.endDate }));
      }
      expect(fingerprints[0]).toBe(fingerprints[1]);
      expect(await prisma.ledgerEvent.count()).toBe(0);
      expect(await prisma.position.count()).toBe(0);
    }, 60000);
  },
);
