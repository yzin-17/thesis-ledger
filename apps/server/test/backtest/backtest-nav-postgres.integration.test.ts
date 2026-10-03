import 'reflect-metadata';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { MarketNavReaderV3 } from '../../src/market/market-nav-reader-v3.js';
import { BacktestNavPreparationController } from '../../src/backtest/backtest-nav-preparation.controller.js';
import { BacktestNavPreparationRepository } from '../../src/backtest/backtest-nav-preparation-repository.js';
import {
  BacktestNavPreparationService,
  NAV_PREPARATION_TIMEOUT_MS,
} from '../../src/backtest/backtest-nav-preparation.service.js';
import { BacktestNavRunController } from '../../src/backtest/backtest-nav-run.controller.js';
import { BacktestNavRunService } from '../../src/backtest/backtest-nav-run.service.js';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import {
  hashCanonicalManifest,
  SnapshotIntegrityError,
} from '../../src/backtest/backtest-snapshot.js';
import { navPreparationReceiptContentChecksum } from '../../src/backtest/backtest-nav-preparation-repository.js';
import { navPreparationFixture } from './nav-preparation.fixtures.js';
import { startIsolatedNavPostgres } from './nav-postgres.integration-harness.js';

const enabled = process.env.E01_N2_6_POSTGRES === '1';
const postgresDescribe = enabled ? describe : describe.skip;

type Scenario = {
  baseUrl: string;
  strategyVersionId: string;
  snapshotRoot: string;
  reader: { read: ReturnType<typeof vi.fn>; currentRouteState: ReturnType<typeof vi.fn> };
  close(): Promise<void>;
  request: Record<string, unknown>;
  prepare(): Promise<{ status: number; body: Record<string, unknown> }>;
  create(
    receipt: { preparationId: string; preparationHash: string },
    idempotencyKey?: string,
  ): Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
  read(id: string): Promise<{ status: number; body: Record<string, unknown> }>;
};

postgresDescribe('NAV 准备凭证与 Run 的隔离 PostgreSQL 验收', () => {
  let fixtureDb: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
  let active: Scenario[] = [];

  beforeAll(async () => {
    fixtureDb = await startIsolatedNavPostgres();
  }, 240_000);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T15:02:30.000Z'));
  });

  afterEach(async () => {
    try {
      await Promise.all(active.map((current) => current.close()));
      active = [];
    } finally {
      vi.useRealTimers();
    }
  });

  afterAll(async () => {
    await fixtureDb?.cleanup();
  }, 30_000);

  async function scenario(options: { freezeFailure?: boolean } = {}): Promise<Scenario> {
    const f = navPreparationFixture();
    const strategy = await fixtureDb.prisma.strategy.create({
      data: { name: `N2.6 NAV 隔离验收 ${randomUUID()}`, schemaVersion: 2 },
    });
    const version = await fixtureDb.prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        version: 1,
        schemaVersion: 2,
        schema: f.strategy as unknown as Prisma.InputJsonValue,
      },
    });
    const request: Record<string, unknown> = {
      ...f.request,
      strategyVersionId: version.id,
    };
    const routeState = {
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
      routeTarget: f.source.request.routeTarget,
    };
    const reader = {
      read: vi.fn(async (input: Record<string, unknown>) => {
        const selected = await f.read(input as never);
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
    };
    const snapshotRoot = join(fixtureDb.artifactRoot, randomUUID());
    const snapshots = new LocalNavSnapshotStore(snapshotRoot);
    const injectedSnapshots = options.freezeFailure
      ? {
          freeze: async () => {
            throw new SnapshotIntegrityError('隔离验收注入的冻结失败');
          },
          replay: snapshots.replay.bind(snapshots),
        }
      : snapshots;

    @Module({
      controllers: [BacktestNavPreparationController, BacktestNavRunController],
      providers: [
        BacktestNavPreparationService,
        BacktestNavPreparationRepository,
        BacktestNavRunService,
        { provide: PrismaService, useValue: fixtureDb.prisma },
        { provide: MarketNavReaderV3, useValue: reader },
        { provide: NAV_PREPARATION_TIMEOUT_MS, useValue: 120_000 },
        { provide: LocalNavSnapshotStore, useValue: injectedSnapshots },
      ],
    })
    class TestModule {}

    const app: INestApplication = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const baseUrl = await app.getUrl();
    const current: Scenario = {
      baseUrl,
      strategyVersionId: version.id,
      snapshotRoot,
      reader,
      request,
      async close() {
        await app.close();
      },
      async prepare() {
        return post(`${baseUrl}/api/v1/backtests/run-config/nav/prepare`, request);
      },
      async create(receipt, idempotencyKey = randomUUID()) {
        return post(`${baseUrl}/api/v1/backtests/runs/nav`, {
          contractVersion: 3,
          ...receipt,
          idempotencyKey,
        });
      },
      async read(id) {
        return get(`${baseUrl}/api/v1/backtests/runs/nav/${id}`);
      },
    };
    active.push(current);
    return current;
  }

  async function persistedPreparation(current: Scenario) {
    const result = await current.prepare();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'prepared' });
    const receiptBody = asRecord(result.body.receipt);
    const receipt = {
      preparationId: requireString(receiptBody, 'preparationId'),
      preparationHash: requireString(receiptBody, 'preparationHash'),
    };
    const row = await fixtureDb.prisma.navBacktestPreparation.findUniqueOrThrow({
      where: { id: receipt.preparationId },
    });
    return { result: result.body, receipt, row };
  }

  it('准备 API 持久化完整请求与来源证据，Run 冻结并以失败终态关联同一凭证', async () => {
    const current = await scenario();
    const { result: prepared, receipt, row } = await persistedPreparation(current);
    expect(row.strategyVersionId).toBe(current.strategyVersionId);
    expect(row.preparationHash).toBe(asRecord(prepared.binding).preparationHash);
    expect(row.request).toEqual(current.request);
    const persistedEvidence = asRecord(row.evidence);
    const persistedContext = asRecord(persistedEvidence.context);
    const persistedSelection = asRecord(persistedEvidence.selection);
    const persistedResponse = asRecord(persistedSelection.response);
    expect(persistedContext.responseRaw).toBe(navPreparationFixture().source.response.responseRaw);
    expect(persistedResponse.publicationRecords).toHaveLength(2);

    const created = await current.create(receipt, 'n2-6-associated-run');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      inputKind: 'nav',
      status: 'failed',
      errorCode: 'NAV_RUNNER_UNAVAILABLE',
      preparationId: receipt.preparationId,
      preparationHash: receipt.preparationHash,
    });
    const runId = requireString(created.body, 'id');
    const job = await fixtureDb.prisma.backtestJob.findUniqueOrThrow({ where: { id: runId } });
    const consumed = await fixtureDb.prisma.navBacktestPreparation.findUniqueOrThrow({
      where: { id: receipt.preparationId },
    });
    expect(job).toMatchObject({
      status: 'failed',
      errorCode: 'NAV_RUNNER_UNAVAILABLE',
      snapshotId: created.body.snapshotId,
      snapshotManifest: created.body.snapshotManifest,
    });
    expect(consumed.consumedRunId).toBe(job.id);
    expect(asRecord(job.input)).toMatchObject({
      inputKind: 'nav',
      preparationId: receipt.preparationId,
      preparationHash: receipt.preparationHash,
    });

    const replay = await new LocalNavSnapshotStore(current.snapshotRoot).replay(job.id);
    expect(replay.manifest).toEqual(job.snapshotManifest);
    expect(replay.manifest.contentHash).toBe(job.snapshotId);
    expect(hashCanonicalManifest(replay.manifest)).toBe(
      hashCanonicalManifest(job.snapshotManifest),
    );
    expect((await current.read(job.id)).body).toEqual(created.body);
  }, 30_000);

  it.each(['facts', 'context', 'route'])(
    '即使重算数据库校验和，也拒绝被篡改的 %s 证据且不创建 Run',
    async (field) => {
      const current = await scenario();
      const { receipt, row } = await persistedPreparation(current);
      const request = asRecord(structuredClone(row.request));
      const evidence = asRecord(structuredClone(row.evidence));
      if (field === 'facts') {
        const facts = evidence.facts as Array<Record<string, unknown>>;
        facts[0]!.nav = '999.00000000';
      }
      if (field === 'context') {
        const context = asRecord(evidence.context);
        asRecord(context.calendar).valuationDates = [];
      }
      if (field === 'route') {
        const selection = asRecord(evidence.selection);
        const routeState = asRecord(selection.routeState);
        const targets = routeState.targets as Array<Record<string, unknown>>;
        targets[0]!.providerId = 'replacement';
      }
      await fixtureDb.prisma.navBacktestPreparation.update({
        where: { id: receipt.preparationId },
        data: {
          request: request as Prisma.InputJsonValue,
          evidence: evidence as Prisma.InputJsonValue,
          contentChecksum: navPreparationReceiptContentChecksum(request, evidence),
        },
      });

      const response = await current.create(receipt);
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'NAV_PREPARATION_RECEIPT_INVALID' });
      expect(
        await fixtureDb.prisma.backtestJob.count({
          where: { strategyVersionId: current.strategyVersionId },
        }),
      ).toBe(0);
      expect(
        (
          await fixtureDb.prisma.navBacktestPreparation.findUniqueOrThrow({
            where: { id: receipt.preparationId },
          })
        ).consumedRunId,
      ).toBeNull();
    },
  );

  it('拒绝策略版本、当前路由或有效期失效的凭证，均不落 Run', async () => {
    const staleStrategy = await scenario();
    const strategyReceipt = await persistedPreparation(staleStrategy);
    const version = await fixtureDb.prisma.strategyVersion.findUniqueOrThrow({
      where: { id: staleStrategy.strategyVersionId },
    });
    const changedSchema = structuredClone(version.schema) as Record<string, unknown>;
    changedSchema.name = `${String(changedSchema.name)} changed`;
    await fixtureDb.prisma.strategyVersion.update({
      where: { id: version.id },
      data: { schema: changedSchema as Prisma.InputJsonValue },
    });
    const staleStrategyResult = await staleStrategy.create(strategyReceipt.receipt);
    expect(staleStrategyResult.status).toBe(409);
    expect(staleStrategyResult.body).toMatchObject({ code: 'NAV_PREPARATION_STALE' });

    const staleRoute = await scenario();
    const routeReceipt = await persistedPreparation(staleRoute);
    staleRoute.reader.currentRouteState.mockImplementation(async () => ({
      desiredRevision: 99,
      effectivePolicyRevision: 1,
      catalogRevision: 2,
      targets: [],
      routeTarget: { providerId: 'efinance', upstreamSource: 'eastmoney', routeIndex: 0 },
    }));
    const staleRouteResult = await staleRoute.create(routeReceipt.receipt);
    expect(staleRouteResult.status).toBe(409);
    expect(staleRouteResult.body).toMatchObject({ code: 'NAV_PREPARATION_STALE' });

    const expired = await scenario();
    const expiredReceipt = await persistedPreparation(expired);
    const validExpiryMs = expiredReceipt.row.expiresAt.getTime();
    expect(validExpiryMs).toBeGreaterThan(Date.now());
    expect(validExpiryMs).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
    const consumedRun = await expired.create(expiredReceipt.receipt, 'n2-6-expiry-existing-run');
    expect(consumedRun.status).toBe(201);
    const consumedRunId = requireString(consumedRun.body, 'id');

    expired.request.requestId = `after-expiry-${randomUUID()}`;
    const unconsumedReceipt = await persistedPreparation(expired);
    expect(unconsumedReceipt.row.expiresAt.getTime()).toBe(validExpiryMs);
    vi.setSystemTime(new Date(validExpiryMs + 1_000));

    const expiredCreate = await expired.create(unconsumedReceipt.receipt, 'n2-6-expiry-new-run');
    expect(expiredCreate.status).toBe(409);
    expect(expiredCreate.body).toMatchObject({ code: 'NAV_PREPARATION_RECEIPT_CONFLICT' });

    const readAfterExpiry = await expired.read(consumedRunId);
    expect(readAfterExpiry.status).toBe(200);
    expect(readAfterExpiry.body).toMatchObject({ id: consumedRunId, inputKind: 'nav' });
    const repeatedAfterExpiry = await expired.create(
      expiredReceipt.receipt,
      'n2-6-expiry-existing-run',
    );
    expect(repeatedAfterExpiry.status).toBe(201);
    expect(repeatedAfterExpiry.body.id).toBe(consumedRunId);

    expect(
      await fixtureDb.prisma.backtestJob.count({
        where: {
          strategyVersionId: {
            in: [
              staleStrategy.strategyVersionId,
              staleRoute.strategyVersionId,
              expired.strategyVersionId,
            ],
          },
        },
      }),
    ).toBe(1);
    expect(
      (
        await fixtureDb.prisma.navBacktestPreparation.findUniqueOrThrow({
          where: { id: unconsumedReceipt.receipt.preparationId },
        })
      ).consumedRunId,
    ).toBeNull();
  }, 30_000);

  it('来源凭证与请求交叉绑定、或同一幂等键绑定第二张凭证时拒绝', async () => {
    const current = await scenario();
    const first = await persistedPreparation(current);
    const firstRun = await current.create(first.receipt, 'same-key-different-receipt');
    expect(firstRun.status).toBe(201);

    current.request.requestId = `second-${randomUUID()}`;
    const second = await persistedPreparation(current);
    expect(second.receipt.preparationHash).not.toBe(first.receipt.preparationHash);
    const crossBound = await current.create({
      preparationId: first.receipt.preparationId,
      preparationHash: second.receipt.preparationHash,
    });
    expect(crossBound.status).toBe(409);
    expect(crossBound.body).toMatchObject({ code: 'NAV_PREPARATION_STALE' });

    const sameKey = await current.create(second.receipt, 'same-key-different-receipt');
    expect(sameKey.status).toBe(409);
    expect(sameKey.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
    expect(
      await fixtureDb.prisma.backtestJob.count({
        where: { strategyVersionId: current.strategyVersionId },
      }),
    ).toBe(1);
  }, 30_000);

  it('冻结失败写入明确终态并消费凭证，但没有最终 Manifest', async () => {
    const current = await scenario({ freezeFailure: true });
    const { receipt } = await persistedPreparation(current);
    const created = await current.create(receipt, 'n2-6-freeze-failure');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      inputKind: 'nav',
      status: 'failed',
      errorCode: 'NAV_SNAPSHOT_INVALID',
      snapshotId: null,
      snapshotManifest: null,
    });
    const runId = requireString(created.body, 'id');
    expect(
      await fixtureDb.prisma.navBacktestPreparation.findUniqueOrThrow({
        where: { id: receipt.preparationId },
      }),
    ).toMatchObject({ consumedRunId: runId });
    const failedJob = await fixtureDb.prisma.backtestJob.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(failedJob).toMatchObject({
      status: 'failed',
      snapshotId: null,
    });
    expect(failedJob.snapshotManifest).toBeNull();
    await expect(
      new LocalNavSnapshotStore(current.snapshotRoot).replay(runId),
    ).rejects.toBeDefined();
  }, 30_000);

  it('同一凭证并发使用同一幂等键只消费一次；不同键并发只允许一个 Run', async () => {
    const sameKey = await scenario();
    const sameReceipt = await persistedPreparation(sameKey);
    const sameResults = await Promise.all([
      sameKey.create(sameReceipt.receipt, 'n2-6-same-key-concurrent'),
      sameKey.create(sameReceipt.receipt, 'n2-6-same-key-concurrent'),
    ]);
    expect(sameResults.map((result) => result.status)).toEqual([201, 201]);
    expect(sameResults[0]!.body.id).toBe(sameResults[1]!.body.id);
    expect(
      await fixtureDb.prisma.backtestJob.count({
        where: { strategyVersionId: sameKey.strategyVersionId },
      }),
    ).toBe(1);
    expect(
      (
        await fixtureDb.prisma.navBacktestPreparation.findUniqueOrThrow({
          where: { id: sameReceipt.receipt.preparationId },
        })
      ).consumedRunId,
    ).toBe(sameResults[0]!.body.id);

    const differentKeys = await scenario();
    const competing = await persistedPreparation(differentKeys);
    const differentResults = await Promise.all([
      differentKeys.create(competing.receipt, 'n2-6-key-a'),
      differentKeys.create(competing.receipt, 'n2-6-key-b'),
    ]);
    expect(differentResults.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      await fixtureDb.prisma.backtestJob.count({
        where: { strategyVersionId: differentKeys.strategyVersionId },
      }),
    ).toBe(1);
  }, 60_000);

  it('事务消费失败回滚 Run 与凭证，已冻结孤儿文件不能经 DB 读取成为 Run', async () => {
    const current = await scenario();
    const { receipt } = await persistedPreparation(current);
    const triggerName = `nav_n2_6_fail_${randomUUID().replaceAll('-', '')}`;
    const functionName = `${triggerName}_fn`;
    await fixtureDb.adminSql(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD."consumedRunId" IS NULL AND NEW."consumedRunId" IS NOT NULL THEN
          RAISE EXCEPTION 'N2.6 injected consumption failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER "${triggerName}" BEFORE UPDATE OF "consumedRunId" ON "NavBacktestPreparation"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"();
    `);
    try {
      const failed = await current.create(receipt, 'n2-6-rollback');
      expect(failed.status).toBe(500);
      expect(
        await fixtureDb.prisma.backtestJob.count({
          where: { strategyVersionId: current.strategyVersionId },
        }),
      ).toBe(0);
      expect(
        (
          await fixtureDb.prisma.navBacktestPreparation.findUniqueOrThrow({
            where: { id: receipt.preparationId },
          })
        ).consumedRunId,
      ).toBeNull();
      const orphanIds = await readdir(join(current.snapshotRoot, 'snapshots'));
      expect(orphanIds).toHaveLength(1);
      expect(
        await fixtureDb.prisma.backtestJob.findUnique({ where: { id: orphanIds[0]! } }),
      ).toBeNull();
      expect((await current.read(orphanIds[0]!)).status).toBe(404);
    } finally {
      await fixtureDb.adminSql(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "NavBacktestPreparation"; DROP FUNCTION IF EXISTS "${functionName}"();`,
      );
    }

    const recovered = await current.create(receipt, 'n2-6-rollback');
    expect(recovered.status).toBe(201);
    expect(
      (
        await fixtureDb.prisma.navBacktestPreparation.findUniqueOrThrow({
          where: { id: receipt.preparationId },
        })
      ).consumedRunId,
    ).toBe(recovered.body.id);
    expect(
      await fixtureDb.prisma.backtestJob.count({
        where: { strategyVersionId: current.strategyVersionId },
      }),
    ).toBe(1);
  }, 45_000);

  it('数据库断连后新 Prisma 与 Run Service 读回准备证据及已冻结 Run', async () => {
    const current = await scenario();
    const { receipt, row } = await persistedPreparation(current);
    const created = await current.create(receipt, 'n2-6-restart-read');
    expect(created.status).toBe(201);
    const runId = requireString(created.body, 'id');
    const sourceReadCount = current.reader.read.mock.calls.length;
    await fixtureDb.prisma.$disconnect();
    const reopened = new PrismaService({
      datasources: { db: { url: fixtureDb.databaseUrl } },
    });
    try {
      await reopened.onModuleInit();
      const reread = await reopened.navBacktestPreparation.findUniqueOrThrow({
        where: { id: receipt.preparationId },
      });
      expect(reread.request).toEqual(row.request);
      expect(reread.evidence).toEqual(row.evidence);
      expect(asRecord(asRecord(reread.evidence).context).responseRaw).toBe(
        asRecord(asRecord(row.evidence).context).responseRaw,
      );
      const restartedRuns = new BacktestNavRunService(
        reopened,
        current.reader as unknown as MarketNavReaderV3,
        new LocalNavSnapshotStore(current.snapshotRoot),
      );
      const rereadRun = await restartedRuns.read(runId);
      expect(rereadRun).toMatchObject({
        id: runId,
        inputKind: 'nav',
        status: 'failed',
        errorCode: 'NAV_RUNNER_UNAVAILABLE',
        snapshotId: created.body.snapshotId,
      });
      expect(current.reader.read).toHaveBeenCalledTimes(sourceReadCount);
    } finally {
      await reopened.onModuleDestroy();
    }
  }, 30_000);
});

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await readBody(response) };
}

async function get(url: string) {
  const response = await fetch(url);
  return { status: response.status, body: await readBody(response) };
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('预期 JSON 对象');
  }
  return value as Record<string, unknown>;
}

function requireString(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string') throw new Error(`响应缺少字符串字段 ${key}`);
  return result;
}
