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

export const persistedContractVersion = (
  job: Pick<ExistingBacktestRun, 'mode' | 'input'>,
): 3 | undefined => {
  const input = asRecord(job.input);
  if (job.mode === 'V3' && input?.contractVersion === 3 && input.schemaVersion === '3') return 3;
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
  if (persistedContractVersion(existing) !== 3) idempotencyConflict();
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
    private readonly snapshotBuilder?: BacktestSnapshotBuilder,
    private readonly queueService?: Pick<BacktestQueueService, 'ensureEnqueued'>,
    private readonly v3RunnerAvailable = false,
    private readonly creationGuard?: Pick<BacktestCreationGuardService, 'check'>,
  ) {}

  private async persistUnavailable(
    request: BacktestRunCreateV3,
    runId: string,
    message: string,
    causeCode = 'DATA_UNAVAILABLE',
    manifest?: BacktestSnapshotManifestV3,
  ) {
    const { runConfig } = request;
    const data = {
      id: runId,
      strategyVersionId: request.strategyVersionId,
      mode: 'V3',
      idempotencyKey: request.idempotencyKey,
      status: 'failed',
      stage: 'failed',
      progress: 100,
      periodStart: new Date(`${runConfig.startDate}T00:00:00.000Z`),
      periodEnd: new Date(`${runConfig.endDate}T00:00:00.000Z`),
      dataAsOf: new Date(runConfig.dataAsOf),
      input: {
        contractVersion: 3,
        schemaVersion: '3',
        preparationStamp: request.preparationStamp,
        strategyVersionId: request.strategyVersionId,
        runConfig,
        ...(manifest
          ? {
              snapshotId: manifest.contentHash!,
              snapshotVersion: manifest.manifestVersion,
            }
          : {}),
      } as Prisma.InputJsonValue,
      runConfig: runConfig as Prisma.InputJsonValue,
      ...(manifest
        ? {
            snapshotId: manifest.contentHash!,
            snapshotManifest: manifest as unknown as Prisma.InputJsonValue,
          }
        : {}),
      warnings: [...(manifest?.quality.warnings ?? []), message],
      errorCode: 'DATA_UNAVAILABLE',
      errorSummary: message,
      diagnostics: { code: causeCode, message, path: ['snapshot'] },
      finishedAt: new Date(),
    };
    try {
      return await this.prisma.backtestJob.create({ data });
    } catch (error) {
      if (uniqueConstraintViolation(error)) {
        const concurrent = await findExistingBacktestRun(this.prisma, request, runConfig);
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  async create(input: unknown) {
    const request = backtestRunCreateSchemaV3.parse(input);
    const existing = await findExistingBacktestRun(this.prisma, request, request.runConfig);
    if (existing) return existing;

    const strategyVersion = await this.prisma.strategyVersion.findUnique({
      where: { id: request.strategyVersionId },
    });
    if (!strategyVersion) throw new NotFoundException('策略版本不存在');
    if (strategyVersion.schemaVersion !== 2)
      throw new BadRequestException('V3 Run 当前要求 schemaVersion=2 的策略版本');

    const parsedStrategy = strategySchema.parse(strategyVersion.schema);
    const strategy: BacktestStrategy = {
      ...parsedStrategy,
      entry: parsedStrategy.entry as BacktestStrategy['entry'],
      exit: parsedStrategy.exit as BacktestStrategy['exit'],
      execution: parsedStrategy.execution as BacktestStrategy['execution'],
    };
    const runConfig = runConfigSchemaV3.parse(request.runConfig);
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

    if (!this.creationGuard) preparationStale();
    const checkPreparation = () => this.creationGuard!.check(request, strategy);
    await checkPreparation();
    const runId = randomUUID();
    if (!this.snapshotBuilder?.buildV3) {
      return this.persistUnavailable(
        request,
        runId,
        'Snapshot V3 Builder 未配置，Run 未进入执行队列',
      );
    }

    let manifest: BacktestSnapshotManifestV3 & { contentHash: string };
    try {
      const instrument = strategy.executionInstrument;
      let assetType: 'STOCK' | 'ETF';
      if (instrument.assetType === 'stock') assetType = 'STOCK';
      else if (instrument.assetType === 'etf') assetType = 'ETF';
      else throw new Error('当前 Snapshot V3 execution 写入切片仅支持股票与 ETF');
      const timeframe = strategy.primaryTimeframe;
      const executionRouteKey = marketDataBarRouteKeyV3Schema.parse({
        kind: 'bar',
        market: instrument.market,
        assetType,
        capability: timeframe === '1d' ? 'DAILY_BAR' : 'MINUTE_BAR',
        timeframe,
        adjustment: runConfig.executionPriceProtocol.priceBasis.adjustment,
      });
      const expectedSourcePurposes = [
        'execution',
        ...(runConfig.priceInputBindings?.signals.length ? ['signal'] : []),
        ...(runConfig.priceInputBindings?.benchmark ? ['benchmark'] : []),
      ].sort();
      const built: BacktestSnapshotV3BuildResult = await this.snapshotBuilder.buildV3({
        runId,
        strategyVersionId: request.strategyVersionId,
        strategyVersionHash: hashCanonicalManifest(strategy),
        strategy,
        runConfig,
        executionRouteKey,
        preparationStamp: request.preparationStamp,
        beforeFinalize: checkPreparation,
      });
      const parsedManifest = backtestSnapshotManifestV3Schema.parse(built.manifest);
      const expectedHash = hashCanonicalManifest(parsedManifest);
      const executionSource = parsedManifest.actualSources.find(
        (source) => source.purpose === 'execution',
      );
      const actualSourcePurposes = parsedManifest.actualSources
        .map((source) => source.purpose)
        .sort();
      if (
        parsedManifest.runId !== runId ||
        parsedManifest.strategyVersionId !== request.strategyVersionId ||
        parsedManifest.strategyVersionHash !== hashCanonicalManifest(strategy) ||
        parsedManifest.runConfigChecksum !== hashCanonicalManifest(runConfig) ||
        parsedManifest.dateRange.startDate !== runConfig.startDate ||
        parsedManifest.dateRange.endDate !== runConfig.endDate ||
        parsedManifest.dataAsOf !== runConfig.dataAsOf ||
        canonicalizeManifest(parsedManifest.executionPriceProtocol) !==
          canonicalizeManifest(runConfig.executionPriceProtocol) ||
        canonicalizeManifest(actualSourcePurposes) !==
          canonicalizeManifest(expectedSourcePurposes) ||
        parsedManifest.actualSources.some(
          (source) =>
            source.symbol !== instrument.symbol ||
            canonicalizeManifest(source.routeKey) !== canonicalizeManifest(executionRouteKey),
        ) ||
        !executionSource ||
        executionSource.symbol !== instrument.symbol ||
        canonicalizeManifest(executionSource.routeKey) !==
          canonicalizeManifest(executionRouteKey) ||
        parsedManifest.status !== 'finalized' ||
        parsedManifest.contentHash !== expectedHash ||
        built.snapshotRef.contentHash !== parsedManifest.contentHash ||
        built.snapshotRef.snapshotId !== parsedManifest.contentHash ||
        canonicalizeManifest(built.artifactRefs) !== canonicalizeManifest(parsedManifest.artifacts)
      ) {
        throw new Error('Snapshot V3 Builder 返回的 manifest、身份或 contentHash 不一致');
      }
      manifest = { ...parsedManifest, contentHash: expectedHash };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      return this.persistUnavailable(
        request,
        runId,
        error instanceof Error ? error.message : 'Snapshot V3 Builder 不可用',
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : undefined,
      );
    }

    await checkPreparation();
    if (manifest.quality.completeness !== 'complete') {
      return this.persistUnavailable(
        request,
        runId,
        'Snapshot V3 依赖闭包不完整，Run 未进入执行队列',
        'SNAPSHOT_DEPENDENCIES_INCOMPLETE',
        manifest,
      );
    }
    if (!this.v3RunnerAvailable) {
      return this.persistUnavailable(
        request,
        runId,
        'V3 Runner 未配置，Run 未进入执行队列',
        'V3_RUNNER_UNAVAILABLE',
        manifest,
      );
    }
    if (!this.queueService) {
      return this.persistUnavailable(
        request,
        runId,
        'Backtest Queue 未配置，Run 未进入执行队列',
        'QUEUE_UNAVAILABLE',
        manifest,
      );
    }

    const data = {
      id: runId,
      strategyVersionId: request.strategyVersionId,
      mode: 'V3',
      idempotencyKey: request.idempotencyKey,
      status: 'queued',
      stage: 'snapshot-finalized',
      periodStart: new Date(`${runConfig.startDate}T00:00:00.000Z`),
      periodEnd: new Date(`${runConfig.endDate}T00:00:00.000Z`),
      dataAsOf: new Date(runConfig.dataAsOf),
      input: {
        contractVersion: 3,
        schemaVersion: '3',
        preparationStamp: request.preparationStamp,
        strategyVersionId: request.strategyVersionId,
        snapshotId: manifest.contentHash,
        snapshotVersion: manifest.manifestVersion,
        runConfig,
      } as Prisma.InputJsonValue,
      runConfig: runConfig as Prisma.InputJsonValue,
      snapshotId: manifest.contentHash,
      snapshotManifest: manifest as unknown as Prisma.InputJsonValue,
      warnings: manifest.quality.warnings,
    };
    try {
      const created = await this.prisma.backtestJob.create({ data });
      return (await this.queueService.ensureEnqueued(created.id)) ?? created;
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
