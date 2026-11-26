import { namedStrategyFixture } from './named-v1-strategy.fixture.js';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import { BacktestNavRunController } from '../../src/backtest/backtest-nav-run.controller.js';
import { BacktestNavRunService } from '../../src/backtest/backtest-nav-run.service.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { BacktestNavRunExecution } from '../../src/backtest/backtest-nav-run-execution.js';
import { materializeNavBacktest } from '../../src/backtest/backtest-nav-materialization.js';
import { navPreparationReceiptContentChecksum } from '../../src/backtest/backtest-nav-preparation-repository.js';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import {
  canonicalizeManifest,
  hashCanonicalManifest,
  SnapshotIntegrityError,
} from '../../src/backtest/backtest-snapshot.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import type { MarketNavReaderV3 } from '../../src/market/market-nav-reader-v3.js';
import { prepareNavRunConfigV3 } from '../../src/backtest/backtest-nav-preparation.js';
import { navPreparationFixture } from './nav-preparation.fixtures.js';
import { sharedStrategyHttpProviders } from './shared-strategy-http-providers.js';

const preparationId = '22222222-2222-4222-8222-222222222222';
const alternatePreparationId = '33333333-3333-4333-8333-333333333333';
const strategyVersionId = '11111111-1111-4111-8111-111111111111';
const idempotencyKey = 'nav-http-create';
const now = '2026-09-30T15:03:00.000Z';

type NavHttpHarness = Awaited<ReturnType<typeof createHttpHarness>>;

describe('NAV Run 创建与幂等', () => {
  let h: NavHttpHarness;
  beforeEach(async () => (h = await createHttpHarness()));
  afterEach(async () => h.close());

  it('HTTP先保存queued意图，Worker冻结真实Parquet，幂等读取及完整性门禁贯通', async () => {
    const created = await h.post();
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      inputKind: 'nav',
      status: 'queued',
      errorCode: null,
      preparationId,
      preparationHash: h.prepared.binding.preparationHash,
      executionAttempt: 0,
    });
    expect(h.state.readPreparation()).toMatchObject({ consumedRunId: created.body.id });
    expect(h.reader.currentRouteState).toHaveBeenCalledTimes(2);

    const repeated = await h.post();
    expect(repeated.status).toBe(201);
    expect(repeated.body.id).toBe(created.body.id);
    const alternateHash = '0'.repeat(64);
    h.state.addAlternatePreparation(alternatePreparationId, alternateHash);
    const reusedKey = await h.post({
      ...h.createBody(),
      preparationId: alternatePreparationId,
      preparationHash: alternateHash,
    });
    expect(reusedKey.status).toBe(409);
    expect(reusedKey.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });

    const read = await fetch(`${h.endpoint}/${created.body.id}`);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      id: created.body.id,
      status: 'queued',
      errorCode: null,
      snapshotId: created.body.snapshotId,
      snapshotManifest: null,
    });
    expect(h.reader.currentRouteState).toHaveBeenCalledTimes(2);
    expect(await h.runWorker(String(created.body.id))).toMatchObject({ status: 'succeeded' });
    h.state.tamperSnapshotManifest(String(created.body.id));
    expect((await fetch(`${h.endpoint}/${created.body.id}`)).status).toBe(409);
    const differentKey = await h.post({ ...h.createBody(), idempotencyKey: 'second-key' });
    expect(differentKey.status).toBe(409);
    expect(differentKey.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
  }, 30000);

  it('Schema 3净值定义先提交、重复读取，等待Worker物化', async () => {
    const upgraded = await createHttpHarness({ upgrade: true });
    try {
      const created = await upgraded.post();
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ inputKind: 'nav', status: 'queued', errorCode: null, snapshotId: null });
      expect((await upgraded.post()).body.id).toBe(created.body.id);
      const read = await fetch(`${upgraded.endpoint}/${created.body.id}`);
      expect(read.status).toBe(200);
      expect(await read.json()).toMatchObject({ id: created.body.id, snapshotId: created.body.snapshotId });
    } finally { await upgraded.close(); }
  });
  it('严格拒绝已变化的路由，不冻结、不创建或消费', async () => {
    h.setRouteState({ ...(h.prepared.selection.routeState as object), catalogRevision: 999 });
    expect((await h.post()).status).toBe(409);
    expect(h.state.readJobs()).toHaveLength(0);
    expect(h.state.readPreparation().consumedRunId).toBeNull();
  });

  it('数据库准备凭证 CAS 失败时回滚 Run 与消费关联', async () => {
    h.state.forceConsumeConflict();
    expect((await h.post()).status).toBe(409);
    expect(h.state.readJobs()).toHaveLength(0);
    expect(h.state.readPreparation().consumedRunId).toBeNull();
  });

  it('未知数据库错误保持 500，不伪装为证据或冻结失败', async () => {
    h.state.failNextTransaction(new Error('database unavailable'));
    expect((await h.post()).status).toBe(500);
    expect(h.state.readJobs()).toHaveLength(0);
    expect(h.state.readPreparation().consumedRunId).toBeNull();
  });
});

describe('NAV Snapshot 故障与证据核验', () => {
  let h: NavHttpHarness;
  beforeEach(async () => (h = await createHttpHarness()));
  afterEach(async () => h.close());

  it('完整性错误由Worker形成具体失败，创建请求不提前编码', async () => {
    const integrityStore = failingStore(new SnapshotIntegrityError('broken snapshot'));
    const integrity = await h.postWithSnapshotStore(integrityStore);
    expect(integrity.status).toBe(201);
    expect(integrity.body.status).toBe('queued');
    expect(await h.runWorker(String(integrity.body.id), integrityStore)).toMatchObject({
      status: 'failed',
      errorCode: 'SNAPSHOT_HASH_MISMATCH',
      snapshotId: null,
      snapshotManifest: null,
    });

  });

  it('文件系统ENOSPC保留可查询失败及已消费凭证', async () => {
    const outOfSpace = await h.post();
    const diskFull = Object.assign(new Error('disk full'), { code: 'ENOSPC', syscall: 'write' });
    expect(await h.runWorker(String(outOfSpace.body.id), failingStore(diskFull))).toMatchObject({
      status: 'failed',
      errorCode: 'ENOSPC',
      snapshotId: null,
      snapshotManifest: null,
    });
    expect(h.state.readPreparation().consumedRunId).toBe(outOfSpace.body.id);
  });

  it('未知冻结错误在Worker失败，创建意图和已消费凭证保留', async () => {
    const response = await h.postWithSnapshotStore(failingStore(new Error('unexpected failure')));
    expect(response.status).toBe(201);
    expect(await h.runWorker(String(response.body.id), failingStore(new Error('unexpected failure'))))
      .toMatchObject({ status: 'failed', errorCode: 'INTERNAL_ERROR' });
    expect(h.state.readPreparation().consumedRunId).toBe(response.body.id);
  });

  it('读取拒绝同步篡改物理与数据库镜像的来源策略版本', async () => {
    const created = await h.post();
    await h.runWorker(String(created.body.id));
    const manifestPath = join(h.root, 'attempts', String(created.body.id), '1', 'snapshots', String(created.body.id), 'finalized.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    const sourceManifest = manifest.source as Record<string, unknown>;
    sourceManifest.policyRevision = Number(sourceManifest.policyRevision) + 1;
    manifest.contentHash = hashCanonicalManifest(manifest);
    await writeFile(manifestPath, `${canonicalizeManifest(manifest)}\n`);
    h.state.replaceSnapshotManifest(String(created.body.id), manifest);

    const response = await fetch(`${h.endpoint}/${created.body.id}`);
    expect(response.status).toBe(409);
    expect(h.state.readJobs()[0]).toMatchObject({ snapshotId: manifest.contentHash });
  });
});

describe('NAV Run 并发与 HTTP 边界', () => {
  let h: NavHttpHarness;
  beforeEach(async () => (h = await createHttpHarness()));
  afterEach(async () => h.close());

  it('锁内同键消费竞态按历史凭证幂等读取，不重验当前有效期或路由', async () => {
    const created = await h.post();
    const runId = String(created.body.id);
    const callsBeforeRetry = h.reader.currentRouteState.mock.calls.length;
    h.state.armConcurrentConsumption(runId, () => {
      vi.setSystemTime('2026-09-30T15:30:00.000Z');
      h.setRouteState({ ...(h.prepared.selection.routeState as object), catalogRevision: 999 });
    });
    const repeated = await h.post();
    expect(repeated.status).toBe(201);
    expect(repeated.body).toMatchObject({ id: runId, status: 'queued' });
    expect(h.reader.currentRouteState).toHaveBeenCalledTimes(callsBeforeRetry + 1);
  });

  it('HTTP 非法 UUID 在访问数据库前返回 400，合法但不存在的 UUID 返回 404', async () => {
    const before = h.state.readJobLookupCalls();
    expect((await fetch(`${h.endpoint}/not-a-uuid`)).status).toBe(400);
    expect(h.state.readJobLookupCalls()).toBe(before);
    expect((await fetch(`${h.endpoint}/99999999-9999-4999-8999-999999999999`)).status).toBe(404);
    expect(h.state.readJobLookupCalls()).toBe(before + 1);
  });
});

describe('NAV 消费 HTTP 闭环', () => {
  it('NAV完整文件关联前中断，由下一attempt复用整套产物', async () => {
    const h = await createHttpHarness();
    const freeze = vi.spyOn(LocalNavSnapshotStore.prototype, 'freeze');
    try {
      const created = await h.post(); const id = String(created.body.id);
      h.state.updateJob(id, { status: 'running', executionAttempt: 1, engineVersion: 'nav-current' });
      const update = h.state.prisma.backtestJob.updateMany;
      const original = update.getMockImplementation()!;
      update.mockImplementation(async (args) => {
        if (args.data.snapshotId) throw Object.assign(new Error('db disconnected before publication'), { code: 'P1001' });
        return original(args);
      });
      const job = () => h.state.readJobs().find((row) => row.id === id)!;
      await expect(materializeNavBacktest(h.state.prisma as never, job() as never, h.store, new AbortController().signal))
        .rejects.toMatchObject({ code: 'P1001' });
      expect(job().snapshotId).toBeNull();
      update.mockImplementation(original);
      h.state.updateJob(id, { executionAttempt: 2 });
      const published = await materializeNavBacktest(h.state.prisma as never, job() as never, h.store, new AbortController().signal);
      expect(published.input).toMatchObject({ snapshotStorageAttempt: 1 });
      expect(freeze).toHaveBeenCalledOnce();
      expect((await fetch(`${h.endpoint}/${id}`)).status).toBe(200);
    } finally { freeze.mockRestore(); await h.close(); }
  });
  it('NAV旧版本成功结果可读，显式重试返回关联新id，原凭证过期及路由变化不重新准备', async () => {
    const h = await createHttpHarness();
    try {
      const created = await h.post(); const id = String(created.body.id);
      const finished = await h.runWorker(id);
      expect(finished?.status).toBe('succeeded');
      const payload: Record<string, unknown> = { ...(finished!.result as Record<string, unknown>), engineVersion: 'thesis-ledger-v3-nav-local-runner-v1' };
      delete payload.resultChecksum;
      const checksum = deterministicResultChecksum(payload);
      h.state.updateJob(id, { engineVersion: payload.engineVersion, result: { ...payload, resultChecksum: checksum }, resultChecksum: checksum });
      expect((await fetch(`${h.endpoint}/${id}`)).status).toBe(200);
      const original = structuredClone(h.state.readJobs()[0]);
      vi.setSystemTime('2026-09-30T15:40:00.000Z');
      h.setRouteState({ catalogRevision: 999 });
      const calls = h.reader.currentRouteState.mock.calls.length;
      const nav = new BacktestNavRunExecution(h.state.prisma as never, h.store);
      const service = new BacktestRunService(h.state.prisma as never, undefined, undefined, undefined, undefined, undefined, nav);
      const response = await fetch(`${h.endpoint}/${id}/retry`, { method: 'POST' });
      expect(response.status).toBe(201);
      const linked = await response.json() as { id: string };
      expect(linked.id).not.toBe(id);
      expect((await service.retryRun(id))?.id).toBe(linked.id);
      const replayed = await h.runWorker(linked.id);
      expect({ status: replayed?.status, code: replayed?.errorCode, reason: replayed?.errorSummary })
        .toEqual({ status: 'succeeded', code: null, reason: null });
      expect((await fetch(`${h.endpoint}/${linked.id}`)).status).toBe(200);
      expect(h.reader.currentRouteState).toHaveBeenCalledTimes(calls);
      expect(h.state.readJobs().find((job) => job.id === id)).toEqual(original);
    } finally { await h.close(); }
  });
  it('执行与队列可用时先落库入队，Worker稍后冻结', async () => {
    const queue = {
      supportsNavExecution: vi.fn(() => true),
      ensureEnqueued: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
    };
    const h = await createHttpHarness({ queueService: queue });
    try {
      const created = await h.post();
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        inputKind: 'nav',
        status: 'queued',
        stage: 'queued',
        progress: 0,
        errorCode: null,
        errorSummary: null,
      });
      expect(queue.ensureEnqueued).toHaveBeenCalledWith(created.body.id);
    } finally {
      await h.close();
    }
  }, 30000);

  it('NAV retry 与 cancel 使用独立 HTTP 路由并返回 NAV 合同', async () => {
    const runExecution = {
      retryRun: vi.fn<(id: string) => Promise<void>>(),
    };
    const queue = {
      supportsNavExecution: vi.fn(() => false),
      ensureEnqueued: vi.fn(async () => undefined),
      cancel: vi.fn<(id: string) => Promise<void>>(),
    };
    const h = await createHttpHarness({ queueService: queue, runExecution });
    try {
      const created = await h.post();
      runExecution.retryRun.mockImplementation(async (id) => {
        h.state.updateJob(id, {
          status: 'queued',
          stage: 'queued',
          progress: 0,
          errorCode: null,
          errorSummary: null,
          startedAt: null,
          finishedAt: null,
        });
      });
      queue.cancel.mockImplementation(async (id) => {
        h.state.updateJob(id, {
          status: 'cancelled',
          stage: 'cancelled',
          progress: 100,
          cancelRequestedAt: new Date(),
          finishedAt: new Date(),
        });
      });
      const retry = await fetch(`${h.endpoint}/${created.body.id}/retry`, { method: 'POST' });
      expect(retry.status).toBe(201);
      expect(await retry.json()).toMatchObject({ id: created.body.id, status: 'queued' });
      expect(runExecution.retryRun).toHaveBeenCalledWith(created.body.id);

      const cancel = await fetch(`${h.endpoint}/${created.body.id}/cancel`, { method: 'POST' });
      expect(cancel.status).toBe(201);
      expect(await cancel.json()).toMatchObject({ id: created.body.id, status: 'cancelled' });
      expect(queue.cancel).toHaveBeenCalledWith(created.body.id);
    } finally {
      await h.close();
    }
  }, 30000);
});

async function createHttpHarness(input: {
  upgrade?: boolean;
  queueService?: {
    supportsNavExecution: () => boolean;
    ensureEnqueued: (id: string) => Promise<unknown>;
    cancel: (id: string) => Promise<unknown>;
  };
  runExecution?: { retryRun: (id: string) => Promise<unknown> };
} = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const root = await mkdtemp(join(tmpdir(), 'nav-run-http-'));
  const source = navPreparationFixture();
  if (input.upgrade) Object.assign(source.strategy, namedStrategyFixture(source.strategy));
  const prepared = await prepareNavRunConfigV3(source.options);
  let routeState: unknown = prepared.selection.routeState;
  const reader = { currentRouteState: vi.fn(async () => routeState) };
  const state = createDatabase({
    preparationId,
    preparationHash: prepared.binding.preparationHash,
    evidence: prepared,
    request: source.request,
    strategy: source.strategy,
    strategyVersionId,
  });
  const queueService =
    input.queueService ?? {
      supportsNavExecution: () => false,
      ensureEnqueued: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
    };
  const store = new LocalNavSnapshotStore(root);
  const runExecution = input.runExecution ?? new BacktestRunService(state.prisma as never,
    undefined, undefined, undefined, undefined, undefined, new BacktestNavRunExecution(state.prisma as never, store));
  const service = new BacktestNavRunService(
    state.prisma as never,
    reader as never as MarketNavReaderV3,
    store,
    queueService as never,
  );
  @Module({
    controllers: [BacktestNavRunController],
    providers: [
      ...sharedStrategyHttpProviders,
      { provide: BacktestNavRunService, useValue: service },
      { provide: BacktestRunService, useValue: runExecution },
      { provide: BacktestQueueService, useValue: queueService },
    ],
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const endpoint = `${await app.getUrl()}/api/v1/backtests/runs/nav`;
  const createBody = () => ({
    contractVersion: 1,
    preparationId,
    preparationHash: prepared.binding.preparationHash,
    idempotencyKey,
  });
  const post = async (body: unknown = createBody()) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const postWithSnapshotStore = async (snapshotStore: LocalNavSnapshotStore) => {
    const alternateService = new BacktestNavRunService(
      state.prisma as never,
      reader as never as MarketNavReaderV3,
      snapshotStore,
      queueService as never,
    );
    @Module({
      controllers: [BacktestNavRunController],
      providers: [
        ...sharedStrategyHttpProviders,
        { provide: BacktestNavRunService, useValue: alternateService },
        { provide: BacktestRunService, useValue: runExecution },
        { provide: BacktestQueueService, useValue: queueService },
      ],
    })
    class SnapshotStoreModule {}
    const alternate = await NestFactory.create(SnapshotStoreModule, { logger: false });
    alternate.useGlobalFilters(new ApiExceptionFilter());
    alternate.setGlobalPrefix('api/v1');
    await alternate.listen(0, '127.0.0.1');
    try {
      const response = await fetch(`${await alternate.getUrl()}/api/v1/backtests/runs/nav`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createBody()),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    } finally {
      await alternate.close();
    }
  };
  return {
    root,
    endpoint,
    state,
    prepared,
    reader,
    store,
    createBody,
    post,
    postWithSnapshotStore,
    runWorker: async (id: string, snapshots = store) => {
      const nav = new BacktestNavRunExecution(state.prisma as never, snapshots);
      const worker = new BacktestRunService(state.prisma as never, undefined, undefined, undefined, undefined, undefined, nav);
      return worker.runCurrent(id);
    },
    setRouteState: (value: unknown) => {
      routeState = value;
    },
    updateJob: state.updateJob,
    close: async () => {
      await app.close();
      await rm(root, { recursive: true, force: true });
      vi.useRealTimers();
    },
  };
}

function failingStore(error: Error): LocalNavSnapshotStore {
  const store = {
    freeze: vi.fn(async () => {
      throw error;
    }),
    replay: vi.fn(async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }),
    forAttempt: () => store,
  } as unknown as LocalNavSnapshotStore;
  return store;
}

function createDatabase(input: {
  preparationId: string;
  preparationHash: string;
  request: unknown;
  evidence: unknown;
  strategy: unknown;
  strategyVersionId: string;
}) {
  let preparation = {
    id: input.preparationId,
    strategyVersionId: input.strategyVersionId,
    preparationHash: input.preparationHash,
    contentChecksum: navPreparationReceiptContentChecksum(input.request, input.evidence),
    request: input.request,
    evidence: input.evidence,
    expiresAt: new Date('2026-09-30T15:17:00.000Z'),
    consumedRunId: null as string | null,
  };
  const alternatePreparations = new Map<string, typeof preparation>();
  const jobs = new Map<string, Record<string, unknown>>();
  let consumeConflict = false;
  let transactionFailure: Error | undefined;
  let concurrentConsumption:
    { id: string; job: Record<string, unknown>; afterLock: () => void } | undefined;
  const delegates = {
    navBacktestPreparation: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, string> }) => {
        if (where.id !== undefined) {
          if (where.id === preparation.id) return { ...preparation };
          const alternate = alternatePreparations.get(where.id);
          return alternate ? { ...alternate } : null;
        }
        if (where.consumedRunId !== undefined)
          return preparation.consumedRunId === where.consumedRunId ? { ...preparation } : null;
        return null;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (
            consumeConflict ||
            preparation.id !== where.id ||
            preparation.preparationHash !== where.preparationHash ||
            preparation.consumedRunId !== null
          )
            return { count: 0 };
          preparation = { ...preparation, consumedRunId: data.consumedRunId as string };
          return { count: 1 };
        },
      ),
    },
    strategyVersion: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === input.strategyVersionId
          ? { id: input.strategyVersionId, schemaVersion: 1, schema: input.strategy }
          : null,
      ),
    },
    backtestJob: {
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const job = jobs.get(String(where.id));
        if (!job) return { count: 0 };
        const matches = Object.entries(where).every(([key, value]) => {
          if (value && typeof value === 'object') {
            if ('lt' in value) return Number(job[key]) < Number(value.lt);
            if ('in' in value) return (value.in as unknown[]).includes(job[key]);
          }
          return (job[key] ?? null) === value;
        });
        if (!matches) return { count: 0 };
        Object.assign(job, data); return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => jobs.get(where.id)),
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          [...jobs.values()].find(
            (job) =>
              job.strategyVersionId === where.strategyVersionId &&
              job.idempotencyKey === where.idempotencyKey,
          ) ?? null,
      ),
      findUnique: vi.fn(async ({ where }: { where: Record<string, string> }) => {
        if (where.id) return jobs.get(where.id) ?? null;
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const createdAt = new Date();
        const job = {
          snapshotId: null,
          errorCode: null,
          errorSummary: null,
          ...data,
          snapshotManifest:
            data.snapshotManifest === Prisma.JsonNull || data.snapshotManifest == null ? null : data.snapshotManifest,
          createdAt,
          updatedAt: createdAt,
          startedAt: null,
        };
        jobs.set(String(data.id), job);
        return job;
      }),
    },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      if (concurrentConsumption && strings.join('').includes('NavBacktestPreparation')) {
        preparation = { ...preparation, consumedRunId: concurrentConsumption.id };
        jobs.set(concurrentConsumption.id, concurrentConsumption.job);
        concurrentConsumption.afterLock();
        concurrentConsumption = undefined;
      }
      return [];
    }),
  };
  const transactionClient = delegates;
  const prisma = {
    ...delegates,
    $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => {
      if (transactionFailure) {
        const failure = transactionFailure;
        transactionFailure = undefined;
        throw failure;
      }
      const beforePreparation = { ...preparation };
      const beforeJobs = new Map(jobs);
      try {
        return await callback(transactionClient);
      } catch (error) {
        preparation = beforePreparation;
        jobs.clear();
        for (const [id, job] of beforeJobs) jobs.set(id, job);
        throw error;
      }
    }),
  };
  return {
    prisma,
    readPreparation: () => preparation,
    readJobs: () => [...jobs.values()],
    updateJob: (id: string, patch: Record<string, unknown>) => {
      const job = jobs.get(id);
      if (job) Object.assign(job, patch);
    },
    forceConsumeConflict: () => {
      consumeConflict = true;
    },
    failNextTransaction: (error: Error) => {
      transactionFailure = error;
    },
    addAlternatePreparation: (id: string, hash: string) => {
      alternatePreparations.set(id, {
        ...preparation,
        id,
        preparationHash: hash,
        consumedRunId: null,
      });
    },
    armConcurrentConsumption: (id: string, afterLock: () => void) => {
      const job = jobs.get(id);
      if (!job) throw new Error(`Concurrent run ${id} is missing`);
      jobs.delete(id);
      preparation = { ...preparation, consumedRunId: null };
      concurrentConsumption = { id, job, afterLock };
    },
    replaceSnapshotManifest: (id: string, manifest: unknown) => {
      const job = jobs.get(id);
      if (!job) return;
      job.snapshotManifest = manifest;
      const contentHash = (manifest as Record<string, unknown>).contentHash;
      if (typeof contentHash === 'string') job.snapshotId = contentHash;
    },
    readJobLookupCalls: () => delegates.backtestJob.findUnique.mock.calls.length,
    tamperSnapshotManifest: (id: string) => {
      const job = jobs.get(id);
      if (!job || !job.snapshotManifest || typeof job.snapshotManifest !== 'object') return;
      job.snapshotManifest = { ...(job.snapshotManifest as object), contentHash: 'f'.repeat(64) };
    },
  };
}
