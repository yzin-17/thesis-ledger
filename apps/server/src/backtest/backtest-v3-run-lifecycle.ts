import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  backtestRunCreateSchemaV3,
  backtestSnapshotManifestV3Schema,
  marketDataBarRouteKeyV3Schema,
  runConfigSchemaV3,
  strategySchema,
  validateStrategyInitialCash,
  executionCombinationIssues,
  type BacktestRunCreateV3,
  type BacktestSnapshotManifestV3,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { BacktestQueueService } from './backtest-queue.service.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import type { BacktestSnapshotV3BuildResult } from './backtest-snapshot-v3-builder.js';
import type { BacktestSnapshotBuilder } from './backtest-run.service.js';
import type { BacktestCreationGuardService } from './backtest-creation-guard.service.js';
import { preparationStale } from './backtest-preparation-fence.js';
import { assertStrategyResearchScopeV3 } from './backtest-research-data-scope-v3.js';

export interface ExistingBacktestRun {
  mode: string;
  input: unknown;
  runConfig: unknown;
  snapshotManifest?: unknown;
}

export class BacktestSnapshotUnavailableError extends Error {
  readonly code = 'DATA_UNAVAILABLE';
}

export const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const persistedRunContract = (
  job: Pick<ExistingBacktestRun, 'mode' | 'input'>,
): 'backtest-trade-run-v1' | 'backtest-nav-run-v1' | undefined => {
  const input = asRecord(job.input);
  if (job.mode !== 'frozen' || input?.contractVersion !== 1) return undefined;
  if (input.schemaVersion === 'backtest-trade-run-v1' && input.inputKind === undefined)
    return input.schemaVersion;
  if (input.schemaVersion === 'backtest-nav-run-v1' && input.inputKind === 'nav')
    return input.schemaVersion;
  return undefined;
};

export const uniqueConstraintViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

const idempotencyConflict = (): never => {
  throw new ConflictException({
    code: 'IDEMPOTENCY_KEY_CONFLICT',
    message: '幂等键已用于不同回测合同或内容',
  });
};

const assertExistingRequestMatches = (
  existing: ExistingBacktestRun,
  runConfig: RunConfigV3,
): void => {
  if (persistedRunContract(existing) !== 'backtest-trade-run-v1') idempotencyConflict();
  const storedRunConfig = runConfigSchemaV3.safeParse(existing.runConfig);
  const inputRunConfig = runConfigSchemaV3.safeParse(asRecord(existing.input)?.runConfig);
  if (
    !storedRunConfig.success ||
    !inputRunConfig.success ||
    hashCanonicalManifest(storedRunConfig.data) !== hashCanonicalManifest(runConfig) ||
    hashCanonicalManifest(inputRunConfig.data) !== hashCanonicalManifest(runConfig)
  ) {
    idempotencyConflict();
  }
};

export const findExistingBacktestRun = async (
  prisma: PrismaService,
  request: Pick<BacktestRunCreateV3, 'strategyVersionId' | 'idempotencyKey'>,
  runConfig: RunConfigV3,
) => {
  const existing = await prisma.backtestJob.findFirst({
    where: {
      strategyVersionId: request.strategyVersionId,
      idempotencyKey: request.idempotencyKey,
    },
  });
  if (!existing) return undefined;
  assertExistingRequestMatches(existing, runConfig);
  return existing;
};

export class BacktestV3RunLifecycle {
  constructor(
    private readonly prisma: PrismaService,
    _snapshotBuilder?: BacktestSnapshotBuilder,
    private readonly queueService?: Pick<BacktestQueueService, 'ensureEnqueued'>,
    private readonly v3RunnerAvailable = false,
    private readonly creationGuard?: Pick<BacktestCreationGuardService, 'check'>,
  ) {}

  async create(input: unknown) {
    const request = backtestRunCreateSchemaV3.parse(input);
    const existing = await findExistingBacktestRun(this.prisma, request, request.runConfig);
    if (existing) return existing;

    const strategyVersion = await this.prisma.strategyVersion.findUnique({
      where: { id: request.strategyVersionId },
    });
    if (!strategyVersion) throw new NotFoundException('策略版本不存在');
    if (strategyVersion.schemaVersion !== 1)
      throw new BadRequestException('回测需要 strategy-definition-v1 策略定义');

    const parsedStrategy = strategySchema.parse(strategyVersion.schema);
    const strategy: BacktestStrategy = {
      ...parsedStrategy,
      entry: parsedStrategy.entry as BacktestStrategy['entry'],
      exit: parsedStrategy.exit as BacktestStrategy['exit'],
      execution: parsedStrategy.execution as BacktestStrategy['execution'],
    };
    const runConfig = runConfigSchemaV3.parse(request.runConfig);
    assertRunInitialCash(strategy, runConfig);
    assertExecutionCombination(strategy, runConfig);
    assertStrategyResearchScopeV3(strategy, runConfig);

    if (!this.creationGuard) preparationStale();
    const checkPreparation = () => this.creationGuard!.check(request, strategy);
    await checkPreparation();
    const runId = randomUUID();
    const data = {
      id: runId,
      strategyVersionId: request.strategyVersionId,
      mode: 'frozen',
      idempotencyKey: request.idempotencyKey,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      periodStart: new Date(`${runConfig.startDate}T00:00:00.000Z`),
      periodEnd: new Date(`${runConfig.endDate}T00:00:00.000Z`),
      dataAsOf: new Date(runConfig.dataAsOf),
      input: {
        contractVersion: 1,
        schemaVersion: 'backtest-trade-run-v1',
        preparationStamp: request.preparationStamp,
        strategyVersionId: request.strategyVersionId,
        materialization: { version: 'backtest-job-input-v1', kind: 'configured',
          strategyVersionHash: hashCanonicalManifest(strategy) },
        runConfig,
      } as Prisma.InputJsonValue,
      runConfig: runConfig as Prisma.InputJsonValue,
      warnings: [],
    };
    try {
      const created = await this.prisma.backtestJob.create({ data });
      return (await this.queueService?.ensureEnqueued(created.id)) ?? created;
    } catch (error) {
      if (uniqueConstraintViolation(error)) {
        const concurrent = await findExistingBacktestRun(this.prisma, request, runConfig);
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  assertRetryAvailable(job: ExistingBacktestRun): void {
    const manifest = backtestSnapshotManifestV3Schema.safeParse(job.snapshotManifest);
    if (!manifest.success || manifest.data.quality.completeness !== 'complete') {
      throw new ConflictException({
        code: 'DATA_UNAVAILABLE',
        message: 'Snapshot V3 依赖闭包不完整，当前 Run 不能 retry',
      });
    }
    if (!this.v3RunnerAvailable) {
      throw new ConflictException({
        code: 'V3_RUNNER_UNAVAILABLE',
        message: 'V3 Runner 未配置，当前 Run 不能 retry',
      });
    }
    if (!this.queueService) {
      throw new ConflictException({
        code: 'QUEUE_UNAVAILABLE',
        message: 'Backtest Queue 未配置，当前 Run 不能 retry',
      });
    }
  }
}

function assertExecutionCombination(strategy: BacktestStrategy, config: RunConfigV3) {
  const issues = executionCombinationIssues({ ...config,
    accountingBasis: config.executionPriceProtocol.accountingBasis,
    dailyOrders: strategy.execution.timing === 'dailyBarOrders',
    model: config.executionModel, matching: config.dailyOrderMatching,
  });
  if (issues.length) throw new BadRequestException({ code: 'RULE_REJECTED',
    message: issues.map((issue) => issue.message).join('；'), diagnostics: issues });
}

function assertRunInitialCash(strategy: BacktestStrategy, runConfig: RunConfigV3) {
  const validation = validateStrategyInitialCash(strategy, runConfig);
  if (!validation.valid) {
    const firstError = validation.errors[0];
    if (!firstError) throw new BadRequestException('RunConfig 校验失败');
    throw new BadRequestException({
      code: firstError.code,
      message: firstError.message,
      path: firstError.path,
    });
  }
}
export function runExecutionRouteKey(strategy: BacktestStrategy, runConfig: RunConfigV3) {
  const instrument = strategy.executionInstrument;
  let assetType: 'STOCK' | 'ETF';
  if (instrument.assetType === 'stock') assetType = 'STOCK';
  else if (instrument.assetType === 'etf') assetType = 'ETF';
  else throw new Error('当前 Snapshot V3 execution 写入切片仅支持股票与 ETF');
  const timeframe = strategy.primaryTimeframe === '1d' ? '1d' : '1m';
  return marketDataBarRouteKeyV3Schema.parse({
    kind: 'bar',
    market: instrument.market,
    assetType,
    capability: timeframe === '1d' ? 'DAILY_BAR' : 'MINUTE_BAR',
    timeframe,
    adjustment: runConfig.executionPriceProtocol.priceBasis.adjustment,
  });
}
type SnapshotBuildIdentity = {
  request: BacktestRunCreateV3;
  strategy: BacktestStrategy;
  runConfig: RunConfigV3;
  runId: string;
  executionRouteKey: ReturnType<typeof marketDataBarRouteKeyV3Schema.parse>;
  expectedSourcePurposes: string[];
};
export function createdSnapshotManifest(
  built: BacktestSnapshotV3BuildResult,
  {
    request,
    strategy,
    runConfig,
    runId,
    executionRouteKey,
    expectedSourcePurposes,
  }: SnapshotBuildIdentity,
) {
  const parsedManifest = backtestSnapshotManifestV3Schema.parse(built.manifest);
  const expectedHash = hashCanonicalManifest(parsedManifest);
  const actualSourcePurposes = parsedManifest.actualSources.map((source) => source.purpose).sort();
  if (
    parsedManifest.runId !== runId ||
    parsedManifest.strategyVersionId !== request.strategyVersionId ||
    parsedManifest.strategyVersionHash !== hashCanonicalManifest(strategy) ||
    parsedManifest.runConfigChecksum !== hashCanonicalManifest(runConfig) ||
    parsedManifest.dateRange.startDate !== runConfig.startDate ||
    parsedManifest.dateRange.endDate !== runConfig.endDate ||
    parsedManifest.dataAsOf !== runConfig.dataAsOf ||
    parsedManifest.priceResearch?.protocolVersion !== runConfig.priceResearch?.protocolVersion ||
    canonicalizeManifest(parsedManifest.executionPriceProtocol) !==
      canonicalizeManifest(runConfig.executionPriceProtocol) ||
    canonicalizeManifest(actualSourcePurposes) !== canonicalizeManifest(expectedSourcePurposes) ||
    !executionSourcesMatchBuild(parsedManifest, strategy, runConfig, executionRouteKey) ||
    parsedManifest.status !== 'finalized' ||
    parsedManifest.contentHash !== expectedHash ||
    built.snapshotRef.contentHash !== parsedManifest.contentHash ||
    built.snapshotRef.snapshotId !== parsedManifest.contentHash ||
    canonicalizeManifest(built.artifactRefs) !== canonicalizeManifest(parsedManifest.artifacts)
  ) {
    throw new Error('Snapshot V3 Builder 返回的 manifest、身份或 contentHash 不一致');
  }
  return { ...parsedManifest, contentHash: expectedHash };
}
function executionSourcesMatchBuild(
  parsedManifest: BacktestSnapshotManifestV3,
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  executionRouteKey: SnapshotBuildIdentity['executionRouteKey'],
) {
  const instrument = strategy.executionInstrument;
  const signalRoutes = additionalSignalPricePlanV3(strategy, runConfig).map((plan) =>
    canonicalizeManifest(plan.routeKey),
  );
  const executionSource = parsedManifest.actualSources.find(
    (source) => source.purpose === 'execution',
  );
  return !(
    parsedManifest.actualSources.some(
      (source) =>
        source.symbol !== instrument.symbol ||
        (canonicalizeManifest(source.routeKey) !== canonicalizeManifest(executionRouteKey) &&
          !(
            source.purpose === 'signal' &&
            signalRoutes.includes(canonicalizeManifest(source.routeKey))
          )),
    ) ||
    !executionSource ||
    executionSource.symbol !== instrument.symbol ||
    canonicalizeManifest(executionSource.routeKey) !== canonicalizeManifest(executionRouteKey)
  );
}

export function snapshotSourcePurposes(strategy: BacktestStrategy, runConfig: RunConfigV3) {
  return [
    'execution',
    ...(runConfig.priceInputBindings?.signals.some(
      (signal) => signal.binding === 'execution-series',
    )
      ? ['signal']
      : []),
    ...(runConfig.priceInputBindings?.benchmark ? ['benchmark'] : []),
    ...additionalSignalPricePlanV3(strategy, runConfig).map(() => 'signal'),
  ].sort();
}
import { additionalSignalPricePlanV3 } from './backtest-signal-price-plan-v3.js';
