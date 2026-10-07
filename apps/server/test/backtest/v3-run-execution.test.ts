import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module, type Provider } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import type { BacktestResultV3 } from '@thesis-ledger/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BacktestModule } from '../../src/backtest/backtest.module.js';
import { BacktestProcessorModule } from '../../src/backtest/backtest-processor.module.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { hashCanonicalManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import {
  BACKTEST_V3_RUNNER,
  LocalSnapshotV3Runner,
  type BacktestV3Runner,
} from '../../src/backtest/backtest-v3-runner.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const temporaryDirectories: string[] = [];
const contexts: INestApplicationContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const createRunHarness = async (mutateResult?: (result: BacktestResultV3) => unknown) => {
  const root = await mkdtemp(join(tmpdir(), 's09-r3c1-run-'));
  temporaryDirectories.push(root);
  const fixture = await completeSnapshotFixture();
  fixture.input.strategyVersionHash = hashCanonicalManifest(fixture.input.strategy);
  const snapshots = new LocalSnapshotStore(root);
  const built = await new DsaSnapshotBuilder(
    fixture.dsa as unknown as DsaClient,
    snapshots,
    fixture.reader,
  ).buildV3(fixture.input);
  const localRunner = new LocalSnapshotV3Runner(snapshots);
  const runner: BacktestV3Runner = mutateResult
    ? {
        id: localRunner.id,
        run: async (input, signal) =>
          mutateResult(await localRunner.run(input, signal)) as BacktestResultV3,
      }
    : localRunner;

  let job: Record<string, unknown> = {
    id: fixture.input.runId,
    mode: 'V3',
    strategyVersionId: fixture.input.strategyVersionId,
    periodStart: new Date(`${fixture.input.runConfig.startDate}T00:00:00.000Z`),
    periodEnd: new Date(`${fixture.input.runConfig.endDate}T00:00:00.000Z`),
    dataAsOf: new Date(fixture.input.runConfig.dataAsOf),
    status: 'queued',
    stage: 'queued',
    executionAttempt: 0,
    input: {
      contractVersion: 3,
      schemaVersion: '3',
      strategyVersionId: fixture.input.strategyVersionId,
      runConfig: fixture.input.runConfig,
      snapshotId: built.snapshotRef.snapshotId,
      snapshotVersion: built.manifest.manifestVersion,
    },
    runConfig: fixture.input.runConfig,
    snapshotId: built.snapshotRef.snapshotId,
    snapshotManifest: built.manifest,
    cancelRequestedAt: null,
    startedAt: null,
    finishedAt: null,
  };
  const updateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      for (const [key, expected] of Object.entries(where)) {
        const actual = job[key];
        if (expected && typeof expected === 'object') {
          const condition = expected as Record<string, unknown>;
          if ('lt' in condition && !(typeof actual === 'number' && actual < Number(condition.lt))) {
            return { count: 0 };
          }
          if ('in' in condition && !(condition.in as unknown[]).includes(actual)) {
            return { count: 0 };
          }
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
    backtestJob: {
      findUnique: vi.fn(async () => job),
      updateMany,
    },
  };
  const service = new BacktestRunService(prisma as never, undefined, snapshots, undefined, runner);
  return { built, job: () => job, prisma, runner, service, snapshots };
};

describe('V3 Run versioned execution', () => {
  it('比较指纹通过 V3 离线完整性校验并保持相同窗口稳定', async () => {
    const harness = await createRunHarness();
    const range = {
      start: harness.built.manifest.dateRange.startDate,
      end: harness.built.manifest.dateRange.endDate,
    };
    const first = await harness.service.comparableDataFingerprint(
      harness.built.manifest.runId,
      range,
    );
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await harness.service.comparableDataFingerprint(harness.built.manifest.runId, range),
    ).toBe(first);
    harness.job().snapshotId = 'invalid';
    await expect(
      harness.service.comparableDataFingerprint(harness.built.manifest.runId, range),
    ).rejects.toThrow('持久化配置');
  });
  it('replays a real complete Builder Snapshot and persists the strict LocalSnapshotV3Runner result through the attempt CAS', async () => {
    const harness = await createRunHarness();

    await harness.service.runCurrent(harness.built.manifest.runId);

    expect(harness.job()).toMatchObject({
      status: 'succeeded',
      stage: 'succeeded',
      executionAttempt: 1,
      result: {
        schemaVersion: '3',
        snapshotVersion: 'snapshot-manifest-v3',
        runId: harness.built.manifest.runId,
        snapshotId: harness.built.manifest.contentHash,
        contentHash: harness.built.manifest.contentHash,
        actualSources: harness.built.manifest.actualSources,
        comparableDataFingerprint: harness.built.manifest.comparableDataFingerprint,
      },
      resultChecksum: expect.any(String),
    });
    const persistedResult = (harness.job().result as BacktestResultV3 | undefined)!;
    const { resultChecksum, ...checksumPayload } = persistedResult;
    expect(resultChecksum).toBe(deterministicResultChecksum(checksumPayload));
  });

  it('rejects a well-formed result whose frozen run identity is wrong', async () => {
    const harness = await createRunHarness((result) => {
      const changed = { ...result, strategyVersionId: 'other-strategy' };
      const payload = Object.fromEntries(
        Object.entries(changed).filter(([key]) => key !== 'resultChecksum'),
      );
      return { ...changed, resultChecksum: deterministicResultChecksum(payload) };
    });

    await harness.service.runCurrent(harness.built.manifest.runId);

    expect(harness.job()).toMatchObject({ status: 'failed' });
    expect(harness.job()).not.toHaveProperty('result');
    expect(harness.job()).toMatchObject({ errorCode: 'RULE_REJECTED' });
  });

  it('rejects a forged canonical result checksum', async () => {
    const harness = await createRunHarness((result) => ({
      ...result,
      resultChecksum: '0000000000000000',
    }));

    await harness.service.runCurrent(harness.built.manifest.runId);

    expect(harness.job()).toMatchObject({ status: 'failed', errorCode: 'RULE_REJECTED' });
    expect(harness.job()).not.toHaveProperty('result');
  });

  it.each([
    'job.runConfig',
    'input.runConfig',
    'manifest checksum',
    'manifest dates',
    'manifest dataAsOf',
    'manifest protocol',
    'job dataAsOf',
  ])('rejects a tampered frozen Job configuration field: %s', async (field) => {
    const harness = await createRunHarness();
    const job = harness.job();
    const changedConfig = (value: unknown) => ({
      ...(value as Record<string, unknown>),
      endDate: '2026-05-21',
    });
    const manifest = job.snapshotManifest as Record<string, unknown>;
    switch (field) {
      case 'job.runConfig':
        job.runConfig = changedConfig(job.runConfig);
        break;
      case 'input.runConfig':
        job.input = {
          ...(job.input as Record<string, unknown>),
          runConfig: changedConfig((job.input as Record<string, unknown>).runConfig),
        };
        break;
      case 'manifest checksum':
        job.snapshotManifest = { ...manifest, runConfigChecksum: 'tampered-checksum' };
        break;
      case 'manifest dates':
        job.snapshotManifest = {
          ...manifest,
          dateRange: {
            ...(manifest.dateRange as Record<string, unknown>),
            startDate: '2026-05-17',
          },
        };
        break;
      case 'manifest dataAsOf':
        job.snapshotManifest = { ...manifest, dataAsOf: '2026-08-11T00:00:00.000Z' };
        break;
      case 'manifest protocol': {
        const protocol = manifest.executionPriceProtocol as Record<string, unknown>;
        const priceBasis = protocol.priceBasis as Record<string, unknown>;
        job.snapshotManifest = {
          ...manifest,
          executionPriceProtocol: {
            ...protocol,
            priceBasis: {
              ...priceBasis,
              revision: { origin: 'provider', id: 'tampered-revision' },
            },
          },
        };
        break;
      }
      case 'job dataAsOf':
        job.dataAsOf = new Date('2026-08-11T00:00:00.000Z');
        break;
      default:
        throw new Error(`Unexpected field: ${field}`);
    }
    const run = vi.spyOn(harness.runner, 'run');

    await harness.service.runCurrent(harness.built.manifest.runId);

    expect(run).not.toHaveBeenCalled();
    expect(harness.job()).toMatchObject({ status: 'failed', errorCode: 'DATA_UNAVAILABLE' });
  });

  it('rejects a result missing required V3 schema fields', async () => {
    const harness = await createRunHarness((result) => {
      const incomplete = { ...result } as Record<string, unknown>;
      delete incomplete.actualSources;
      return incomplete;
    });

    await harness.service.runCurrent(harness.built.manifest.runId);

    expect(harness.job()).toMatchObject({ status: 'failed', errorCode: 'RULE_REJECTED' });
    expect(harness.job()).not.toHaveProperty('result');
  });

  it('fails closed when the persisted contract version is unknown', async () => {
    const harness = await createRunHarness();
    harness.job().input = { contractVersion: 4, schemaVersion: '4' };
    const run = vi.spyOn(harness.runner, 'run');

    await expect(harness.service.runCurrent(harness.built.manifest.runId)).rejects.toThrow(
      '旧 Run 持久化合同拒绝执行',
    );

    expect(run).not.toHaveBeenCalled();
    expect(harness.job()).toMatchObject({ status: 'queued' });
    expect(harness.job()).not.toHaveProperty('result');
  });

  it.each([
    ['API module', BacktestModule],
    ['Worker module', BacktestProcessorModule],
  ])(
    'resolves V2 and V3 runners in the isolated %s provider graph',
    async (_label, sourceModule) => {
      const root = await mkdtemp(join(tmpdir(), 's09-r3c1-module-'));
      temporaryDirectories.push(root);
      const declared = Reflect.getMetadata('providers', sourceModule) as Provider[];
      const runnerProviders = declared.filter(
        (provider) =>
          provider !== null &&
          typeof provider === 'object' &&
          'provide' in provider &&
          provider.provide === BACKTEST_V3_RUNNER,
      );
      expect(runnerProviders).toHaveLength(1);
      class IsolatedBacktestModule {}
      Module({
        providers: [
          { provide: PrismaService, useValue: {} },
          { provide: LocalSnapshotStore, useFactory: () => new LocalSnapshotStore(root) },
          BacktestRunService,
          ...runnerProviders,
        ],
      })(IsolatedBacktestModule);
      const context = await NestFactory.createApplicationContext(IsolatedBacktestModule, {
        logger: false,
        abortOnError: false,
      });
      contexts.push(context);

      expect(context.get(BACKTEST_V3_RUNNER)).toBeInstanceOf(LocalSnapshotV3Runner);
    },
  );
});
