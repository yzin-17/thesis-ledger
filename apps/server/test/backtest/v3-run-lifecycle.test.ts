import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { preparationStampFor, preparedRevisionReader } from './v3-preparation-fixtures.js';
import { exchangeExecutionModel } from './v2-execution.fixtures.js';
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
import { createdSnapshotManifest, runExecutionRouteKey, snapshotSourcePurposes } from '../../src/backtest/backtest-v3-run-lifecycle.js';

const strategyVersionId = '11111111-1111-4111-8111-111111111111';

const strategy = strategySchema.parse({
  schemaVersion: 'strategy-definition-v1',
  name: 'V3 lifecycle',
  signalSources: [
    {
      priceCoordinate: 'run',
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

const modelTemplate = exchangeExecutionModel();
const modelRange = { start: '2026-05-18', end: '2026-05-20' };
const lifecycleModel = {
  ...modelTemplate,
  scope: { ...modelTemplate.scope, symbol: '159516.SZ', instrumentType: 'ETF' as const, range: modelRange },
  segments: modelTemplate.segments.map(segment => ({
    ...segment, range: modelRange,
    source: { ...segment.source, configuredAt: '2026-05-17T00:00:00.000Z' },
  })),
};
const runConfig = runConfigSchemaV3.parse({
  schemaVersion: 'backtest-trade-config-v1',
  startDate: '2026-05-18',
  endDate: '2026-05-20',
  dataAsOf: '2026-08-10T00:00:00.000Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '1000000' },
  executionModel: lifecycleModel,
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
  contractVersion: 1 as const,
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
      findUnique: vi.fn(async () => ({ schemaVersion: 1, schema: strategy })),
    },
    backtestJob: { findFirst, findUnique, create, updateMany: vi.fn() },
  };
  return { prisma, findFirst, findUnique, create };
};

describe('V3 Run lifecycle boundary', () => {
  it.each([true, false])('正式创建先持久化意图，不构建快照；队列装配=%s', async (withQueue) => {
    const state = prismaHarness();
    const builder = { buildV3: vi.fn() };
    const queue = { ensureEnqueued: vi.fn() };
    const service = createTestRunService(state.prisma as never, withQueue ? queue as never : undefined, undefined, builder);
    const created = await service.createRun(request());
    expect(created).toMatchObject({ status: 'queued', stage: 'queued', progress: 0,
      input: { materialization: { version: 'backtest-job-input-v1', kind: 'configured',
        strategyVersionHash: hashCanonicalManifest(strategy) }, runConfig } });
    expect(created.snapshotId).toBeUndefined();
    expect(builder.buildV3).not.toHaveBeenCalled();
    expect(queue.ensureEnqueued).toHaveBeenCalledTimes(withQueue ? 1 : 0);
    if (withQueue) expect(state.create.mock.invocationCallOrder[0]).toBeLessThan(queue.ensureEnqueued.mock.invocationCallOrder[0]!);
  });

  it.each(['startDate', 'endDate'] as const)('Worker仍拒绝自洽但%s偏离请求的快照', async (field) => {
    const built = await buildResult('test-run', { strategyVersionId, strategy, runConfig }, 'complete');
    built.manifest.dateRange[field] = field === 'startDate' ? '2026-05-19' : '2026-05-21';
    built.manifest.contentHash = hashCanonicalManifest(built.manifest);
    built.snapshotRef = { snapshotId: built.manifest.contentHash, contentHash: built.manifest.contentHash };
    expect(() => createdSnapshotManifest(built, { request: request(), strategy, runConfig, runId: 'test-run',
      executionRouteKey: runExecutionRouteKey(strategy, runConfig), expectedSourcePurposes: snapshotSourcePurposes(strategy, runConfig) }))
      .toThrow('manifest、身份或 contentHash 不一致');
  });

  it('缺少当前创建合同要求的执行模型时仍在冻结前拒绝', async () => {
    const state = prismaHarness();
    const builder = { buildV3: vi.fn() };
    const service = createTestRunService(state.prisma as never, undefined, undefined, builder);
    const input = request();
    const withoutModel = { ...input.runConfig }; delete withoutModel.executionModel;
    const stamp = preparationStampFor(strategy, withoutModel, strategyVersionId);
    await expect(service.createRun({ ...input, runConfig: withoutModel, preparationStamp: stamp }))
      .rejects.toMatchObject({ response: { code: 'PREPARATION_STALE' } });
    expect(builder.buildV3).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });
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

});

describe("幂等身份与 attempt CAS", () => {
  it('returns an idempotent V3 job only for the same contract and RunConfig', async () => {
    const existing = {
      mode: 'frozen',
      status: 'failed',
      input: { contractVersion: 1, schemaVersion: 'backtest-trade-run-v1', runConfig },
      runConfig,
    };
    const state = prismaHarness(existing);
    const builder = { build: vi.fn(), buildV3: vi.fn() };
    const service = createTestRunService(state.prisma as never, undefined, undefined, builder);

    await expect(service.createRun(request())).resolves.toBe(existing);
    expect(builder.buildV3).not.toHaveBeenCalled();

    const changedConfig = runConfigSchemaV3.parse({ ...runConfig, endDate: '2026-05-19' });
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
        runConfig: runConfigSchemaV3.parse({ ...runConfig, endDate: '2026-05-19' }),
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

});
