import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  backtestRunCreateSchemaV2,
  backtestResultSchemaV2,
  runConfigSchemaV2,
  strategySchemaV2,
  validateStrategyRunConfig,
  type BacktestRunCreateV2,
  type RunConfig,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { BacktestQueueService } from './backtest-queue.service.js';
import {
  hashCanonicalManifest,
  LocalSnapshotStore,
  type SnapshotManifest,
} from './backtest-snapshot.js';
import type { ArtifactRef } from './backtest-artifact-store.js';

export interface BacktestV2Runner {
  readonly id: string;
  run(
    input: {
      runId: string;
      snapshotRef: { snapshotId: string; contentHash: string };
      artifactRefs: readonly ArtifactRef[];
    },
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface BacktestV2SnapshotBuilder {
  build(input: {
    runId: string;
    strategyVersionId: string;
    strategyVersionHash: string;
    strategy: StrategySchemaV2;
    runConfig: RunConfig;
  }): Promise<{
    manifest: SnapshotManifest;
    snapshotRef: { snapshotId: string; contentHash: string };
    artifactRefs: readonly ArtifactRef[];
  }>;
}

export const BACKTEST_V2_SNAPSHOT_BUILDER = Symbol('BACKTEST_V2_SNAPSHOT_BUILDER');
export const BACKTEST_V2_RUNNER = Symbol('BACKTEST_V2_RUNNER');

export interface BacktestExecutionAttempt {
  attempt: number;
  maxAttempts: number;
}

export class BacktestV2RunService {
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(BacktestQueueService) private readonly queueService?: BacktestQueueService,
    @Optional() @Inject(LocalSnapshotStore) private readonly snapshotStore?: LocalSnapshotStore,
    @Optional()
    @Inject(BACKTEST_V2_SNAPSHOT_BUILDER)
    private readonly snapshotBuilder?: BacktestV2SnapshotBuilder,
    @Optional()
    @Inject(BACKTEST_V2_RUNNER)
    private readonly defaultRunner?: BacktestV2Runner,
  ) {}

  private v2SnapshotStore(): LocalSnapshotStore {
    return (
      this.snapshotStore ??
      new LocalSnapshotStore(process.env.BACKTEST_SNAPSHOT_ROOT ?? 'var/backtest')
    );
  }

  abortActiveRun(id: string): boolean {
    const controller = this.activeControllers.get(id);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  private async persistUnavailable(
    request: BacktestRunCreateV2,
    message: string,
    causeCode?: string,
  ) {
    const runId = randomUUID();
    const { runConfig } = request;
    const data = {
      id: runId,
      strategyVersionId: request.strategyVersionId,
      mode: 'V2',
      idempotencyKey: request.idempotencyKey,
      status: 'failed',
      stage: 'failed',
      progress: 100,
      periodStart: new Date(`${runConfig.startDate}T00:00:00.000Z`),
      periodEnd: new Date(`${runConfig.endDate}T00:00:00.000Z`),
      dataAsOf: new Date(runConfig.dataAsOf),
      input: {
        schemaVersion: '2',
        strategyVersionId: request.strategyVersionId,
        runConfig,
      } as Prisma.InputJsonValue,
      runConfig: runConfig as Prisma.InputJsonValue,
      warnings: [message],
      errorCode: 'DATA_UNAVAILABLE',
      errorSummary: message,
      diagnostics: { code: causeCode ?? 'DATA_UNAVAILABLE', message, path: ['snapshot'] },
      finishedAt: new Date(),
    };
    try {
      return await this.prisma.backtestJob.create({ data });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const concurrent = await this.prisma.backtestJob.findFirst({
          where: {
            mode: 'V2',
            strategyVersionId: request.strategyVersionId,
            idempotencyKey: request.idempotencyKey,
          },
        });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  async createRun(input: unknown) {
    const request = backtestRunCreateSchemaV2.parse(input);
    const existing = await this.prisma.backtestJob.findFirst({
      where: {
        mode: 'V2',
        strategyVersionId: request.strategyVersionId,
        idempotencyKey: request.idempotencyKey,
      },
    });
    if (existing) return existing;
    const strategyVersion = await this.prisma.strategyVersion.findUnique({
      where: { id: request.strategyVersionId },
    });
    if (!strategyVersion) throw new NotFoundException('策略版本不存在');
    if (strategyVersion.schemaVersion !== 2)
      throw new BadRequestException('V2 Run 只能使用 schemaVersion=2 的策略版本');
    const parsedStrategy = strategySchemaV2.parse(strategyVersion.schema);
    const strategy: StrategySchemaV2 = {
      ...parsedStrategy,
      entry: parsedStrategy.entry as StrategySchemaV2['entry'],
      exit: parsedStrategy.exit as StrategySchemaV2['exit'],
      execution: parsedStrategy.execution as StrategySchemaV2['execution'],
    };
    const runConfig = runConfigSchemaV2.parse(request.runConfig);
    const validation = validateStrategyRunConfig(strategy, runConfig);
    if (!validation.valid) {
      const firstError = validation.errors[0];
      if (!firstError) throw new BadRequestException('RunConfig 校验失败');
      throw new BadRequestException({
        code: firstError.code,
        message: firstError.message,
        path: firstError.path,
      });
    }
    if (!this.snapshotBuilder)
      return this.persistUnavailable(request, 'Snapshot Builder 未配置，Run 未进入执行队列');

    let built: Awaited<ReturnType<BacktestV2SnapshotBuilder['build']>>;
    try {
      built = await this.snapshotBuilder.build({
        runId: randomUUID(),
        strategyVersionId: request.strategyVersionId,
        strategyVersionHash: hashCanonicalManifest(strategy),
        strategy,
        runConfig,
      });
      if (built.manifest.status !== 'finalized' || !built.snapshotRef.contentHash)
        throw new Error('Snapshot Builder 未返回 finalized Snapshot');
      if (
        built.manifest.contentHash !== built.snapshotRef.contentHash ||
        built.snapshotRef.snapshotId !== built.manifest.contentHash
      )
        throw new Error('Snapshot Builder 返回的 contentHash 不一致');
      if (built.artifactRefs.length === 0) throw new Error('Snapshot Builder 未返回 ArtifactRef');
    } catch (error) {
      return this.persistUnavailable(
        request,
        error instanceof Error ? error.message : 'Snapshot Builder 不可用',
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : undefined,
      );
    }

    const { manifest } = built;
    const runId = manifest.runId;
    const data = {
      id: runId,
      strategyVersionId: request.strategyVersionId,
      mode: 'V2',
      idempotencyKey: request.idempotencyKey,
      status: 'queued',
      stage: 'snapshot-finalized',
      periodStart: new Date(`${runConfig.startDate}T00:00:00.000Z`),
      periodEnd: new Date(`${runConfig.endDate}T00:00:00.000Z`),
      dataAsOf: new Date(runConfig.dataAsOf),
      input: {
        schemaVersion: '2',
        strategyVersionId: request.strategyVersionId,
        snapshotId: built.snapshotRef.snapshotId,
        runConfig,
      } as Prisma.InputJsonValue,
      runConfig: runConfig as Prisma.InputJsonValue,
      snapshotId: built.snapshotRef.snapshotId,
      snapshotManifest: manifest as unknown as Prisma.InputJsonValue,
      warnings: manifest.quality.warnings,
    };
    try {
      const created = await this.prisma.backtestJob.create({ data });
      return this.queueService?.ensureEnqueued(created.id) ?? created;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const concurrent = await this.prisma.backtestJob.findFirst({
          where: {
            mode: 'V2',
            strategyVersionId: request.strategyVersionId,
            idempotencyKey: request.idempotencyKey,
          },
        });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  async runV2(id: string, runner?: BacktestV2Runner, execution?: BacktestExecutionAttempt) {
    const selectedRunner = runner ?? this.defaultRunner;
    const job = await this.prisma.backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (job.mode !== 'V2') throw new BadRequestException('该任务不是 V2 Run');
    if (['succeeded', 'cancelled'].includes(job.status)) return job;
    if (!execution && job.status !== 'queued') return job;
    if (execution && job.cancelRequestedAt)
      return this.prisma.backtestJob.update({
        where: { id },
        data: { status: 'cancelled', stage: 'cancelled', progress: 100, finishedAt: new Date() },
      });

    if (execution) {
      const claimed = await this.prisma.backtestJob.updateMany({
        where: {
          id,
          mode: 'V2',
          status: { in: ['queued', 'running'] },
          executionAttempt: { lt: execution.attempt },
          cancelRequestedAt: null,
        },
        data: {
          status: 'running',
          stage: 'running',
          progress: 5,
          executionAttempt: execution.attempt,
          startedAt: job.startedAt ?? new Date(),
          engineVersion: selectedRunner?.id ?? 'v2-runner-unconfigured',
          errorCode: null,
          errorSummary: null,
          diagnostics: Prisma.JsonNull,
        },
      });
      if (claimed.count !== 1) return this.prisma.backtestJob.findUnique({ where: { id } });
    } else {
      try {
        await this.prisma.backtestJob.update({
          where: { id, status: 'queued' },
          data: {
            status: 'running',
            stage: 'running',
            progress: 5,
            startedAt: new Date(),
            engineVersion: selectedRunner?.id ?? 'v2-runner-unconfigured',
          },
        });
      } catch {
        const current = await this.prisma.backtestJob.findUnique({ where: { id } });
        if (current && current.status !== 'queued') return current;
        throw new Error('V2 Run 无法领取');
      }
    }

    const controller = new AbortController();
    this.activeControllers.set(id, controller);
    try {
      if (!selectedRunner) throw new BadRequestException('V2 Runner 未配置');
      const persistedSnapshot = job.snapshotManifest as unknown as SnapshotManifest | null;
      const snapshot = persistedSnapshot ?? (await this.v2SnapshotStore().retry(id));
      if (snapshot.status !== 'finalized')
        throw new BadRequestException('Run Snapshot 尚未 finalized');
      if (!job.snapshotId || !snapshot.contentHash || job.snapshotId !== snapshot.contentHash)
        throw new BadRequestException('Run Snapshot contentHash 不匹配');
      const result = await selectedRunner.run(
        {
          runId: id,
          snapshotRef: { snapshotId: job.snapshotId, contentHash: snapshot.contentHash },
          artifactRefs: snapshot.artifacts,
        },
        controller.signal,
      );
      if (controller.signal.aborted) throw new BadRequestException('回测已取消');
      const parsedResult = backtestResultSchemaV2.parse(result);
      if (parsedResult.runId !== id || parsedResult.snapshotId !== snapshot.contentHash) {
        throw new BadRequestException('V2 Result 与 Run Snapshot 身份不匹配');
      }
      if (!parsedResult.resultChecksum)
        throw new BadRequestException('V2 Result 缺少 canonical resultChecksum');
      const committed = await this.prisma.backtestJob.updateMany({
        where: execution
          ? {
              id,
              mode: 'V2',
              status: 'running',
              executionAttempt: execution.attempt,
              cancelRequestedAt: null,
            }
          : { id, mode: 'V2', status: 'running', cancelRequestedAt: null },
        data: {
          status: 'succeeded',
          stage: 'succeeded',
          progress: 100,
          finishedAt: new Date(),
          result: parsedResult,
          resultChecksum: parsedResult.resultChecksum,
        },
      });
      if (committed.count === 0) return this.prisma.backtestJob.findUnique({ where: { id } });
      return this.prisma.backtestJob.findUnique({ where: { id } });
    } catch (error) {
      const current = await this.prisma.backtestJob.findUnique({ where: { id } });
      if (current?.status === 'cancelled' || current?.cancelRequestedAt) {
        if (current.status === 'cancelled') return current;
        return this.prisma.backtestJob.update({
          where: { id },
          data: { status: 'cancelled', stage: 'cancelled', progress: 100, finishedAt: new Date() },
        });
      }
      const code = error instanceof BadRequestException ? 'RULE_REJECTED' : 'INTERNAL_ERROR';
      const summary = error instanceof Error ? error.message.slice(0, 500) : 'V2 Runner 执行失败';
      const diagnostics = { code, message: summary, path: ['run'] };
      if (
        execution &&
        execution.attempt < execution.maxAttempts &&
        !(error instanceof BadRequestException)
      ) {
        await this.prisma.backtestJob.updateMany({
          where: { id, mode: 'V2', status: 'running', executionAttempt: execution.attempt },
          data: {
            status: 'queued',
            stage: 'queued',
            progress: 0,
            errorCode: code,
            errorSummary: summary,
            diagnostics,
          },
        });
        throw error;
      }
      await this.prisma.backtestJob.updateMany({
        where: execution
          ? { id, mode: 'V2', status: 'running', executionAttempt: execution.attempt }
          : { id, mode: 'V2', status: 'running' },
        data: {
          status: 'failed',
          stage: 'failed',
          progress: 100,
          finishedAt: new Date(),
          errorCode: code,
          errorSummary: summary,
          diagnostics,
        },
      });
      if (execution) throw error;
      return this.prisma.backtestJob.findUnique({ where: { id } });
    } finally {
      this.activeControllers.delete(id);
    }
  }

  async retryRun(id: string) {
    const job = await this.prisma.backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (job.mode !== 'V2') throw new BadRequestException('该任务不是 V2 Run');
    if (job.status === 'succeeded') return job;
    if (job.status !== 'failed') throw new BadRequestException('只有 failed Run 可以 retry');
    const retried = await this.prisma.backtestJob.update({
      where: { id, status: 'failed' },
      data: {
        status: 'queued',
        stage: 'queued',
        progress: 0,
        executionAttempt: 0,
        cancelRequestedAt: null,
        startedAt: null,
        finishedAt: null,
        errorCode: null,
        errorSummary: null,
        diagnostics: Prisma.JsonNull,
      },
    });
    return this.queueService?.ensureEnqueued(id) ?? retried;
  }
}
