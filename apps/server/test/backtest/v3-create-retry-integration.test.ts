import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { preparationStampFor, preparedRevisionReader } from './v3-preparation-fixtures.js';
import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import type { BacktestResultV3 } from '@thesis-ledger/schemas';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { hashCanonicalManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import {
  LocalSnapshotV3Runner,
  type BacktestV3Runner,
  type BacktestV3RunnerInput,
} from '../../src/backtest/backtest-v3-runner.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const strategyVersionId = '11111111-1111-4111-8111-111111111111';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

type HarnessOptions = {
  multipleSignals?: boolean;
  failFirstRun?: boolean;
  waitForAbort?: boolean;
  raceExisting?: Record<string, unknown>;
};

const createHarness = async (options: HarnessOptions = {}) => {
  const root = await mkdtemp(join(tmpdir(), 's09-r3c4-integration-'));
  temporaryDirectories.push(root);
  const fixture = await completeSnapshotFixture();
  if (options.multipleSignals) {
    const primaryEntry = fixture.input.strategy.entry;
    if (primaryEntry.type !== 'compare') throw new Error('Expected comparison fixture');
    fixture.input.strategy.signalSources.push({
      ...fixture.input.strategy.signalSources[0]!,
      id: 'second',
    });
    fixture.input.strategy.entry = {
      type: 'all',
      conditions: [
        primaryEntry,
        {
          type: 'compare',
          operator: 'gte',
          left: { type: 'series', sourceId: 'second', field: 'close' },
          right: { type: 'series', sourceId: 'execution', field: 'close' },
        },
      ],
    };
    fixture.input.runConfig.priceInputBindings!.signals.push({
      sourceId: 'second',
      binding: 'execution-series',
    });
  }
  fixture.input.strategyVersionId = strategyVersionId;
  fixture.input.strategyVersionHash = hashCanonicalManifest(fixture.input.strategy);
  const snapshots = new LocalSnapshotStore(root);
  const realBuilder = new DsaSnapshotBuilder(
    fixture.dsa as unknown as DsaClient,
    snapshots,
    fixture.reader,
  );
  const builder = {
    buildV3: vi.fn(realBuilder.buildV3.bind(realBuilder)),
  };
  const localRunner = new LocalSnapshotV3Runner(snapshots);
  let runnerCalls = 0;
  let releaseAbort: (() => void) | undefined;
  let observedSignal: AbortSignal | undefined;
  let runner: BacktestV3Runner = localRunner;
  if (options.failFirstRun) {
    runner = {
      id: localRunner.id,
      run: vi.fn(async (input: BacktestV3RunnerInput, signal: AbortSignal) => {
        runnerCalls += 1;
        if (runnerCalls === 1) throw new Error('temporary execution failure');
        return localRunner.run(input, signal);
      }),
    };
  } else if (options.waitForAbort) {
    runner = {
      id: localRunner.id,
      run: vi.fn(
        async (_input: BacktestV3RunnerInput, signal: AbortSignal) =>
          new Promise<BacktestResultV3>((_resolve, reject) => {
            observedSignal = signal;
            releaseAbort = () => reject(new Error('aborted'));
            signal.addEventListener('abort', () => releaseAbort?.(), { once: true });
          }),
      ),
    };
  }

  let job: Record<string, unknown> | null = null;
  let findFirstCalls = 0;
  const findFirst = vi.fn(async () => {
    findFirstCalls += 1;
    if (options.raceExisting && findFirstCalls === 1) return null;
    if (options.raceExisting) return options.raceExisting;
    return job;
  });
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (options.raceExisting)
      throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
    job = {
      executionAttempt: 0,
      cancelRequestedAt: null,
      startedAt: null,
      finishedAt: null,
      result: null,
      resultChecksum: null,
      ...data,
    };
    return job;
  });
  const findUnique = vi.fn<(query: unknown) => Promise<Record<string, unknown> | null>>(
    async () => job,
  );
  const updateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!job) return { count: 0 };
      for (const [key, expected] of Object.entries(where)) {
        const actual = job[key];
        if (expected && typeof expected === 'object') {
          const condition = expected as Record<string, unknown>;
          if ('in' in condition && !(condition.in as unknown[]).includes(actual)) {
            return { count: 0 };
          }
          if ('lt' in condition && !(Number(actual) < Number(condition.lt))) return { count: 0 };
          if ('not' in condition && actual === condition.not) return { count: 0 };
        } else if (actual !== expected) {
          return { count: 0 };
        }
      }
      job = { ...job, ...data };
      return { count: 1 };
    },
  );
  const prisma = {
    strategyVersion: {
      findUnique: vi.fn(async () => ({ schemaVersion: 2, schema: fixture.input.strategy })),
    },
    backtestJob: { findFirst, findUnique, create, updateMany },
  };
  const queue = {
    ensureEnqueued: vi.fn(async () => job),
  };
  const revisions = preparedRevisionReader();
  const service = new BacktestRunService(
    prisma as never,
    queue as never,
    snapshots,
    builder as never,
    runner,
    new BacktestCreationGuardService(prisma as never, revisions as never),
  );
  const request = {
    contractVersion: 3 as const,
    preparationStamp: preparationStampFor(
      fixture.input.strategy,
      fixture.input.runConfig,
      strategyVersionId,
    ),
    strategyVersionId,
    idempotencyKey: 'r3c4-frozen-create',
    runConfig: fixture.input.runConfig,
  };

  return {
    buildV3: builder.buildV3,
    fixture,
    job: () => job,
    localRunner,
    prisma,
    queue,
    request,
    runner,
    service,
    revisions,
    setJob: (next: Record<string, unknown>) => {
      job = next;
    },
    snapshots,
    observedSignal: () => observedSignal,
  };
};

describe('V3 create and frozen retry integration', () => {
  it('rejects the retired Run contract before reading or writing a job', async () => {
    const h = await createHarness();
    await expect(h.service.createRun({ ...h.request, contractVersion: 2 })).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
    expect(h.prisma.backtestJob.findFirst).not.toHaveBeenCalled();
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
    expect(h.buildV3).not.toHaveBeenCalled();
  });

  it('rejects a missing preparation stamp before reading prices or creating a Run', async () => {
    const h = await createHarness();
    await expect(
      h.service.createRun({ ...h.request, preparationStamp: undefined }),
    ).rejects.toThrow();
    expect(h.fixture.reader.readV3).not.toHaveBeenCalled();
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
  });

  it.each([
    'strategyContentHash',
    'runConfigChecksum',
    'desiredRevision',
    'effectiveRevision',
    'catalogRevision',
  ] as const)('rejects an altered %s before creating a Snapshot', async (field) => {
    const h = await createHarness();
    const altered = {
      ...h.request.preparationStamp,
      [field]: field.endsWith('Revision') ? 999 : '0'.repeat(64),
    };
    await expect(
      h.service.createRun({ ...h.request, preparationStamp: altered }),
    ).rejects.toMatchObject({ response: { code: 'PREPARATION_STALE' } });
    expect(h.buildV3).not.toHaveBeenCalled();
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
  });

  it('checks the actual Reader revision even when the control plane is unchanged', async () => {
    const h = await createHarness();
    const read = h.fixture.reader.readV3.getMockImplementation()!;
    h.fixture.reader.readV3.mockImplementation(async (input) => {
      const result = await read(input);
      if (result.status === 'selected') {
        result.selection.catalogRevision += 1;
        result.evidence.catalogRevision += 1;
      }
      return result;
    });
    await expect(h.service.createRun(h.request)).rejects.toMatchObject({
      response: { code: 'PREPARATION_STALE' },
    });
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
    expect(h.queue.ensureEnqueued).not.toHaveBeenCalled();
  });

  it('rejects a route change before finalize and removes the unfinished Snapshot', async () => {
    const h = await createHarness();
    const current = await h.revisions.readCurrent();
    h.revisions.readCurrent.mockClear();
    h.revisions.readCurrent
      .mockResolvedValueOnce(current)
      .mockResolvedValue({ ...current, catalogRevision: 13 });
    const finalize = vi.spyOn(h.snapshots.v3, 'finalize');
    await expect(h.service.createRun(h.request)).rejects.toMatchObject({
      response: { code: 'PREPARATION_STALE' },
    });
    const runId = h.buildV3.mock.calls[0]![0].runId;
    expect(await h.snapshots.v3.load(runId, true)).toBeUndefined();
    expect(finalize).not.toHaveBeenCalled();
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
    expect(h.queue.ensureEnqueued).not.toHaveBeenCalled();
  });

  it('returns an existing Run without accessing current routing', async () => {
    const h = await createHarness();
    const first = await h.service.createRun(h.request);
    h.revisions.readCurrent.mockReset().mockRejectedValue(new Error('offline'));
    expect(await h.service.createRun(h.request)).toEqual(first);
    expect(h.revisions.readCurrent).not.toHaveBeenCalled();
  });

  it('rejects a changed strategy before finalize', async () => {
    const h = await createHarness();
    const version = { schemaVersion: 2, schema: h.fixture.input.strategy };
    h.prisma.strategyVersion.findUnique
      .mockResolvedValueOnce(version)
      .mockResolvedValueOnce(version)
      .mockResolvedValue({
        ...version,
        schema: { ...version.schema, name: 'changed after preparation' },
      });
    const finalize = vi.spyOn(h.snapshots.v3, 'finalize');
    await expect(h.service.createRun(h.request)).rejects.toMatchObject({
      response: { code: 'PREPARATION_STALE' },
    });
    expect(finalize).not.toHaveBeenCalled();
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
  });

  it('rejects target sequence replacement and revision query failures', async () => {
    const h = await createHarness();
    const stamp = structuredClone(h.request.preparationStamp);
    stamp.targetSequences[0]!.targets[0]!.providerId = 'other';
    await expect(
      h.service.createRun({ ...h.request, preparationStamp: stamp }),
    ).rejects.toMatchObject({ response: { code: 'PREPARATION_STALE' } });
    h.revisions.readCurrent.mockRejectedValue(new Error('offline'));
    await expect(h.service.createRun(h.request)).rejects.toMatchObject({
      response: { code: 'PREPARATION_STALE' },
    });
    expect(h.buildV3).not.toHaveBeenCalled();
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
  });

  it('fails closed when the creation guard is not configured', async () => {
    const h = await createHarness();
    const unconfigured = new BacktestRunService(h.prisma as never);
    await expect(unconfigured.createRun(h.request)).rejects.toMatchObject({
      response: { code: 'PREPARATION_STALE' },
    });
    expect(h.prisma.backtestJob.create).not.toHaveBeenCalled();
  });

  it('creates and executes multiple signal bindings that share one frozen source', async () => {
    const harness = await createHarness({ multipleSignals: true });
    const created = await harness.service.createRun(harness.request);
    assert(created);
    expect(created.status).toBe('queued');
    expect(harness.queue.ensureEnqueued).toHaveBeenCalledOnce();
    await expect(harness.service.runCurrent(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    const result = harness.job()?.result as BacktestResultV3;
    expect(result.actualSources.filter((source) => source.purpose === 'signal')).toHaveLength(1);
    expect(harness.fixture.reader.readV3).toHaveBeenCalledOnce();
  });
  it('creates, queues, claims, executes a real complete Snapshot, and reads the strict persisted result', async () => {
    const harness = await createHarness();

    const created = await harness.service.createRun(harness.request);
    assert(created);
    expect(created).toMatchObject({ mode: 'V3', status: 'queued', input: { contractVersion: 3 } });
    expect(harness.queue.ensureEnqueued).toHaveBeenCalledWith(created.id);
    expect(harness.buildV3).toHaveBeenCalledOnce();
    expect(harness.fixture.reader.readV3).toHaveBeenCalled();

    await harness.service.runCurrent(String(harness.job()?.id));
    const persisted = await harness.prisma.backtestJob.findUnique({ where: { id: created.id } });

    expect(persisted).toMatchObject({
      status: 'succeeded',
      executionAttempt: 1,
      result: {
        schemaVersion: '3',
        runId: created.id,
        snapshotId: harness.job()?.snapshotId,
        contentHash: harness.job()?.snapshotId,
      },
      resultChecksum: expect.any(String),
    });
    const result = persisted?.result as BacktestResultV3;
    const { resultChecksum, ...checksumPayload } = result;
    expect(resultChecksum).toBe(deterministicResultChecksum(checksumPayload));
  });

  it('retries the frozen Snapshot with monotonic attempts and a fresh retry budget', async () => {
    const harness = await createHarness({ failFirstRun: true });
    const created = await harness.service.createRun(harness.request);
    assert(created);
    const manifest = harness.job()?.snapshotManifest;
    const snapshotId = harness.job()?.snapshotId;
    const readsAfterBuild = harness.fixture.reader.readV3.mock.calls.length;

    await harness.service.runCurrent(String(created.id));
    expect(harness.job()).toMatchObject({ status: 'failed', executionAttempt: 1 });

    await harness.service.retryRun(String(created.id));
    expect(harness.job()).toMatchObject({
      status: 'queued',
      executionAttempt: 2,
      input: { retryAttemptBase: 2, snapshotId },
      snapshotId,
      snapshotManifest: manifest,
    });
    expect(harness.queue.ensureEnqueued).toHaveBeenCalledTimes(2);
    expect(harness.buildV3).toHaveBeenCalledOnce();
    expect(harness.fixture.reader.readV3).toHaveBeenCalledTimes(readsAfterBuild);

    await harness.service.runCurrent(String(created.id));
    expect(harness.job()).toMatchObject({ status: 'succeeded', executionAttempt: 3 });
    expect(harness.buildV3).toHaveBeenCalledOnce();
    expect(harness.job()?.snapshotId).toBe(snapshotId);
    expect(harness.job()?.snapshotManifest).toEqual(manifest);
  });

  it('rejects a tampered RunConfig before a frozen retry changes state or queue ownership', async () => {
    const harness = await createHarness({ failFirstRun: true });
    const created = await harness.service.createRun(harness.request);
    assert(created);
    await harness.service.runCurrent(String(created.id));
    const updatesBeforeRetry = harness.prisma.backtestJob.updateMany.mock.calls.length;
    const job = harness.job()!;
    const input = job.input as Record<string, unknown>;
    const inputConfig = input.runConfig as Record<string, unknown>;
    const protocol = inputConfig.executionPriceProtocol as Record<string, unknown>;
    const priceBasis = protocol.priceBasis as Record<string, unknown>;
    job.input = {
      ...input,
      runConfig: {
        ...inputConfig,
        executionPriceProtocol: {
          ...protocol,
          priceBasis: {
            ...priceBasis,
            revision: { origin: 'provider', id: 'tampered-revision' },
          },
        },
      },
    };

    await expect(harness.service.retryRun(String(created.id))).rejects.toMatchObject({
      response: {
        code: 'DATA_UNAVAILABLE',
        message: 'V3 Run 持久化配置与冻结 Snapshot 不一致',
      },
    });

    expect(harness.job()).toMatchObject({ status: 'failed', executionAttempt: 1 });
    expect(harness.prisma.backtestJob.updateMany).toHaveBeenCalledTimes(updatesBeforeRetry);
    expect(harness.queue.ensureEnqueued).toHaveBeenCalledOnce();
    expect(harness.buildV3).toHaveBeenCalledOnce();
  });

  it('rejects an idempotency race whose persisted V3 RunConfig differs', async () => {
    const existingFixture = await completeSnapshotFixture();
    const conflictingRunConfig = {
      ...existingFixture.input.runConfig,
      endDate: '2026-05-22',
    };
    const harness = await createHarness({
      raceExisting: {
        mode: 'V3',
        input: {
          contractVersion: 3,
          schemaVersion: '3',
          runConfig: conflictingRunConfig,
        },
        runConfig: conflictingRunConfig,
      },
    });

    await expect(harness.service.createRun(harness.request)).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_CONFLICT' },
    });
    expect(harness.buildV3).toHaveBeenCalledOnce();
    expect(harness.queue.ensureEnqueued).not.toHaveBeenCalled();
  });

  it('does not let a cancellation commit a late result', async () => {
    const harness = await createHarness({ waitForAbort: true });
    const created = await harness.service.createRun(harness.request);
    assert(created);
    const running = harness.service.runCurrent(String(created.id));
    await vi.waitFor(() => expect(harness.runner.run).toHaveBeenCalledOnce());

    harness.setJob({ ...harness.job()!, cancelRequestedAt: new Date() });
    expect(harness.service.abortActiveRun(String(created.id))).toBe(true);
    expect(harness.observedSignal()?.aborted).toBe(true);

    await expect(running).resolves.toMatchObject({ status: 'cancelled' });
    expect(harness.job()).toMatchObject({
      status: 'cancelled',
      executionAttempt: 1,
      result: null,
      resultChecksum: null,
    });
  });
});
