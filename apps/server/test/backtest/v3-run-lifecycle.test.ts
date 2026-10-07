import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { preparationStampFor, preparedRevisionReader } from './v3-preparation-fixtures.js';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  backtestSnapshotManifestV3Schema,
  runConfigSchemaV3,
  strategySchema,
  type BacktestSnapshotManifestV3,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

const strategyVersionId = '11111111-1111-4111-8111-111111111111';

const strategy = strategySchema.parse({
  schemaVersion: '2',
  name: 'V3 lifecycle',
  signalSources: [
    {
      id: 'execution',
      asset: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
      timeframe: '1d',
      series: ['close'],
    },
  ],
  executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
  primaryTimeframe: '1d',
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'constant', value: '1' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedQuantity', quantity: '1' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0', slippageRate: '0' },
}) as BacktestStrategy;

const runConfig = runConfigSchemaV3.parse({
  schemaVersion: '3',
  startDate: '2026-05-18',
  endDate: '2026-05-20',
  dataAsOf: '2026-08-10T00:00:00.000Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '1000000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
  executionPriceProtocol: {
    protocolVersion: 'execution-price-v1',
    priceBasis: {
      adjustment: 'none',
      method: 'provider-native',
      methodVersion: 'hithink-etf-raw-provider-defined-v1',
      basisScope: 'provider-defined',
      anchor: null,
      revision: { origin: 'provider', id: 'hithink-revision-1' },
      observedAt: '2026-08-10T00:00:00.000Z',
      quantityBasis: 'actual-units',
      volumeBasis: 'original',
      dividendMeaning: 'explicit-cash',
      dividendEvidenceRef: null,
      conversionAvailable: false,
      conversionEvidenceRef: null,
      derivation: null,
    },
    accountingBasis: 'raw-events',
    history: { basis: 'fixed-provider-snapshot' },
  },
});

const fixture = async <T>(name: string): Promise<T> =>
  JSON.parse(
    await readFile(
      new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url),
      'utf8',
    ),
  ) as T;

const buildResult = async (
  runId: string,
  buildInput: {
    strategyVersionId: string;
    strategy: BacktestStrategy;
    runConfig: RunConfigV3;
  },
  completeness: 'complete' | 'partial' = 'partial',
) => {
  const manifest = await fixture<BacktestSnapshotManifestV3>('backtest-snapshot-v3.manifest.json');
  manifest.runId = runId;
  manifest.strategyVersionId = buildInput.strategyVersionId;
  manifest.strategyVersionHash = hashCanonicalManifest(buildInput.strategy);
  manifest.dataAsOf = buildInput.runConfig.dataAsOf;
  manifest.runConfigChecksum = hashCanonicalManifest(buildInput.runConfig);
  manifest.executionPriceProtocol = buildInput.runConfig.executionPriceProtocol;
  manifest.actualSources[0]!.symbol = buildInput.strategy.executionInstrument.symbol;
  manifest.actualSources[0]!.routeKey = {
    kind: 'bar',
    market: 'CN',
    assetType: 'ETF',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: buildInput.runConfig.executionPriceProtocol.priceBasis.adjustment,
  };
  manifest.quality = {
    completeness,
    warnings: completeness === 'partial' ? ['策略依赖窗口尚未冻结'] : [],
  };
  manifest.dateRange = {
    startDate: buildInput.runConfig.startDate,
    endDate: buildInput.runConfig.endDate,
    warmupStartDate: buildInput.runConfig.startDate,
  };
  manifest.warmup.startDate = buildInput.runConfig.startDate;
  manifest.artifacts = manifest.artifacts.map((artifact) => ({
    ...artifact,
    key: artifact.key.replace('run-v3-159516', runId),
  }));
  manifest.contentHash = hashCanonicalManifest(manifest);
  const parsed = backtestSnapshotManifestV3Schema.parse(manifest);
  return {
    manifest: parsed,
    snapshotRef: { snapshotId: parsed.contentHash!, contentHash: parsed.contentHash! },
    artifactRefs: parsed.artifacts,
  };
};

const createTestRunService = (...args: ConstructorParameters<typeof BacktestRunService>) =>
  new BacktestRunService(
    args[0],
    args[1],
    args[2],
    args[3],
    args[4],
    new BacktestCreationGuardService(args[0], preparedRevisionReader() as never),
  );

const request = (idempotencyKey = 'v3-lifecycle-once') => ({
  contractVersion: 3 as const,
  preparationStamp: preparationStampFor(strategy, runConfig, strategyVersionId),
  strategyVersionId,
  runConfig,
  idempotencyKey,
});

const prismaHarness = (existing: unknown = null) => {
  const findFirst = vi.fn(async () => existing);
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
  const findUnique = vi.fn(async () => existing);
  const prisma = {
    strategyVersion: {
      findUnique: vi.fn(async () => ({ schemaVersion: 2, schema: strategy })),
    },
    backtestJob: { findFirst, findUnique, create, updateMany: vi.fn() },
  };
  return { prisma, findFirst, findUnique, create };
};

describe('V3 Run lifecycle boundary', () => {
  it('在冻结或写库前拒绝执行币种现金不足的现行配置', async () => {
    const state = prismaHarness();
    const builder = { buildV3: vi.fn() };
    const service = createTestRunService(state.prisma as never, undefined, undefined, builder);
    const input = {
      ...request(),
      runConfig: runConfigSchemaV3.parse({ ...runConfig, initialCash: { HKD: '100' } }),
    };

    await expect(service.createRun(input)).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_CASH' },
    });
    expect(builder.buildV3).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });

  it('persists the V3 contract and partial manifest as failed without enqueueing', async () => {
    const state = prismaHarness();
    const builder = {
      build: vi.fn(),
      buildV3: vi.fn(async (input) => buildResult(input.runId, input)),
    };
    const queue = { ensureEnqueued: vi.fn() };
    const service = createTestRunService(state.prisma as never, queue as never, undefined, builder);

    const created = await service.createRun(request());

    expect(created).toMatchObject({
      mode: 'V3',
      status: 'failed',
      errorCode: 'DATA_UNAVAILABLE',
      diagnostics: { code: 'SNAPSHOT_DEPENDENCIES_INCOMPLETE' },
      input: {
        contractVersion: 3,
        schemaVersion: '3',
        runConfig,
        snapshotVersion: 'snapshot-manifest-v3',
      },
      runConfig,
      snapshotManifest: {
        manifestVersion: 'snapshot-manifest-v3',
        quality: { completeness: 'partial' },
      },
    });
    expect(builder.buildV3).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: expect.any(String),
        strategyVersionId,
        executionRouteKey: {
          kind: 'bar',
          market: 'CN',
          assetType: 'ETF',
          capability: 'DAILY_BAR',
          timeframe: '1d',
          adjustment: 'none',
        },
      }),
    );
    expect(state.findFirst).toHaveBeenCalledWith({
      where: { strategyVersionId, idempotencyKey: request().idempotencyKey },
    });
    expect(queue.ensureEnqueued).not.toHaveBeenCalled();

    const retryService = createTestRunService(
      { backtestJob: { findUnique: vi.fn(async () => created) } } as never,
      queue as never,
    );
    await expect(
      retryService.retryRun(String((created as { id: string }).id)),
    ).rejects.toMatchObject({
      response: {
        code: 'DATA_UNAVAILABLE',
        message: 'Snapshot V3 依赖闭包不完整，当前 Run 不能 retry',
      },
    });
    expect(queue.ensureEnqueued).not.toHaveBeenCalled();
  });

  it('queues only a finalized complete V3 Snapshot when the runner is configured', async () => {
    const state = prismaHarness();
    const builder = {
      build: vi.fn(),
      buildV3: vi.fn(async (input) => buildResult(input.runId, input, 'complete')),
    };
    const queue = { ensureEnqueued: vi.fn(async () => undefined) };
    const runner = { id: 'runner-v3', run: vi.fn() };
    const service = createTestRunService(
      state.prisma as never,
      queue as never,
      undefined,
      builder,
      runner as never,
    );

    const created = await service.createRun(request());

    expect(created).toMatchObject({
      mode: 'V3',
      status: 'queued',
      input: {
        contractVersion: 3,
        schemaVersion: '3',
        runConfig,
        snapshotVersion: 'snapshot-manifest-v3',
      },
      runConfig,
      snapshotManifest: { quality: { completeness: 'complete' } },
    });
    expect(state.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'queued', snapshotManifest: expect.anything() }),
    });
    expect(queue.ensureEnqueued).toHaveBeenCalledWith(expect.any(String));
  });

  it.each(['startDate', 'endDate'] as const)(
    'rejects a self-consistent Snapshot whose %s differs from the requested interval',
    async (field) => {
      const state = prismaHarness();
      const builder = {
        build: vi.fn(),
        buildV3: vi.fn(async (input) => {
          const built = await buildResult(input.runId, input, 'complete');
          built.manifest.dateRange[field] = field === 'startDate' ? '2026-05-19' : '2026-05-21';
          const contentHash = hashCanonicalManifest(built.manifest);
          built.manifest.contentHash = contentHash;
          built.snapshotRef = { snapshotId: contentHash, contentHash };
          return built;
        }),
      };
      const queue = { ensureEnqueued: vi.fn() };
      const service = createTestRunService(
        state.prisma as never,
        queue as never,
        undefined,
        builder,
        { id: 'runner-v3', run: vi.fn() },
      );

      await expect(service.createRun(request())).resolves.toMatchObject({
        status: 'failed',
        errorCode: 'DATA_UNAVAILABLE',
        errorSummary: 'Snapshot V3 Builder 返回的 manifest、身份或 contentHash 不一致',
      });
      expect(queue.ensureEnqueued).not.toHaveBeenCalled();
    },
  );

  it('keeps a complete V3 Snapshot failed when the runner is missing', async () => {
    const state = prismaHarness();
    const builder = {
      build: vi.fn(),
      buildV3: vi.fn(async (input) => buildResult(input.runId, input, 'complete')),
    };
    const queue = { ensureEnqueued: vi.fn() };
    const service = createTestRunService(state.prisma as never, queue as never, undefined, builder);

    const created = await service.createRun(request());

    expect(created).toMatchObject({
      status: 'failed',
      diagnostics: { code: 'V3_RUNNER_UNAVAILABLE' },
      snapshotManifest: { quality: { completeness: 'complete' } },
    });
    expect(queue.ensureEnqueued).not.toHaveBeenCalled();
  });

  it('keeps a complete V3 Snapshot failed when the queue is missing', async () => {
    const state = prismaHarness();
    const builder = {
      build: vi.fn(),
      buildV3: vi.fn(async (input) => buildResult(input.runId, input, 'complete')),
    };
    const runner = { id: 'runner-v3', run: vi.fn() };
    const service = createTestRunService(
      state.prisma as never,
      undefined,
      undefined,
      builder,
      runner as never,
    );

    const created = await service.createRun(request());

    expect(created).toMatchObject({
      status: 'failed',
      diagnostics: { code: 'QUEUE_UNAVAILABLE' },
      snapshotManifest: { quality: { completeness: 'complete' } },
    });
  });

  it('returns an idempotent V3 job only for the same contract and RunConfig', async () => {
    const existing = {
      mode: 'V3',
      status: 'failed',
      input: { contractVersion: 3, schemaVersion: '3', runConfig },
      runConfig,
    };
    const state = prismaHarness(existing);
    const builder = { build: vi.fn(), buildV3: vi.fn() };
    const service = createTestRunService(state.prisma as never, undefined, undefined, builder);

    await expect(service.createRun(request())).resolves.toBe(existing);
    expect(builder.buildV3).not.toHaveBeenCalled();

    const changedConfig = runConfigSchemaV3.parse({ ...runConfig, endDate: '2026-05-21' });
    await expect(
      service.createRun({ ...request(), runConfig: changedConfig }),
    ).rejects.toMatchObject({
      response: {
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: '幂等键已用于不同回测合同或内容',
      },
    });

    const v2Config = {
      startDate: runConfig.startDate,
      endDate: runConfig.endDate,
      dataAsOf: runConfig.dataAsOf,
      baseCurrency: runConfig.baseCurrency,
      initialCash: runConfig.initialCash,
      valuationPolicy: runConfig.valuationPolicy,
    };
    await expect(
      service.createRun({
        strategyVersionId,
        runConfig: v2Config,
        idempotencyKey: request().idempotencyKey,
      }),
    ).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });

    const alteredInputState = prismaHarness({
      ...existing,
      input: {
        ...existing.input,
        runConfig: runConfigSchemaV3.parse({ ...runConfig, endDate: '2026-05-21' }),
      },
    });
    const alteredInputService = createTestRunService(
      alteredInputState.prisma as never,
      undefined,
      undefined,
      builder,
    );
    await expect(alteredInputService.createRun(request())).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_CONFLICT' },
    });
  });

  it('fails a queued partial V3 item under the existing attempt CAS before calling the V2 runner', async () => {
    const runId = '22222222-2222-4222-8222-222222222222';
    const built = await buildResult(runId, { strategyVersionId, strategy, runConfig }, 'partial');
    let job: Record<string, unknown> = {
      id: runId,
      mode: 'V3',
      status: 'queued',
      periodStart: new Date(`${runConfig.startDate}T00:00:00.000Z`),
      periodEnd: new Date(`${runConfig.endDate}T00:00:00.000Z`),
      dataAsOf: new Date(runConfig.dataAsOf),
      stage: 'queued',
      executionAttempt: 0,
      input: { contractVersion: 3, schemaVersion: '3', runConfig },
      runConfig,
      snapshotId: built.snapshotRef.snapshotId,
      snapshotManifest: built.manifest,
      cancelRequestedAt: null,
      startedAt: null,
    };
    const updateMany = vi.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const statuses = where.status as { in?: string[] } | string | undefined;
        if (typeof statuses === 'string' && job.status !== statuses) return { count: 0 };
        if (
          typeof statuses === 'object' &&
          statuses?.in &&
          !statuses.in.includes(String(job.status))
        )
          return { count: 0 };
        const attempts = where.executionAttempt as { lt?: number } | number | undefined;
        if (typeof attempts === 'number' && job.executionAttempt !== attempts) return { count: 0 };
        if (
          typeof attempts === 'object' &&
          attempts?.lt !== undefined &&
          Number(job.executionAttempt) >= attempts.lt
        )
          return { count: 0 };
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
    const runner = { id: 'v2-runner', run: vi.fn() };
    const service = createTestRunService(prisma as never);

    await expect(service.runCurrent(runId, { attempt: 1, maxAttempts: 3 })).rejects.toThrow(
      '现行 Runner 未配置，Run 未进入执行',
    );

    expect(runner.run).not.toHaveBeenCalled();
    expect(job).toMatchObject({
      status: 'failed',
      stage: 'failed',
      errorCode: 'DATA_UNAVAILABLE',
      diagnostics: { code: 'DATA_UNAVAILABLE' },
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: runId,
          mode: 'V3',
          status: 'running',
          executionAttempt: 1,
        }),
      }),
    );
  });
});
