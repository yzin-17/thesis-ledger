import 'reflect-metadata';
import { PrismaClient, type Prisma } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { backtestResultSchemaV3 } from '@thesis-ledger/schemas';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import {
  LocalSnapshotV3Runner,
  type BacktestV3Runner,
} from '../../src/backtest/backtest-v3-runner.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { preparationStampFor, preparedRevisionReader } from './v3-preparation-fixtures.js';
import { startIsolatedNavPostgres } from './nav-postgres.integration-harness.js';
import { prepareBacktestExecution } from '../../src/backtest/backtest-execution-owner.js';
import { BacktestQueueReconciler } from '../../src/backtest/backtest-queue.reconciler.js';

let databaseUrl = process.env.BACKTEST_V3_TEST_DATABASE_URL;
const ownedIsolation = process.env.C02_POSTGRES_ISOLATED === '1';
const postgresDescribe = databaseUrl || ownedIsolation ? describe : describe.skip;

postgresDescribe('隔离 PostgreSQL V3 生命周期与真实域隔离', () => {
  let prisma: PrismaClient;
  let root: string;
  let baseline: string;
  let isolated: Awaited<ReturnType<typeof startIsolatedNavPostgres>> | undefined;
  const witness = async () =>
    JSON.stringify(
      await Promise.all(
        ['Account', 'AccountLedgerState', 'LedgerEvent', 'Position', 'Trade'].map((table) =>
          prisma.$queryRawUnsafe(`SELECT count(*)::text AS rows,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS digest
        FROM public."${table}" t`),
        ),
      ),
    );
  beforeAll(async () => {
    if (ownedIsolation) {
      isolated = await startIsolatedNavPostgres();
      databaseUrl = isolated.databaseUrl;
    }
    const url = new URL(databaseUrl!);
    const expectedDatabase = isolated ? 'nav_n2_6' : 'backtest_v3_fixture';
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== `/${expectedDatabase}`
    )
      throw new Error('只允许指定的本地隔离数据库');
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    const actual = await prisma.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`;
    if (actual[0]?.name !== expectedDatabase) throw new Error('隔离数据库身份不匹配');
    root = await mkdtemp(join(tmpdir(), 'backtest-v3-pg-'));
    const account = await prisma.account.create({
      data: { name: '真实域隔离哨兵', type: 'brokerage', mode: 'actual' },
    });
    await prisma.ledgerEvent.create({
      data: {
        accountId: account.id,
        type: 'CASH_DEPOSIT',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
        payload: { amount: '123.45', currency: 'CNY' },
      },
    });
    baseline = await witness();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    if (root) await rm(root, { recursive: true, force: true });
    await isolated?.cleanup();
  });

  async function harness(failFirst = false) {
    const fixture = await completeSnapshotFixture();
    const strategy = await prisma.strategy.create({
      data: { name: '隔离 V3 生命周期', schemaVersion: 2 },
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
    const builder = new DsaSnapshotBuilder(
      fixture.dsa as unknown as DsaClient,
      snapshots,
      fixture.reader,
    );
    const local = new LocalSnapshotV3Runner(snapshots);
    let attempts = 0;
    const run = vi.fn<BacktestV3Runner['run']>(async (input, signal) => {
      attempts += 1;
      if (failFirst && attempts === 1) throw new Error('隔离测试临时执行失败');
      return local.run(input, signal);
    });
    const queue = {
      ensureEnqueued: vi.fn((id: string) =>
        prisma.backtestJob.findUniqueOrThrow({ where: { id } }),
      ),
    };
    const service = new BacktestRunService(
      prisma as PrismaService,
      queue as never,
      snapshots,
      builder,
      { id: local.id, run },
      new BacktestCreationGuardService(prisma as PrismaService, preparedRevisionReader() as never),
    );
    const request = {
      contractVersion: 3 as const,
      strategyVersionId: version.id,
      idempotencyKey: 'isolated-v3',
      runConfig: fixture.input.runConfig,
      preparationStamp: preparationStampFor(
        fixture.input.strategy,
        fixture.input.runConfig,
        version.id,
      ),
    };
    return { fixture, service, request, run, queue };
  }

  it('六处预算与恢复 CAS 在读取后模式变更时保留旧记录', async () => {
    const h = await harness();
    const created = await h.service.createRun(h.request);
    for (const scenario of [
      'owner-invalid',
      'owner-exhausted',
      'cancel',
      'invalid',
      'exhausted',
      'requeue',
    ]) {
      const invalid = scenario.includes('invalid');
      const input = {
        contractVersion: 3,
        schemaVersion: '3',
        retryAttemptBase: invalid ? 'invalid' : 0,
      };
      await prisma.backtestJob.update({
        where: { id: created!.id },
        data: {
          mode: 'V3',
          status: scenario.startsWith('owner') ? 'queued' : 'running',
          input,
          executionAttempt: scenario.includes('exhausted') ? 3 : 1,
          cancelRequestedAt: scenario === 'cancel' ? new Date() : null,
        },
      });
      let legacy: unknown;
      const changeMode = async () => {
        legacy = await prisma.backtestJob.update({
          where: { id: created!.id },
          data: { mode: 'V2' },
        });
      };
      if (scenario.startsWith('owner')) {
        await prepareBacktestExecution(
          {
            backtestJob: {
              findUnique: async () => {
                const snapshot = await prisma.backtestJob.findUniqueOrThrow({
                  where: { id: created!.id },
                });
                await changeMode();
                return snapshot;
              },
              updateMany: prisma.backtestJob.updateMany.bind(prisma.backtestJob),
            },
          } as never,
          created!.id,
          3,
        );
      } else {
        const queueService = { ensureEnqueued: vi.fn() };
        const events = { publishJob: vi.fn() };
        const reconciler = new BacktestQueueReconciler(
          prisma as PrismaService,
          queueService as never,
          {
            getState: async () => {
              await changeMode();
              return null;
            },
          } as never,
          events,
        );
        await reconciler.reconcile();
        expect(queueService.ensureEnqueued).not.toHaveBeenCalled();
        expect(events.publishJob).not.toHaveBeenCalled();
      }
      expect(await prisma.backtestJob.findUniqueOrThrow({ where: { id: created!.id } })).toEqual(
        legacy,
      );
    }
    expect(await witness()).toBe(baseline);
  }, 30_000);

  it('真实持久化创建、重复请求和成功终态，账户账本保持不变', async () => {
    const h = await harness();
    const created = await h.service.createRun(h.request);
    expect(created?.status).toBe('queued');
    expect(h.queue.ensureEnqueued).toHaveBeenCalledWith(created!.id);
    expect((await h.service.createRun(h.request))?.id).toBe(created!.id);
    await h.service.runCurrent(created!.id);
    const job = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created!.id } });
    const result = backtestResultSchemaV3.parse(job.result);
    expect(job).toMatchObject({
      status: 'succeeded',
      executionAttempt: 1,
      snapshotId: result.snapshotId,
      resultChecksum: result.resultChecksum,
    });
    expect(result.runId).toBe(job.id);
    expect(h.fixture.dsa.backtestInstrumentFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        barAdjustment: 'qfq',
        barProviderId: 'hithink',
        barUpstreamSource: 'hithink-financial-api',
        barRouteIndex: 0,
      }),
    );
    expect(await witness()).toBe(baseline);
  }, 30_000);

  it('两个执行者同时领取只有一个 Runner 执行', async () => {
    const h = await harness();
    const created = await h.service.createRun(h.request);
    await Promise.all([h.service.runCurrent(created!.id), h.service.runCurrent(created!.id)]);
    expect(h.run).toHaveBeenCalledOnce();
    expect(
      await prisma.backtestJob.findUniqueOrThrow({ where: { id: created!.id } }),
    ).toMatchObject({ status: 'succeeded', executionAttempt: 1 });
    expect(await witness()).toBe(baseline);
  }, 30_000);

  it('失败后仅重读冻结输入，实际数据库 attempt 单调递增', async () => {
    const h = await harness(true);
    const created = await h.service.createRun(h.request);
    await h.service.runCurrent(created!.id);
    const failed = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created!.id } });
    expect(failed).toMatchObject({ status: 'failed', executionAttempt: 1 });
    h.fixture.reader.readV3.mockClear();
    h.fixture.dsa.backtestInstrumentFacts.mockClear();
    h.fixture.dsa.backtestInstrumentFacts.mockRejectedValue(new Error('offline'));
    await h.service.retryRun(created!.id);
    await h.service.runCurrent(created!.id);
    const recovered = await prisma.backtestJob.findUniqueOrThrow({ where: { id: created!.id } });
    expect(recovered).toMatchObject({
      status: 'succeeded',
      executionAttempt: 3,
      snapshotId: failed.snapshotId,
      snapshotManifest: failed.snapshotManifest,
    });
    expect(h.fixture.reader.readV3).not.toHaveBeenCalled();
    expect(h.fixture.dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
    expect(await witness()).toBe(baseline);
  }, 30_000);
});
